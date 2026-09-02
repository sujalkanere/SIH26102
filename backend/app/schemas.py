"""Pydantic request/response contracts for the REST API (FR-API-001)."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class LoginRequest(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    username: str
    full_name: str
    role: str
    scope_type: str | None
    scope_value: str | None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: UserOut


class RefreshRequest(BaseModel):
    refresh_token: str


class WorkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    work_id: str
    work_description: str
    work_category: str
    sanctioned_amount: float
    actual_expenditure: float
    cost_overrun_percentage: float
    sanction_date: date
    expected_completion_date: date | None
    completion_date: date | None
    work_status: str
    implementing_agency: str
    financial_year: str
    risk_score: int
    risk_tier: str
    risk_components: dict[str, int] = {}
    constituency_name: str = ""
    state: str = ""


class Pagination(BaseModel):
    page: int
    per_page: int
    total_records: int
    total_pages: int


class WorkListResponse(BaseModel):
    data: list[WorkOut]
    pagination: Pagination


class AnomalyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    anomaly_type: str
    severity: str
    status: str
    confidence_score: float
    detection_method: str
    details: dict[str, Any]
    financial_year: str
    detected_at: datetime
    constituency_name: str = ""
    state: str = ""
    work_key: str | None = None


class AnomalyListResponse(BaseModel):
    data: list[AnomalyOut]
    pagination: Pagination


class AnomalyUpdate(BaseModel):
    status: str
    note: str = ""


class ConstituencyOut(BaseModel):
    name: str
    state: str
    district: str
    mp_name: str
    risk_score: int
    risk_tier: str
    total_works: int
    high_risk_works: int
    fund_utilization_rate: float
    total_funds_released: float
    total_expenditure: float
    active_anomalies: int


class ConstituencyListResponse(BaseModel):
    data: list[ConstituencyOut]
    pagination: Pagination


class DuplicatePairOut(BaseModel):
    work_id_a: str
    work_id_b: str
    description_a: str
    description_b: str
    amount_a: float
    amount_b: float
    sanction_date_a: date
    sanction_date_b: date
    text_similarity: float
    composite_score: int
    severity: str


class ConstituencyDetail(BaseModel):
    constituency: ConstituencyOut
    risk_components: dict[str, float]
    expenditure_timeline: list[dict[str, Any]]
    duplicate_pairs: list[DuplicatePairOut]


class WorkDetail(BaseModel):
    work: WorkOut
    anomalies: list[AnomalyOut]
    audit_trail: list[dict[str, Any]]


class NationalSummary(BaseModel):
    total_works: int
    total_expenditure: float
    total_funds_released: float
    anomalies_detected: int
    high_risk_constituencies: int
    anomaly_type_distribution: dict[str, int]
    severity_distribution: dict[str, int]
    state_risk: list[dict[str, Any]]
    top_risk_constituencies: list[dict[str, Any]]
    financial_years: list[str]


class TrendPoint(BaseModel):
    period: str
    series: str
    value: float


class SyntheticRequest(BaseModel):
    num_constituencies: int = 12
    num_works_per_constituency: int = 60
    anomaly_rate: float = 0.08
    seed: int = 42


class ReportRequest(BaseModel):
    scope: str = "NATIONAL"
    scope_id: str | None = None
    financial_year: str = "ALL"
    format: str = "PDF"
