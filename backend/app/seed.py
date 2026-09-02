"""Database bootstrap: schema, seed users and demo dataset."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models, security
from .database import SessionLocal, engine
from .detection import synthetic
from .detection.pipeline import run_detection
from .routers.admin import load_dataset

# FR-AAA-001 mvp_seed_users.
SEED_USERS = [
    ("admin", "Admin@1234", "ROLE_ADMIN", None, None, "System Administrator"),
    ("ministry_user", "Ministry@1234", "ROLE_MINISTRY", None, None, "Ministry Official"),
    ("state_user", "State@1234", "ROLE_STATE_NODAL", "STATE", "Maharashtra", "Maharashtra Nodal Officer"),
    ("district_user", "District@1234", "ROLE_DISTRICT", "DISTRICT", "Pune", "Pune District Authority"),
    ("mp_user", "Mp@12345", "ROLE_MP", "CONSTITUENCY", "Pune", "MP Pune"),
    ("public_user", "Public@1234", "ROLE_PUBLIC", None, None, "Public Viewer"),
]


def create_schema() -> None:
    models.Base.metadata.create_all(engine)


def seed_users(db: Session) -> int:
    created = 0
    for username, password, role, scope_type, scope_value, full_name in SEED_USERS:
        if db.scalar(select(models.User).where(models.User.username == username)):
            continue
        db.add(
            models.User(
                username=username,
                password_hash=security.hash_password(password),
                role=role,
                scope_type=scope_type,
                scope_value=scope_value,
                full_name=full_name,
            )
        )
        created += 1
    db.commit()
    return created


def seed_demo_data(db: Session, force: bool = False) -> dict:
    if not force and db.scalar(select(models.Work).limit(1)):
        return {"skipped": True}
    dataset = synthetic.generate_dataset()
    load_dataset(db, dataset)
    return run_detection(db)


def bootstrap(with_demo_data: bool = True) -> None:
    create_schema()
    with SessionLocal() as db:
        seed_users(db)
        if with_demo_data:
            seed_demo_data(db)


if __name__ == "__main__":
    bootstrap()
    print("Database bootstrapped with seed users and demo data.")
