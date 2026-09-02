"""Aggregate analytics powering the dashboards (FR-DVZ-001, FR-API-001)."""
from collections import Counter, defaultdict

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, queries, schemas, security
from ..database import get_db
from ..detection.rules import tier_for_score

router = APIRouter(prefix="/analytics", tags=["analytics"])
HIGH_RISK_TIERS = ("HIGH", "CRITICAL")


@router.get("/national-summary", response_model=schemas.NationalSummary)
def national_summary(
    financial_year: str | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(security.require("view_works")),
):
    summaries = queries.build_constituency_summaries(db, user, financial_year)

    anomaly_query = queries.scoped_anomalies(db, user).where(
        models.Anomaly.status.notin_(queries.RESOLVED_STATUSES)
    )
    if financial_year and financial_year != "ALL":
        anomaly_query = anomaly_query.where(models.Anomaly.financial_year == financial_year)
    anomalies = list(db.scalars(anomaly_query))

    state_totals: dict[str, list[int]] = defaultdict(list)
    state_works: Counter = Counter()
    for summary in summaries:
        state_totals[summary.state].append(summary.risk_score)
        state_works[summary.state] += summary.total_works

    state_anomalies: Counter = Counter()
    lookup = queries.constituency_lookup(db)
    for anomaly in anomalies:
        constituency = lookup.get(anomaly.constituency_id)
        if constituency:
            state_anomalies[constituency.state] += 1

    state_risk = [
        {
            "state": state,
            "avg_risk_score": int(round(sum(scores) / len(scores))),
            "risk_tier": tier_for_score(sum(scores) / len(scores)),
            "total_works": state_works[state],
            "anomaly_count": state_anomalies.get(state, 0),
        }
        for state, scores in sorted(state_totals.items())
    ]

    years = sorted({row[0] for row in db.execute(select(models.Work.financial_year).distinct())})
    return schemas.NationalSummary(
        total_works=sum(s.total_works for s in summaries),
        total_expenditure=round(sum(s.total_expenditure for s in summaries), 2),
        total_funds_released=round(sum(s.total_funds_released for s in summaries), 2),
        anomalies_detected=len(anomalies),
        high_risk_constituencies=sum(1 for s in summaries if s.risk_tier in HIGH_RISK_TIERS),
        anomaly_type_distribution=dict(Counter(a.anomaly_type for a in anomalies)),
        severity_distribution=dict(Counter(a.severity for a in anomalies)),
        state_risk=state_risk,
        top_risk_constituencies=[s.model_dump() for s in summaries[:10]],
        financial_years=years,
    )


@router.get("/state-summary/{state_name}")
def state_summary(
    state_name: str,
    financial_year: str | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(security.require("view_works")),
):
    summaries = [
        s for s in queries.build_constituency_summaries(db, user, financial_year)
        if s.state.lower() == state_name.lower()
    ]
    scores = [s.risk_score for s in summaries]
    average = sum(scores) / len(scores) if scores else 0
    return {
        "state": state_name,
        "avg_risk_score": int(round(average)),
        "risk_tier": tier_for_score(average),
        "total_works": sum(s.total_works for s in summaries),
        "total_expenditure": round(sum(s.total_expenditure for s in summaries), 2),
        "constituencies": [s.model_dump() for s in summaries],
    }


@router.get("/trends")
def trends(
    metric: str = Query("anomaly_count", pattern="^(anomaly_count|avg_risk_score|expenditure)$"),
    db: Session = Depends(get_db),
    user: models.User = Depends(security.require("view_works")),
):
    """Time series grouped by financial year, one series per anomaly type or
    a single aggregate series for non-anomaly metrics."""
    points: list[dict] = []
    if metric == "anomaly_count":
        counts: Counter = Counter()
        for anomaly in db.scalars(
            queries.scoped_anomalies(db, user).where(
                models.Anomaly.status.notin_(queries.RESOLVED_STATUSES)
            )
        ):
            if anomaly.financial_year:
                counts[(anomaly.financial_year, anomaly.anomaly_type)] += 1
        points = [
            {"period": year, "series": kind, "value": count}
            for (year, kind), count in sorted(counts.items())
        ]
    else:
        buckets: dict[str, list[float]] = defaultdict(list)
        for work in db.scalars(queries.scoped_works(db, user)):
            value = work.risk_score if metric == "avg_risk_score" else work.actual_expenditure
            buckets[work.financial_year].append(value)
        for year, values in sorted(buckets.items()):
            total = sum(values)
            points.append(
                {
                    "period": year,
                    "series": metric,
                    "value": round(total / len(values), 2) if metric == "avg_risk_score" else round(total, 2),
                }
            )
    return {"metric": metric, "data": points}


@router.get("/public-summary")
def public_summary(db: Session = Depends(get_db)):
    """Anonymised aggregates for ROLE_PUBLIC / unauthenticated transparency view."""
    rows = list(db.scalars(select(models.ConstituencyRiskScore)))
    anomalies = list(
        db.scalars(select(models.Anomaly).where(models.Anomaly.status.notin_(queries.RESOLVED_STATUSES)))
    )
    scores = [r.risk_score for r in rows]
    return {
        "total_works": sum(r.total_works for r in rows),
        "total_expenditure": round(sum(r.total_expenditure for r in rows), 2),
        "total_funds_released": round(sum(r.total_funds_released for r in rows), 2),
        "anomalies_detected": len(anomalies),
        "avg_risk_score": int(round(sum(scores) / len(scores))) if scores else 0,
        "anomaly_type_distribution": dict(Counter(a.anomaly_type for a in anomalies)),
    }
