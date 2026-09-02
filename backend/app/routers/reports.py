"""Report generation endpoints (FR-DVZ-004)."""
import csv
import io

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import select

from datetime import datetime

from sqlalchemy.orm import Session

from .. import models, queries, schemas, security
from ..database import get_db

router = APIRouter(prefix="/reports", tags=["reports"])

CSV_COLUMNS = [
    "work_id", "constituency_name", "state", "work_category", "work_description",
    "sanctioned_amount", "actual_expenditure", "cost_overrun_percentage",
    "work_status", "financial_year", "risk_score", "risk_tier",
]


def _collect_works(db: Session, user: models.User, payload: schemas.ReportRequest) -> list[schemas.WorkOut]:
    query = queries.scoped_works(db, user)
    if payload.scope == "STATE" and payload.scope_id:
        query = query.where(models.Constituency.state == payload.scope_id)
    elif payload.scope == "CONSTITUENCY" and payload.scope_id:
        query = query.where(models.Constituency.name == payload.scope_id)
    if payload.financial_year and payload.financial_year != "ALL":
        query = query.where(models.Work.financial_year == payload.financial_year)

    lookup = queries.constituency_lookup(db)
    works = db.scalars(query.order_by(models.Work.risk_score.desc()))
    return [queries.work_to_schema(w, lookup.get(w.constituency_id)) for w in works]


def _csv_response(works: list[schemas.WorkOut], filename: str) -> StreamingResponse:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=CSV_COLUMNS, extrasaction="ignore")
    writer.writeheader()
    for work in works:
        writer.writerow(work.model_dump())
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}.csv"'},
    )


def _pdf_response(
    works: list[schemas.WorkOut], title: str, generated_by: str, filename: str
) -> StreamingResponse:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, title=title)
    styles = getSampleStyleSheet()
    story = [
        Paragraph("MPLADS Sentinel — Anomaly & Risk Report", styles["Title"]),
        Paragraph(title, styles["Heading2"]),
        Paragraph(
            f"Generated {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')} by {generated_by}",
            styles["Normal"],
        ),
        Spacer(1, 16),
    ]

    total_sanctioned = sum(w.sanctioned_amount for w in works)
    total_spent = sum(w.actual_expenditure for w in works)
    high_risk = [w for w in works if w.risk_tier in ("HIGH", "CRITICAL")]
    summary_rows = [
        ["Metric", "Value"],
        ["Works in scope", f"{len(works):,}"],
        ["Total sanctioned", f"Rs {total_sanctioned / 1e7:.2f} Cr"],
        ["Total expenditure", f"Rs {total_spent / 1e7:.2f} Cr"],
        ["High/Critical risk works", f"{len(high_risk):,}"],
    ]
    story += [
        Paragraph("Executive Summary", styles["Heading3"]),
        _styled_table(summary_rows, [220, 220]),
        Spacer(1, 16),
        Paragraph("Top 20 Highest-Risk Works", styles["Heading3"]),
    ]

    top_rows = [["Work ID", "Constituency", "Category", "Overrun %", "Risk", "Tier"]]
    for work in works[:20]:
        top_rows.append([
            work.work_id, work.constituency_name[:18], work.work_category[:14],
            f"{work.cost_overrun_percentage:.1f}", str(work.risk_score), work.risk_tier,
        ])
    story += [
        _styled_table(top_rows, [80, 105, 95, 65, 45, 60]),
        Spacer(1, 16),
        Paragraph(
            "Methodology: risk scores combine cost-overrun, delay, duplicate-detection, "
            "pattern and fund-utilisation components per SRS FR-RSE-001.",
            styles["Italic"],
        ),
    ]
    doc.build(story)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}.pdf"'},
    )


def _styled_table(rows: list[list[str]], widths: list[int]) -> Table:
    table = Table(rows, colWidths=widths)
    table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a8a")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
        ])
    )
    return table


@router.post("/generate")
def generate_report(
    payload: schemas.ReportRequest,
    db: Session = Depends(get_db),
    user: models.User = Depends(security.require("generate_reports")),
):
    if payload.scope not in ("NATIONAL", "STATE", "CONSTITUENCY"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown report scope")
    if payload.scope == "CONSTITUENCY" and payload.scope_id:
        constituency = db.scalar(
            select(models.Constituency).where(models.Constituency.name == payload.scope_id)
        )
        if constituency is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Constituency not found")
        security.assert_in_scope(user, constituency)

    works = _collect_works(db, user, payload)
    label = payload.scope_id or "National"
    filename = f"mplads_{label.lower().replace(' ', '_')}_{payload.financial_year}"
    security.record_audit(
        db, user, "REPORT_GENERATED", resource_type="report", resource_id=filename,
        new_value={"scope": payload.scope, "format": payload.format, "works": len(works)},
    )
    db.commit()

    if payload.format.upper() == "CSV":
        return _csv_response(works, filename)
    return _pdf_response(works, f"{payload.scope.title()} scope: {label}", user.username, filename)
