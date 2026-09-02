"""SQLAlchemy engine/session wiring.

The SRS mandates PostgreSQL 15 + pgvector for production (Section 5.1). The MVP
keeps the ORM layer portable so it runs on SQLite for tests/demo and on
PostgreSQL via DATABASE_URL without code changes.
"""
import os
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from .config import get_settings

_url = get_settings().database_url
if _url.startswith("sqlite:///"):
    _directory = os.path.dirname(os.path.abspath(_url.replace("sqlite:///", "")))
    os.makedirs(_directory, exist_ok=True)

engine = create_engine(
    _url,
    connect_args={"check_same_thread": False} if _url.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
