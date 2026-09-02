"""Pure anomaly-detection decision functions (FR-ADE-001..005, FR-RSE-001).

Every function here is side-effect free: it takes plain values and returns
findings. Persistence lives in `pipeline.py`, so the rules stay unit-testable.
"""
from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date
from statistics import mean, pstdev

# --- shared vocabulary -------------------------------------------------------

SEVERITIES = ("LOW", "MEDIUM", "HIGH", "CRITICAL")
RISK_TIERS = ((25, "LOW"), (50, "MEDIUM"), (75, "HIGH"), (100, "CRITICAL"))


@dataclass
class Finding:
    """One detected anomaly, not yet persisted."""

    anomaly_type: str
    severity: str
    detection_method: str
    confidence_score: float = 0.5
    work_key: str | None = None
    constituency: str | None = None
    financial_year: str = ""
    details: dict = field(default_factory=dict)


def tier_for_score(score: float) -> str:
    """Map a 0-100 risk score onto an SRS risk tier."""
    for ceiling, tier in RISK_TIERS:
        if score <= ceiling:
            return tier
    return "CRITICAL"


def _banded_severity(value: float, bands: list[tuple[float, str]]) -> str | None:
    """Return the label of the first band whose upper bound is not exceeded."""
    for upper, label in bands:
        if value <= upper:
            return label
    return bands[-1][1] if bands else None


def zscores(values: list[float]) -> list[float]:
    """Z-score of each value against its own population (0.0 when no spread)."""
    if len(values) < 2:
        return [0.0] * len(values)
    mu, sigma = mean(values), pstdev(values)
    return [0.0 if sigma == 0 else (v - mu) / sigma for v in values]


# --- FR-ADE-001: cost overrun ------------------------------------------------

COST_OVERRUN_BANDS = [(30.0, "MEDIUM"), (50.0, "HIGH"), (math.inf, "CRITICAL")]


def cost_overrun_percentage(sanctioned: float, actual: float) -> float:
    if not sanctioned:
        return 0.0
    return ((actual - sanctioned) / sanctioned) * 100.0


def detect_cost_overruns(works: list[dict], threshold_pct: float = 15.0) -> list[Finding]:
    """Rule-based threshold detection plus per-category z-score outliers."""
    findings: list[Finding] = []
    by_category: dict[str, list[dict]] = defaultdict(list)

    for work in works:
        overrun = cost_overrun_percentage(work["sanctioned_amount"], work["actual_expenditure"])
        work = {**work, "overrun": overrun}
        by_category[work["work_category"]].append(work)

        if overrun > threshold_pct:
            findings.append(
                Finding(
                    anomaly_type="COST_OVERRUN",
                    severity=_banded_severity(overrun, COST_OVERRUN_BANDS),
                    detection_method="RULE_THRESHOLD",
                    confidence_score=min(1.0, 0.6 + overrun / 200),
                    work_key=work["work_id"],
                    constituency=work["constituency_name"],
                    financial_year=work.get("financial_year", ""),
                    details={
                        "cost_overrun_percentage": round(overrun, 2),
                        "sanctioned_amount": work["sanctioned_amount"],
                        "actual_expenditure": work["actual_expenditure"],
                    },
                )
            )

    already_flagged = {f.work_key for f in findings}
    for category, group in by_category.items():
        overruns = [w["overrun"] for w in group]
        for work, z in zip(group, zscores(overruns)):
            if abs(z) > 2.5 and work["work_id"] not in already_flagged and work["overrun"] > 0:
                findings.append(
                    Finding(
                        anomaly_type="COST_OVERRUN",
                        severity="MEDIUM",
                        detection_method="ZSCORE",
                        confidence_score=0.6,
                        work_key=work["work_id"],
                        constituency=work["constituency_name"],
                        financial_year=work.get("financial_year", ""),
                        details={
                            "z_score": round(z, 2),
                            "work_category": category,
                            "cost_overrun_percentage": round(work["overrun"], 2),
                        },
                    )
                )
    return findings


# --- FR-ADE-002: duplicate work ---------------------------------------------

_TOKEN = re.compile(r"[a-z0-9]+")


def tokenize(text: str) -> set[str]:
    return set(_TOKEN.findall(text.lower()))


