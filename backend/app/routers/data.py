"""Works, constituencies and anomaly endpoints (FR-API-001, FR-DVZ-002/003)."""
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, queries, schemas, security
from ..database import get_db

router = APIRouter(tags=["data"])

SORTABLE = {
    "risk_score": models.Work.risk_score,
    "sanctioned_amount": models.Work.sanctioned_amount,
    "sanction_date": models.Work.sanction_date,
    "cost_overrun_percentage": models.Work.cost_overrun_percentage,
}
ALERT_STATUSES = ("NEW", "ACKNOWLEDGED", "UNDER_REVIEW", "RESOLVED", "FALSE_POSITIVE")


@router.get("/works", response_model=schemas.WorkListResponse)
def list_works(
    page: int = 1,
    per_page: int = 25,
    constituency: str | None = None,
    state: str | None = None,
    financial_year: str | None = None,
    status_filter: str | None = Query(None, alias="status"),
    risk_tier: str | None = None,
    search: str | None = None,
    sort_by: str = "risk_score",
    sort_order: str = "desc",
    db: Session = Depends(get_db),
    user: models.User = Depends(security.require("view_works")),
):
    query = queries.scoped_works(db, user)
    if constituency:
        query = query.where(models.Constituency.name == constituency)
    if state:
        query = query.where(models.Constituency.state == state)
    if financial_year and financial_year != "ALL":
        query = query.where(models.Work.financial_year == financial_year)
    if status_filter:
        query = query.where(models.Work.work_status == status_filter)
    if risk_tier:
        query = query.where(models.Work.risk_tier == risk_tier)
    if search:
        query = query.where(models.Work.work_description.ilike(f"%{search}%"))

    column = SORTABLE.get(sort_by, models.Work.risk_score)
    query = query.order_by(column.desc() if sort_order == "desc" else column.asc())

    rows, pagination = queries.paginate(query, db, page, per_page)
    lookup = queries.constituency_lookup(db)
    return schemas.WorkListResponse(
        data=[queries.work_to_schema(w, lookup.get(w.constituency_id)) for w in rows],
        pagination=pagination,
    )


@router.get("/works/{work_key}", response_model=schemas.WorkDetail)
def get_work(
    work_key: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(security.require("view_works")),
):
    work = db.scalar(select(models.Work).where(models.Work.work_id == work_key))
    if work is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Work not found")
    constituency = db.get(models.Constituency, work.constituency_id)
    security.assert_in_scope(user, constituency)

    anomalies = list(db.scalars(select(models.Anomaly).where(models.Anomaly.work_id == work.id)))
    work_keys = {work.id: work.work_id}
    trail = db.scalars(
        select(models.AuditLog)
        .where(models.AuditLog.resource_id == work.work_id)
        .order_by(models.AuditLog.timestamp.desc())
    )
    return schemas.WorkDetail(
        work=queries.work_to_schema(work, constituency),
        anomalies=[queries.anomaly_to_schema(a, constituency, work_keys) for a in anomalies],
        audit_trail=[
            {"action": e.action, "timestamp": e.timestamp.isoformat(), "note": e.note} for e in trail
        ],
    )


