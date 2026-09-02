"""ORM models mirroring the SRS database schema (Section 5.5)."""
import uuid
from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def new_id() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.utcnow()


class Base(DeclarativeBase):
    pass


class Constituency(Base):
    __tablename__ = "constituencies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    state: Mapped[str] = mapped_column(String(100), index=True)
    district: Mapped[str] = mapped_column(String(100), default="")
    mp_name: Mapped[str] = mapped_column(String(255), default="")
    mp_type: Mapped[str] = mapped_column(String(20), default="LOK_SABHA")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    works: Mapped[list["Work"]] = relationship(back_populates="constituency")


class Work(Base):
    __tablename__ = "works"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    work_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    constituency_id: Mapped[str] = mapped_column(ForeignKey("constituencies.id"), index=True)
    work_description: Mapped[str] = mapped_column(Text)
    work_category: Mapped[str] = mapped_column(String(50), index=True)
    sanctioned_amount: Mapped[float] = mapped_column(Float)
    actual_expenditure: Mapped[float] = mapped_column(Float, default=0.0)
    cost_overrun_percentage: Mapped[float] = mapped_column(Float, default=0.0)
    sanction_date: Mapped[date] = mapped_column(Date)
    expected_completion_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    completion_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    work_status: Mapped[str] = mapped_column(String(20), index=True)
    implementing_agency: Mapped[str] = mapped_column(String(255), default="")
    financial_year: Mapped[str] = mapped_column(String(10), index=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    risk_score: Mapped[int] = mapped_column(Integer, default=0, index=True)
    risk_tier: Mapped[str] = mapped_column(String(10), default="LOW")
    risk_components: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    constituency: Mapped[Constituency] = relationship(back_populates="works")


class FundRelease(Base):
    __tablename__ = "fund_releases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    release_id: Mapped[str] = mapped_column(String(50), unique=True)
    constituency_id: Mapped[str] = mapped_column(ForeignKey("constituencies.id"), index=True)
    financial_year: Mapped[str] = mapped_column(String(10), index=True)
    installment_number: Mapped[int] = mapped_column(Integer)
    amount_released: Mapped[float] = mapped_column(Float)
    release_date: Mapped[date] = mapped_column(Date)


class Anomaly(Base):
    __tablename__ = "anomalies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    work_id: Mapped[str | None] = mapped_column(ForeignKey("works.id"), nullable=True)
    constituency_id: Mapped[str] = mapped_column(ForeignKey("constituencies.id"), index=True)
    anomaly_type: Mapped[str] = mapped_column(String(50), index=True)
    severity: Mapped[str] = mapped_column(String(10), index=True)
    confidence_score: Mapped[float] = mapped_column(Float, default=0.0)
    detection_method: Mapped[str] = mapped_column(String(50), default="")
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="NEW", index=True)
    financial_year: Mapped[str] = mapped_column(String(10), default="")
    detected_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class DuplicatePair(Base):
    __tablename__ = "duplicate_pairs"
    __table_args__ = (UniqueConstraint("work_id_a", "work_id_b"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    work_id_a: Mapped[str] = mapped_column(ForeignKey("works.id"))
    work_id_b: Mapped[str] = mapped_column(ForeignKey("works.id"))
    text_similarity: Mapped[float] = mapped_column(Float)
    amount_similarity: Mapped[float] = mapped_column(Float, default=0.0)
    composite_score: Mapped[int] = mapped_column(Integer, default=0)
    anomaly_id: Mapped[str | None] = mapped_column(ForeignKey("anomalies.id"), nullable=True)


class ConstituencyRiskScore(Base):
    __tablename__ = "constituency_risk_scores"
    __table_args__ = (UniqueConstraint("constituency_id", "financial_year"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    constituency_id: Mapped[str] = mapped_column(ForeignKey("constituencies.id"))
    financial_year: Mapped[str] = mapped_column(String(10))
    risk_score: Mapped[int] = mapped_column(Integer, default=0)
    risk_tier: Mapped[str] = mapped_column(String(10), default="LOW")
    total_works: Mapped[int] = mapped_column(Integer, default=0)
    high_risk_works: Mapped[int] = mapped_column(Integer, default=0)
    fund_utilization_rate: Mapped[float] = mapped_column(Float, default=0.0)
    total_funds_released: Mapped[float] = mapped_column(Float, default=0.0)
    total_expenditure: Mapped[float] = mapped_column(Float, default=0.0)
    calculated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(255), default="")
    role: Mapped[str] = mapped_column(String(30))
    scope_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    scope_value: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_login: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class AuditLog(Base):
    """Append-only audit trail (FR-DVZ-003, NFR-SEC-005)."""

    __tablename__ = "audit_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    action: Mapped[str] = mapped_column(String(50), index=True)
    resource_type: Mapped[str] = mapped_column(String(50), default="")
    resource_id: Mapped[str] = mapped_column(String(255), default="")
    old_value: Mapped[dict] = mapped_column(JSON, default=dict)
    new_value: Mapped[dict] = mapped_column(JSON, default=dict)
    note: Mapped[str] = mapped_column(Text, default="")
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class DetectionRun(Base):
    __tablename__ = "detection_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    triggered_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    trigger_type: Mapped[str] = mapped_column(String(20), default="MANUAL")
    status: Mapped[str] = mapped_column(String(20), default="COMPLETED")
    anomalies_detected: Mapped[int] = mapped_column(Integer, default=0)
    works_analyzed: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class UploadHistory(Base):
    __tablename__ = "upload_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(String(36))
    filename: Mapped[str] = mapped_column(String(255))
    file_hash: Mapped[str] = mapped_column(String(64))
    file_size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    records_total: Mapped[int] = mapped_column(Integer, default=0)
    records_valid: Mapped[int] = mapped_column(Integer, default=0)
    records_rejected: Mapped[int] = mapped_column(Integer, default=0)
    validation_errors: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(20), default="COMPLETED")
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
