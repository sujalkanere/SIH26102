"""CSV validation and persistence for uploads and synthetic data (FR-DIM-001)."""
from __future__ import annotations

import csv
import io
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models

MAX_UPLOAD_BYTES = 50 * 1024 * 1024

WORK_STATUSES = {"SANCTIONED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "ON_HOLD"}
CATEGORIES = {
    "EDUCATION", "HEALTH", "DRINKING_WATER", "SANITATION", "ROADS",
    "COMMUNITY_ASSETS", "POWER", "SPORTS", "OTHER",
}
REQUIRED_COLUMNS = [
    "work_id", "constituency_name", "state", "work_description", "work_category",
    "sanctioned_amount", "sanction_date", "work_status", "financial_year",
]


def parse_date(value: str | date | None) -> date | None:
    if not value:
        return None
    if isinstance(value, date):
        return value
    return datetime.strptime(str(value).strip(), "%Y-%m-%d").date()


def validate_work_row(row: dict, row_number: int) -> tuple[dict | None, list[dict]]:
    """Validate one CSV row. Returns (clean_record, errors)."""
    errors: list[dict] = []

    def fail(column: str, message: str) -> None:
        errors.append({"row_number": row_number, "column": column, "error_message": message})

    for column in REQUIRED_COLUMNS:
        if not str(row.get(column) or "").strip():
            fail(column, "missing required value")
    if errors:
        return None, errors

    if row["work_category"] not in CATEGORIES:
        fail("work_category", f"must be one of {sorted(CATEGORIES)}")
    if row["work_status"] not in WORK_STATUSES:
        fail("work_status", f"must be one of {sorted(WORK_STATUSES)}")

    try:
        sanctioned = float(row["sanctioned_amount"])
        if sanctioned <= 0:
            fail("sanctioned_amount", "must be greater than 0")
    except ValueError:
        sanctioned = 0.0
        fail("sanctioned_amount", "must be numeric")

    try:
        actual = float(row.get("actual_expenditure") or 0)
        if actual < 0:
            fail("actual_expenditure", "must be >= 0")
    except ValueError:
        actual = 0.0
        fail("actual_expenditure", "must be numeric")

    dates: dict[str, date | None] = {}
    for column in ("sanction_date", "expected_completion_date", "completion_date"):
        try:
            dates[column] = parse_date(row.get(column))
        except ValueError:
            dates[column] = None
            fail(column, "must use YYYY-MM-DD format")

    if errors:
        return None, errors

    return {
        "work_id": row["work_id"].strip(),
        "constituency_name": row["constituency_name"].strip(),
        "state": row["state"].strip(),
        "district_name": (row.get("district_name") or "").strip(),
        "work_description": row["work_description"].strip(),
        "work_category": row["work_category"],
        "sanctioned_amount": sanctioned,
        "actual_expenditure": actual,
        "sanction_date": dates["sanction_date"],
        "expected_completion_date": dates["expected_completion_date"],
        "completion_date": dates["completion_date"],
        "work_status": row["work_status"],
        "implementing_agency": (row.get("implementing_agency") or "").strip(),
        "financial_year": row["financial_year"].strip(),
        "latitude": float(row["latitude"]) if row.get("latitude") else None,
        "longitude": float(row["longitude"]) if row.get("longitude") else None,
    }, []


def parse_works_csv(content: bytes) -> tuple[list[dict], list[dict]]:
    reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig")))
    valid, errors = [], []
    for index, row in enumerate(reader, start=2):  # row 1 is the header
        record, row_errors = validate_work_row(row, index)
        if record:
            valid.append(record)
        errors.extend(row_errors)
    return valid, errors


def upsert_constituency(db: Session, name: str, state: str, district: str = "", mp_name: str = "",
                        mp_type: str = "LOK_SABHA") -> models.Constituency:
    constituency = db.scalar(select(models.Constituency).where(models.Constituency.name == name))
    if constituency is None:
        constituency = models.Constituency(
            name=name, state=state, district=district or name, mp_name=mp_name or f"MP {name}",
            mp_type=mp_type,
        )
        db.add(constituency)
        db.flush()
    return constituency


def upsert_works(db: Session, records: list[dict]) -> int:
    """Insert or update works keyed on work_id (FR-DIM-001 dedup rule)."""
    existing = {w.work_id: w for w in db.scalars(select(models.Work))}
    for record in records:
        constituency = upsert_constituency(
            db, record["constituency_name"], record["state"], record.get("district_name", "")
        )
        fields = {k: v for k, v in record.items() if k not in ("constituency_name", "state", "district_name")}
        work = existing.get(record["work_id"])
        if work is None:
            work = models.Work(constituency_id=constituency.id, **fields)
            db.add(work)
            existing[record["work_id"]] = work
        else:
            work.constituency_id = constituency.id
            for key, value in fields.items():
                setattr(work, key, value)
    db.flush()
    return len(records)


def upsert_fund_releases(db: Session, records: list[dict]) -> int:
    existing = {r.release_id for r in db.scalars(select(models.FundRelease))}
    for record in records:
        if record["release_id"] in existing:
            continue
        constituency = db.scalar(
            select(models.Constituency).where(models.Constituency.name == record["constituency_name"])
        )
        if constituency is None:
            continue
        db.add(
            models.FundRelease(
                release_id=record["release_id"],
                constituency_id=constituency.id,
                financial_year=record["financial_year"],
                installment_number=record["installment_number"],
                amount_released=record["amount_released"],
                release_date=parse_date(record["release_date"]),
            )
        )
    db.flush()
    return len(records)
