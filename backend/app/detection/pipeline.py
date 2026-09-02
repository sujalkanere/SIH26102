"""Detection pipeline: the only place that turns pure findings into DB rows.

Keeping persistence here (and decisions in rules.py) satisfies the
"separate decisions from actions" principle and keeps rules unit-testable.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .. import models
from . import rules

PATTERN_TYPES = set(rules._PATTERN_POINTS)
FUND_TYPES = {"LOW_UTILIZATION", "OVER_UTILIZATION", "FUND_UTILIZATION_ANOMALY", "SUDDEN_UTILIZATION_SHIFT"}


def _work_to_dict(work: models.Work, constituency: models.Constituency) -> dict:
    return {
        "work_id": work.work_id,
        "constituency_name": constituency.name,
        "state": constituency.state,
        "work_description": work.work_description,
        "work_category": work.work_category,
        "sanctioned_amount": work.sanctioned_amount,
        "actual_expenditure": work.actual_expenditure,
        "sanction_date": work.sanction_date,
        "expected_completion_date": work.expected_completion_date,
        "completion_date": work.completion_date,
        "work_status": work.work_status,
        "implementing_agency": work.implementing_agency,
        "financial_year": work.financial_year,
        "latitude": work.latitude,
        "longitude": work.longitude,
    }


def _fund_summaries(db: Session) -> list[dict]:
    """Aggregate expenditure vs releases per (constituency, financial year)."""
    constituencies = {c.id: c for c in db.scalars(select(models.Constituency))}
    spend: dict[tuple[str, str], float] = defaultdict(float)
    for work in db.scalars(select(models.Work)):
        spend[(work.constituency_id, work.financial_year)] += work.actual_expenditure

    released: dict[tuple[str, str], float] = defaultdict(float)
    for release in db.scalars(select(models.FundRelease)):
        released[(release.constituency_id, release.financial_year)] += release.amount_released

    summaries = []
    for key in set(spend) | set(released):
        constituency = constituencies.get(key[0])
        if not constituency:
            continue
        summaries.append(
            {
                "constituency_id": key[0],
                "constituency": constituency.name,
                "state": constituency.state,
                "financial_year": key[1],
                "total_expenditure": round(spend.get(key, 0.0), 2),
                "total_funds_released": round(released.get(key, 0.0), 2),
            }
        )
    return summaries


def run_detection(db: Session, reference_date: date | None = None, triggered_by: str | None = None) -> dict:
    """Recompute all anomalies and risk scores. Idempotent: clears prior
    machine-generated anomalies (audit log entries are never touched)."""
    reference_date = reference_date or date.today()
    run = models.DetectionRun(triggered_by=triggered_by, status="RUNNING")
    db.add(run)
    db.flush()

    constituencies = {c.id: c for c in db.scalars(select(models.Constituency))}
    works = list(db.scalars(select(models.Work)))
    work_by_key = {w.work_id: w for w in works}
    payload = [_work_to_dict(w, constituencies[w.constituency_id]) for w in works]

    db.execute(delete(models.DuplicatePair))
    db.execute(delete(models.Anomaly))

    findings = (
        rules.detect_cost_overruns(payload)
        + rules.detect_duplicates(payload)
        + rules.detect_delays(payload, reference_date)
        + rules.detect_patterns(payload)
        + rules.detect_fund_utilization(_fund_summaries(db))
    )

    constituency_id_by_name = {c.name: c.id for c in constituencies.values()}
    for finding in findings:
        work = work_by_key.get(finding.work_key) if finding.work_key else None
        constituency_id = work.constituency_id if work else constituency_id_by_name.get(finding.constituency)
        if not constituency_id:
            continue
        anomaly = models.Anomaly(
            work_id=work.id if work else None,
            constituency_id=constituency_id,
            anomaly_type=finding.anomaly_type,
            severity=finding.severity,
            confidence_score=finding.confidence_score,
            detection_method=finding.detection_method,
            details=finding.details,
            financial_year=finding.financial_year,
        )
        db.add(anomaly)
        if finding.anomaly_type == "DUPLICATE_WORK":
            db.flush()
            twin = work_by_key.get(finding.details["work_id_b"])
            if work and twin:
                low, high = sorted([work.id, twin.id])
                db.add(
                    models.DuplicatePair(
                        work_id_a=low,
                        work_id_b=high,
                        text_similarity=finding.details["text_similarity"],
                        amount_similarity=finding.details["amount_similarity"],
                        composite_score=finding.details["composite_score"],
                        anomaly_id=anomaly.id,
                    )
                )
    db.flush()
    _apply_risk_scores(db, findings, reference_date)

    run.status = "COMPLETED"
    run.works_analyzed = len(works)
    run.anomalies_detected = len(findings)
    run.completed_at = datetime.utcnow()
    db.commit()
    return {
        "run_id": run.id,
        "works_analyzed": run.works_analyzed,
        "anomalies_detected": run.anomalies_detected,
    }


def _apply_risk_scores(db: Session, findings: list[rules.Finding], reference_date: date) -> None:
    """Score every work and constituency from the freshly computed findings."""
    duplicate_score: dict[str, int] = {}
    patterns_by_scope: dict[tuple[str, str], list[str]] = defaultdict(list)
    fund_anomaly_scopes: set[tuple[str, str]] = set()

    for finding in findings:
        if finding.anomaly_type == "DUPLICATE_WORK":
            score = finding.details["composite_score"]
            for key in (finding.details["work_id_a"], finding.details["work_id_b"]):
                duplicate_score[key] = max(duplicate_score.get(key, 0), score)
        elif finding.anomaly_type in PATTERN_TYPES:
            patterns_by_scope[(finding.constituency, finding.financial_year)].append(finding.anomaly_type)
        elif finding.anomaly_type in FUND_TYPES:
            fund_anomaly_scopes.add((finding.constituency, finding.financial_year))

    constituencies = {c.id: c for c in db.scalars(select(models.Constituency))}
    scores_by_scope: dict[tuple[str, str], list[int]] = defaultdict(list)

    for work in db.scalars(select(models.Work)):
        constituency = constituencies[work.constituency_id]
        scope = (constituency.name, work.financial_year)
        overrun = rules.cost_overrun_percentage(work.sanctioned_amount, work.actual_expenditure)
        work.cost_overrun_percentage = round(overrun, 2)

        delay_days = 0
        if work.expected_completion_date:
            end = work.completion_date or reference_date
            delay_days = max(0, (end - work.expected_completion_date).days)

        result = rules.score_work(
            overrun_pct=overrun,
            delay_days=delay_days,
            duplicate_score=duplicate_score.get(work.work_id, 0),
            pattern_types=patterns_by_scope.get(scope, []),
            has_fund_anomaly=scope in fund_anomaly_scopes,
        )
        work.risk_score = result["risk_score"]
        work.risk_tier = result["risk_tier"]
        work.risk_components = result["components"]
        scores_by_scope[scope].append(result["risk_score"])

    fund_lookup = {(s["constituency"], s["financial_year"]): s for s in _fund_summaries(db)}
    db.execute(delete(models.ConstituencyRiskScore))
    name_to_id = {c.name: c.id for c in constituencies.values()}

    for (name, year), scores in scores_by_scope.items():
        summary = rules.score_constituency(scores, (name, year) in fund_anomaly_scopes)
        funds = fund_lookup.get((name, year), {})
        released = funds.get("total_funds_released", 0.0)
        spent = funds.get("total_expenditure", 0.0)
        db.add(
            models.ConstituencyRiskScore(
                constituency_id=name_to_id[name],
                financial_year=year,
                risk_score=summary["risk_score"],
                risk_tier=summary["risk_tier"],
                total_works=summary["total_works"],
                high_risk_works=summary["high_risk_works"],
                fund_utilization_rate=round(rules.utilization_rate(spent, released), 2),
                total_funds_released=released,
                total_expenditure=spent,
            )
        )