def text_similarity(a: str, b: str) -> float:
    """Jaccard token similarity — a local, dependency-free stand-in for the
    sentence-transformer embeddings specified in FR-ADE-002. The ML upgrade is
    specified in models/duplicate_work_detector.md."""
    ta, tb = tokenize(a), tokenize(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def amount_similarity(a: float, b: float) -> float:
    hi = max(a, b)
    return 0.0 if hi == 0 else 1.0 - abs(a - b) / hi


def duplicate_composite_score(
    text_sim: float, amount_sim: float, day_gap: int, same_category: bool, km_apart: float | None
) -> int:
    """Weighted 0-100 duplicate score per FR-ADE-002 step_3_scoring."""
    score = text_sim * 40 + amount_sim * 20
    score += max(0.0, 1 - day_gap / 365) * 15
    score += 10 if same_category else 0
    if km_apart is not None:
        score += max(0.0, 1 - km_apart / 2) * 15
    return int(round(score))


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_km = 6371.0
    d_lat, d_lon = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(
        math.radians(lat2)
    ) * math.sin(d_lon / 2) ** 2
    return 2 * radius_km * math.asin(math.sqrt(a))


def detect_duplicates(works: list[dict], similarity_threshold: float = 0.85) -> list[Finding]:
    """Compare works pairwise *within* each constituency (cross-constituency is
    out of MVP scope per AC-ADE-002-03)."""
    findings: list[Finding] = []
    by_constituency: dict[str, list[dict]] = defaultdict(list)
    for work in works:
        by_constituency[work["constituency_name"]].append(work)

    for constituency, group in by_constituency.items():
        for i, a in enumerate(group):
            for b in group[i + 1 :]:
                text_sim = text_similarity(a["work_description"], b["work_description"])
                if text_sim < similarity_threshold:
                    continue
                amt_sim = amount_similarity(a["sanctioned_amount"], b["sanctioned_amount"])
                if amt_sim < 0.7:  # amounts must be within 30%
                    continue
                day_gap = abs((a["sanction_date"] - b["sanction_date"]).days)
                if day_gap > 365:
                    continue

                km = None
                if all(a.get(k) is not None and b.get(k) is not None for k in ("latitude", "longitude")):
                    km = haversine_km(a["latitude"], a["longitude"], b["latitude"], b["longitude"])

                score = duplicate_composite_score(
                    text_sim, amt_sim, day_gap, a["work_category"] == b["work_category"], km
                )
                if score < 50:
                    continue
                findings.append(
                    Finding(
                        anomaly_type="DUPLICATE_WORK",
                        severity="HIGH" if score >= 70 else "MEDIUM",
                        detection_method="TEXT_SIMILARITY",
                        confidence_score=round(text_sim, 4),
                        work_key=a["work_id"],
                        constituency=constituency,
                        financial_year=a.get("financial_year", ""),
                        details={
                            "work_id_a": a["work_id"],
                            "work_id_b": b["work_id"],
                            "text_similarity": round(text_sim, 4),
                            "amount_similarity": round(amt_sim, 4),
                            "composite_score": score,
                            "description_a": a["work_description"],
                            "description_b": b["work_description"],
                        },
                    )
                )
    return findings


# --- FR-ADE-003: delayed / stalled projects ---------------------------------

DELAY_BANDS = [(180.0, "MEDIUM"), (365.0, "HIGH"), (math.inf, "CRITICAL")]
OPEN_STATUSES = ("SANCTIONED", "IN_PROGRESS", "ON_HOLD")


def detect_delays(works: list[dict], reference_date: date) -> list[Finding]:
    findings: list[Finding] = []
    for work in works:
        expected = work.get("expected_completion_date")
        status = work["work_status"]
        delay_days = 0
        anomaly_type = None

        if status in OPEN_STATUSES and expected and reference_date > expected:
            delay_days = (reference_date - expected).days
            if delay_days > 90:
                anomaly_type = "DELAYED_PROJECT"
        elif status == "COMPLETED" and work.get("completion_date") and expected:
            delay_days = (work["completion_date"] - expected).days
            if delay_days > 180:
                anomaly_type = "DELAYED_PROJECT"

        if anomaly_type:
            findings.append(
                Finding(
                    anomaly_type=anomaly_type,
                    severity=_banded_severity(float(delay_days), DELAY_BANDS),
                    detection_method="TIMELINE_RULE",
                    confidence_score=0.9,
                    work_key=work["work_id"],
                    constituency=work["constituency_name"],
                    financial_year=work.get("financial_year", ""),
                    details={"delay_days": delay_days, "current_status": status},
                )
            )

        if status == "SANCTIONED" and (reference_date - work["sanction_date"]).days > 365:
            findings.append(
                Finding(
                    anomaly_type="STALLED_PROJECT",
                    severity="HIGH",
                    detection_method="TIMELINE_RULE",
                    confidence_score=0.9,
                    work_key=work["work_id"],
                    constituency=work["constituency_name"],
                    financial_year=work.get("financial_year", ""),
                    details={
                        "days_since_sanction": (reference_date - work["sanction_date"]).days,
                        "current_status": status,
                    },
                )
            )
    return findings


# --- FR-ADE-004: fund utilization -------------------------------------------


def utilization_rate(expenditure: float, released: float) -> float:
    return 0.0 if released <= 0 else (expenditure / released) * 100.0


def detect_fund_utilization(summaries: list[dict]) -> list[Finding]:
    """`summaries` holds one dict per (constituency, financial_year) with keys
    state, constituency, financial_year, total_expenditure, total_funds_released."""
    findings: list[Finding] = []
    enriched = [
        {**s, "rate": utilization_rate(s["total_expenditure"], s["total_funds_released"])}
        for s in summaries
        if s["total_funds_released"] > 0
    ]

    for summary in enriched:
        rate = summary["rate"]
        anomaly_type, severity = None, None
        if rate < 30:
            anomaly_type, severity = "LOW_UTILIZATION", "HIGH"
        elif rate < 50:
            anomaly_type, severity = "LOW_UTILIZATION", "MEDIUM"
        elif rate > 110:
            anomaly_type, severity = "OVER_UTILIZATION", "HIGH"

        if anomaly_type:
            findings.append(
                Finding(
                    anomaly_type=anomaly_type,
                    severity=severity,
                    detection_method="THRESHOLD",
                    confidence_score=0.85,
                    constituency=summary["constituency"],
                    financial_year=summary["financial_year"],
                    details={
                        "fund_utilization_rate": round(rate, 2),
                        "total_funds_released": summary["total_funds_released"],
                        "total_expenditure": summary["total_expenditure"],
                    },
                )
            )

    # State-relative statistical outliers.
    by_state: dict[str, list[dict]] = defaultdict(list)
    for summary in enriched:
        by_state[summary.get("state", "")].append(summary)
    for state, group in by_state.items():
        for summary, z in zip(group, zscores([s["rate"] for s in group])):
            if abs(z) > 2.0:
                findings.append(
                    Finding(
                        anomaly_type="FUND_UTILIZATION_ANOMALY",
                        severity="MEDIUM",
                        detection_method="ZSCORE",
                        confidence_score=0.7,
                        constituency=summary["constituency"],
                        financial_year=summary["financial_year"],
                        details={
                            "z_score": round(z, 2),
                            "state": state,
                            "fund_utilization_rate": round(summary["rate"], 2),
                        },
                    )
                )

    # Year-over-year shifts.
    by_constituency: dict[str, list[dict]] = defaultdict(list)
    for summary in enriched:
        by_constituency[summary["constituency"]].append(summary)
    for constituency, group in by_constituency.items():
        ordered = sorted(group, key=lambda s: s["financial_year"])
        for previous, current in zip(ordered, ordered[1:]):
            shift = current["rate"] - previous["rate"]
            if abs(shift) > 40:
                findings.append(
                    Finding(
                        anomaly_type="SUDDEN_UTILIZATION_SHIFT",
                        severity="HIGH" if abs(shift) > 60 else "MEDIUM",
                        detection_method="TEMPORAL",
                        confidence_score=0.75,
                        constituency=constituency,
                        financial_year=current["financial_year"],
                        details={
                            "change_points": round(shift, 2),
                            "previous_year": previous["financial_year"],
                            "previous_rate": round(previous["rate"], 2),
                            "current_rate": round(current["rate"], 2),
                        },
                    )
                )
    return findings


# --- FR-ADE-005: suspicious patterns ----------------------------------------


def detect_patterns(works: list[dict]) -> list[Finding]:
    findings: list[Finding] = []
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for work in works:
        groups[(work["constituency_name"], work.get("financial_year", ""))].append(work)

    for (constituency, year), group in groups.items():

        def flag(anomaly_type: str, severity: str, details: dict) -> None:
            findings.append(
                Finding(
                    anomaly_type=anomaly_type,
                    severity=severity,
                    detection_method="PATTERN",
                    confidence_score=0.65,
                    constituency=constituency,
                    financial_year=year,
                    details=details,
                )
            )

        amount_counts = Counter(w["sanctioned_amount"] for w in group)
        for amount, count in amount_counts.items():
            if count >= 5:
                flag(
                    "AMOUNT_CLUSTERING",
                    "HIGH" if count > 10 else "MEDIUM",
                    {"sanctioned_amount": amount, "occurrences": count},
                )

        march_ratio = sum(1 for w in group if w["sanction_date"].month == 3) / len(group)
        if march_ratio > 0.40:
            flag(
                "END_OF_YEAR_RUSH",
                "HIGH" if march_ratio > 0.60 else "MEDIUM",
                {"march_share": round(march_ratio, 3), "total_works": len(group)},
            )

        round_share = sum(1 for w in group if w["sanctioned_amount"] % 100000 == 0) / len(group)
        if round_share > 0.80:
            flag("ROUND_NUMBER_BIAS", "LOW", {"round_amount_share": round(round_share, 3)})

        total_amount = sum(w["sanctioned_amount"] for w in group)
        agency_totals = Counter()
        for work in group:
            agency_totals[work.get("implementing_agency", "")] += work["sanctioned_amount"]
        for agency, amount in agency_totals.items():
            if total_amount and agency and amount / total_amount > 0.80:
                flag(
                    "AGENCY_CONCENTRATION",
                    "MEDIUM",
                    {"agency": agency, "share": round(amount / total_amount, 3)},
                )
    return findings


# --- FR-RSE-001: composite risk scoring -------------------------------------

_COST_OVERRUN_POINTS = [(0.0, 0), (15.0, 5), (30.0, 15), (50.0, 20), (math.inf, 25)]
_DELAY_POINTS = [(0.0, 0), (90.0, 5), (180.0, 10), (365.0, 20), (math.inf, 25)]
_PATTERN_POINTS = {
    "AMOUNT_CLUSTERING": 5,
    "END_OF_YEAR_RUSH": 5,
    "ROUND_NUMBER_BIAS": 2,
    "AGENCY_CONCENTRATION": 3,
}


def _points_for(value: float, ladder: list[tuple[float, int]]) -> int:
    for upper, points in ladder:
        if value <= upper:
            return points
    return ladder[-1][1]


def score_work(
    overrun_pct: float,
    delay_days: int,
    duplicate_score: int,
    pattern_types: list[str],
    has_fund_anomaly: bool,
) -> dict:
    """Deterministic 0-100 work risk score with component breakdown."""
    duplicate_points = 25 if duplicate_score > 70 else 15 if duplicate_score >= 50 else 0
    components = {
        "cost_overrun": _points_for(max(overrun_pct, 0.0), _COST_OVERRUN_POINTS),
        "delay": _points_for(float(max(delay_days, 0)), _DELAY_POINTS),
        "duplicate": duplicate_points,
        "pattern": min(15, sum(_PATTERN_POINTS.get(t, 0) for t in pattern_types)),
        "fund_utilization": 10 if has_fund_anomaly else 0,
    }
    total = min(100, sum(components.values()))
    return {"risk_score": total, "risk_tier": tier_for_score(total), "components": components}


def score_constituency(work_scores: list[int], has_fund_anomaly: bool) -> dict:
    """Aggregate work scores into a constituency score per FR-RSE-001."""
    if not work_scores:
        return {"risk_score": 0, "risk_tier": "LOW", "total_works": 0, "high_risk_works": 0}
    high_risk = sum(1 for s in work_scores if s > 50)
    total = (
        mean(work_scores) * 0.4
        + (high_risk / len(work_scores)) * 100 * 0.35
        + (25 if has_fund_anomaly else 0)
    )
    total = int(min(100, round(total)))
    return {
        "risk_score": total,
        "risk_tier": tier_for_score(total),
        "total_works": len(work_scores),
        "high_risk_works": high_risk,
    }
