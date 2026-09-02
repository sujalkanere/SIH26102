"""Reusable, scope-aware read helpers shared by every router (DRY)."""
from __future__ import annotations

from collections import defaultdict
from math import ceil

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from . import models, schemas
from .security import scope_filter

RESOLVED_STATUSES = ("RESOLVED", "FALSE_POSITIVE")


def paginate(query: Select, db: Session, page: int, per_page: int) -> tuple[list, schemas.Pagination]:
    """Apply LIMIT/OFFSET and build the pagination envelope."""
    per_page = max(1, min(per_page, 100))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = list(db.scalars(query.limit(per_page).offset((page - 1) * per_page)))
    return rows, schemas.Pagination(
        page=page,
        per_page=per_page,
        total_records=total,
        total_pages=max(1, ceil(total / per_page)),
    )


def scoped_works(db: Session, user: models.User) -> Select:
    """Base works query joined to constituencies and restricted to user scope."""
    query = select(models.Work).join(
        models.Constituency, models.Work.constituency_id == models.Constituency.id
    )
    criterion = scope_filter(user)
    return query.where(criterion) if criterion is not None else query


def scoped_anomalies(db: Session, user: models.User) -> Select:
    query = select(models.Anomaly).join(
        models.Constituency, models.Anomaly.constituency_id == models.Constituency.id
    )
    criterion = scope_filter(user)
    return query.where(criterion) if criterion is not None else query


def scoped_constituencies(db: Session, user: models.User) -> Select:
    query = select(models.Constituency)
    criterion = scope_filter(user)
    return query.where(criterion) if criterion is not None else query


def constituency_lookup(db: Session) -> dict[str, models.Constituency]:
    return {c.id: c for c in db.scalars(select(models.Constituency))}


def work_to_schema(work: models.Work, constituency: models.Constituency | None) -> schemas.WorkOut:
    return schemas.WorkOut(
        work_id=work.work_id,
        work_description=work.work_description,
        work_category=work.work_category,
        sanctioned_amount=work.sanctioned_amount,
        actual_expenditure=work.actual_expenditure,
        cost_overrun_percentage=work.cost_overrun_percentage,
        sanction_date=work.sanction_date,
        expected_completion_date=work.expected_completion_date,
        completion_date=work.completion_date,
        work_status=work.work_status,
        implementing_agency=work.implementing_agency,
        financial_year=work.financial_year,
        risk_score=work.risk_score,
        risk_tier=work.risk_tier,
        risk_components=work.risk_components or {},
        constituency_name=constituency.name if constituency else "",
        state=constituency.state if constituency else "",
    )


def anomaly_to_schema(
    anomaly: models.Anomaly,
    constituency: models.Constituency | None,
    work_keys: dict[str, str],
) -> schemas.AnomalyOut:
    return schemas.AnomalyOut(
        id=anomaly.id,
        anomaly_type=anomaly.anomaly_type,
        severity=anomaly.severity,
        status=anomaly.status,
        confidence_score=anomaly.confidence_score,
        detection_method=anomaly.detection_method,
        details=anomaly.details or {},
        financial_year=anomaly.financial_year,
        detected_at=anomaly.detected_at,
        constituency_name=constituency.name if constituency else "",
        state=constituency.state if constituency else "",
        work_key=work_keys.get(anomaly.work_id) if anomaly.work_id else None,
    )


def work_key_lookup(db: Session) -> dict[str, str]:
    return {row[0]: row[1] for row in db.execute(select(models.Work.id, models.Work.work_id))}


def active_anomaly_counts(db: Session) -> dict[str, int]:
    """Anomalies per constituency excluding resolved/false-positive ones."""
    counts: dict[str, int] = defaultdict(int)
    rows = db.execute(
        select(models.Anomaly.constituency_id, func.count())
        .where(models.Anomaly.status.notin_(RESOLVED_STATUSES))
        .group_by(models.Anomaly.constituency_id)
    )
    for constituency_id, count in rows:
        counts[constituency_id] = count
    return counts


def constituency_rollup(db: Session, financial_year: str | None = None) -> dict[str, dict]:
    """Aggregate per-year risk rows into one summary per constituency."""
    query = select(models.ConstituencyRiskScore)
    if financial_year and financial_year != "ALL":
        query = query.where(models.ConstituencyRiskScore.financial_year == financial_year)

    rollup: dict[str, dict] = {}
    for row in db.scalars(query):
        entry = rollup.setdefault(
            row.constituency_id,
            {"risk_scores": [], "total_works": 0, "high_risk_works": 0,
             "total_funds_released": 0.0, "total_expenditure": 0.0},
        )
        entry["risk_scores"].append(row.risk_score)
        entry["total_works"] += row.total_works
        entry["high_risk_works"] += row.high_risk_works
        entry["total_funds_released"] += row.total_funds_released
        entry["total_expenditure"] += row.total_expenditure
    return rollup


def build_constituency_summaries(
    db: Session, user: models.User, financial_year: str | None = None
) -> list[schemas.ConstituencyOut]:
    from .detection.rules import tier_for_score, utilization_rate

    rollup = constituency_rollup(db, financial_year)
    anomaly_counts = active_anomaly_counts(db)
    summaries = []
    for constituency in db.scalars(scoped_constituencies(db, user)):
        entry = rollup.get(constituency.id)
        scores = entry["risk_scores"] if entry else []
        risk_score = int(round(sum(scores) / len(scores))) if scores else 0
        released = entry["total_funds_released"] if entry else 0.0
        spent = entry["total_expenditure"] if entry else 0.0
        summaries.append(
            schemas.ConstituencyOut(
                name=constituency.name,
                state=constituency.state,
                district=constituency.district,
                mp_name=constituency.mp_name,
                risk_score=risk_score,
                risk_tier=tier_for_score(risk_score),
                total_works=entry["total_works"] if entry else 0,
                high_risk_works=entry["high_risk_works"] if entry else 0,
                fund_utilization_rate=round(utilization_rate(spent, released), 2),
                total_funds_released=round(released, 2),
                total_expenditure=round(spent, 2),
                active_anomalies=anomaly_counts.get(constituency.id, 0),
            )
        )
    return sorted(summaries, key=lambda c: c.risk_score, reverse=True)
