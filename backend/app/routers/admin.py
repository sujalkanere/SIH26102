"""Admin operations: upload, synthetic generation, detection runs (FR-DIM, FR-API)."""
import hashlib

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .. import ingestion, models, schemas, security
from ..database import get_db
from ..detection import synthetic
from ..detection.pipeline import run_detection

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/upload")
async def upload_works(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(security.require("upload_data")),
):
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Only .csv uploads are supported")
    content = await file.read()
    if len(content) > ingestion.MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "file size exceeds limit of 50MB")

    records, errors = ingestion.parse_works_csv(content)
    ingestion.upsert_works(db, records)

    history = models.UploadHistory(
        user_id=user.id,
        filename=file.filename,
        file_hash=hashlib.sha256(content).hexdigest(),
        file_size_bytes=len(content),
        records_total=len(records) + len({e["row_number"] for e in errors}),
        records_valid=len(records),
        records_rejected=len({e["row_number"] for e in errors}),
        validation_errors=errors[:100],
    )
    db.add(history)
    security.record_audit(
        db, user, "DATA_UPLOAD", resource_type="upload", resource_id=history.id,
        new_value={"filename": file.filename, "records_valid": len(records)},
    )
    db.commit()

    if records:
        run_detection(db, triggered_by=user.id)
    return {
        "upload_id": history.id,
        "records_parsed": history.records_total,
        "records_valid": history.records_valid,
        "records_rejected": history.records_rejected,
        "validation_errors": errors[:100],
        "ingestion_timestamp": history.uploaded_at.isoformat(),
    }


@router.post("/generate-synthetic")
def generate_synthetic(
    payload: schemas.SyntheticRequest,
    db: Session = Depends(get_db),
    user: models.User = Depends(security.require("upload_data")),
):
    dataset = synthetic.generate_dataset(
        num_constituencies=payload.num_constituencies,
        works_per_constituency=payload.num_works_per_constituency,
        anomaly_rate=payload.anomaly_rate,
        seed=payload.seed,
    )
    load_dataset(db, dataset)
    security.record_audit(
        db, user, "SYNTHETIC_GENERATION", resource_type="dataset",
        new_value={"works": len(dataset["works"]), "seed": payload.seed},
    )
    db.commit()
    result = run_detection(db, triggered_by=user.id)
    return {
        "constituencies": len(dataset["constituencies"]),
        "works": len(dataset["works"]),
        "fund_releases": len(dataset["fund_releases"]),
        "injected_labels": len(dataset["labels"]),
        **result,
    }


@router.post("/run-detection")
def trigger_detection(
    db: Session = Depends(get_db),
    user: models.User = Depends(security.require("upload_data")),
):
    result = run_detection(db, triggered_by=user.id)
    security.record_audit(db, user, "DETECTION_RUN", resource_type="detection_run",
                          resource_id=result["run_id"], new_value=result)
    db.commit()
    return result


@router.get("/upload-history")
def upload_history(
    db: Session = Depends(get_db),
    user: models.User = Depends(security.require("upload_data")),
):
    rows = db.scalars(select(models.UploadHistory).order_by(models.UploadHistory.uploaded_at.desc()))
    return {
        "data": [
            {
                "id": r.id, "filename": r.filename, "records_valid": r.records_valid,
                "records_rejected": r.records_rejected, "status": r.status,
                "uploaded_at": r.uploaded_at.isoformat(),
            }
            for r in rows
        ]
    }


def load_dataset(db: Session, dataset: dict) -> None:
    """Replace all analytical data with the supplied dataset (demo reset)."""
    for table in (models.DuplicatePair, models.ConstituencyRiskScore, models.Anomaly,
                  models.Work, models.FundRelease, models.Constituency):
        db.execute(delete(table))
    for constituency in dataset["constituencies"]:
        ingestion.upsert_constituency(
            db, constituency["name"], constituency["state"], constituency.get("district", ""),
            constituency.get("mp_name", ""), constituency.get("mp_type", "LOK_SABHA"),
        )
    ingestion.upsert_works(db, dataset["works"])
    ingestion.upsert_fund_releases(db, dataset["fund_releases"])
    db.commit()