@router.get("/constituencies", response_model=schemas.ConstituencyListResponse)
def list_constituencies(
    page: int = 1,
    per_page: int = 25,
    financial_year: str | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(security.require("view_constituencies")),
):
    summaries = queries.build_constituency_summaries(db, user, financial_year)
    per_page = max(1, min(per_page, 100))
    start = (page - 1) * per_page
    total = len(summaries)
    return schemas.ConstituencyListResponse(
        data=summaries[start : start + per_page],
        pagination=schemas.Pagination(
            page=page,
            per_page=per_page,
            total_records=total,
            total_pages=max(1, -(-total // per_page)),
        ),
    )


@router.get("/constituencies/{name}", response_model=schemas.ConstituencyDetail)
def get_constituency(
    name: str,
    financial_year: str | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(security.require("view_works")),
):
    constituency = db.scalar(select(models.Constituency).where(models.Constituency.name == name))
    if constituency is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Constituency not found")
    security.assert_in_scope(user, constituency)

    summaries = queries.build_constituency_summaries(db, user, financial_year)
    summary = next((s for s in summaries if s.name == name), None)
    if summary is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No analytics for this constituency")

    works = list(db.scalars(select(models.Work).where(models.Work.constituency_id == constituency.id)))
    components: dict[str, float] = defaultdict(float)
    for work in works:
        for key, value in (work.risk_components or {}).items():
            components[key] += value
    averaged = {k: round(v / len(works), 2) for k, v in components.items()} if works else {}

    timeline: dict[tuple[str, str], float] = defaultdict(float)
    for work in works:
        period = work.sanction_date.strftime("%Y-%m")
        timeline[(period, work.work_category)] += work.actual_expenditure
    timeline_rows = [
        {"period": period, "category": category, "expenditure": round(amount, 2)}
        for (period, category), amount in sorted(timeline.items())
    ]

    work_by_id = {w.id: w for w in works}
    pairs = []
    for pair in db.scalars(select(models.DuplicatePair)):
        a, b = work_by_id.get(pair.work_id_a), work_by_id.get(pair.work_id_b)
        if not (a and b):
            continue
        pairs.append(
            schemas.DuplicatePairOut(
                work_id_a=a.work_id,
                work_id_b=b.work_id,
                description_a=a.work_description,
                description_b=b.work_description,
                amount_a=a.sanctioned_amount,
                amount_b=b.sanctioned_amount,
                sanction_date_a=a.sanction_date,
                sanction_date_b=b.sanction_date,
                text_similarity=round(pair.text_similarity, 4),
                composite_score=pair.composite_score,
                severity="HIGH" if pair.composite_score >= 70 else "MEDIUM",
            )
        )

    return schemas.ConstituencyDetail(
        constituency=summary,
        risk_components=averaged,
        expenditure_timeline=timeline_rows,
        duplicate_pairs=pairs,
    )


@router.get("/anomalies", response_model=schemas.AnomalyListResponse)
def list_anomalies(
    page: int = 1,
    per_page: int = 25,
    type_filter: str | None = Query(None, alias="type"),
    severity: str | None = None,
    status_filter: str | None = Query(None, alias="status"),
    constituency: str | None = None,
    state: str | None = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(security.require("view_works")),
):
    query = queries.scoped_anomalies(db, user)
    if type_filter:
        query = query.where(models.Anomaly.anomaly_type == type_filter)
    if severity:
        query = query.where(models.Anomaly.severity == severity)
    if status_filter:
        query = query.where(models.Anomaly.status == status_filter)
    if constituency:
        query = query.where(models.Constituency.name == constituency)
    if state:
        query = query.where(models.Constituency.state == state)
    query = query.order_by(models.Anomaly.detected_at.desc())

    rows, pagination = queries.paginate(query, db, page, per_page)
    lookup = queries.constituency_lookup(db)
    work_keys = queries.work_key_lookup(db)
    return schemas.AnomalyListResponse(
        data=[queries.anomaly_to_schema(a, lookup.get(a.constituency_id), work_keys) for a in rows],
        pagination=pagination,
    )


@router.patch("/anomalies/{anomaly_id}", response_model=schemas.AnomalyOut)
def update_anomaly(
    anomaly_id: str,
    payload: schemas.AnomalyUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(security.require("manage_alerts")),
):
    if payload.status not in ALERT_STATUSES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown alert status")
    anomaly = db.get(models.Anomaly, anomaly_id)
    if anomaly is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Anomaly not found")
    constituency = db.get(models.Constituency, anomaly.constituency_id)
    security.assert_in_scope(user, constituency)

    security.record_audit(
        db, user, "ANOMALY_STATUS_CHANGE",
        resource_type="anomaly", resource_id=anomaly.id,
        old_value={"status": anomaly.status}, new_value={"status": payload.status},
        note=payload.note,
    )
    anomaly.status = payload.status
    db.commit()
    return queries.anomaly_to_schema(anomaly, constituency, queries.work_key_lookup(db))


@router.get("/audit-log")
def list_audit_log(
    limit: int = 100,
    db: Session = Depends(get_db),
    user: models.User = Depends(security.require("manage_alerts")),
):
    entries = db.scalars(
        select(models.AuditLog).order_by(models.AuditLog.timestamp.desc()).limit(min(limit, 500))
    )
    return {
        "data": [
            {
                "id": e.id,
                "action": e.action,
                "resource_type": e.resource_type,
                "resource_id": e.resource_id,
                "old_value": e.old_value,
                "new_value": e.new_value,
                "note": e.note,
                "timestamp": e.timestamp.isoformat(),
            }
            for e in entries
        ]
    }
