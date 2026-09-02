"""Unit tests for the pure detection rules, mapped to SRS acceptance criteria."""
from datetime import date

import pytest

from app.detection import rules


def work(**overrides) -> dict:
    base = {
        "work_id": "W001",
        "constituency_name": "Pune",
        "state": "Maharashtra",
        "work_description": "Construction of community hall at Village Rampur",
        "work_category": "COMMUNITY_ASSETS",
        "sanctioned_amount": 100_000.0,
        "actual_expenditure": 90_000.0,
        "sanction_date": date(2023, 4, 10),
        "expected_completion_date": date(2024, 1, 1),
        "completion_date": None,
        "work_status": "IN_PROGRESS",
        "implementing_agency": "PWD",
        "financial_year": "2023-24",
        "latitude": None,
        "longitude": None,
    }
    return {**base, **overrides}


# --- FR-ADE-001 --------------------------------------------------------------


@pytest.mark.parametrize(
    "actual,expected_severity",
    [(120_000, "MEDIUM"), (140_000, "HIGH"), (160_000, "CRITICAL")],
)
def test_cost_overrun_severity_tiers(actual, expected_severity):
    """AC-ADE-001-01 / AC-ADE-001-02."""
    findings = rules.detect_cost_overruns([work(actual_expenditure=actual)])
    assert findings[0].anomaly_type == "COST_OVERRUN"
    assert findings[0].severity == expected_severity


def test_underspend_is_not_flagged():
    """AC-ADE-001-04."""
    assert rules.detect_cost_overruns([work(actual_expenditure=90_000)]) == []


def test_zscore_flags_contextual_outlier():
    """AC-ADE-001-03: a modest overrun stands out when peers hover near zero."""
    peers = [
        work(work_id=f"W{i:03d}", actual_expenditure=100_000 + i * 100)
        for i in range(1, 30)
    ]
    outlier = work(work_id="W999", actual_expenditure=110_000)
    methods = {
        f.detection_method for f in rules.detect_cost_overruns(peers + [outlier], threshold_pct=15.0)
    }
    assert "ZSCORE" in methods


# --- FR-ADE-002 --------------------------------------------------------------


def test_near_identical_descriptions_flagged():
    """AC-ADE-002-01."""
    a = work(work_id="A", work_description="Construction of community hall at Village Rampur")
    b = work(
        work_id="B",
        work_description="Construction of community hall in Village Rampur",
        sanction_date=date(2023, 5, 10),
    )
    findings = rules.detect_duplicates([a, b], similarity_threshold=0.7)
    assert findings and findings[0].anomaly_type == "DUPLICATE_WORK"
    assert findings[0].details["composite_score"] >= 70


def test_different_works_not_flagged():
    """AC-ADE-002-02."""
    a = work(work_id="A", work_description="Construction of primary school building")
    b = work(work_id="B", work_description="Installation of solar street lights")
    assert rules.detect_duplicates([a, b]) == []


def test_cross_constituency_duplicates_ignored():
    """AC-ADE-002-03."""
    a = work(work_id="A", constituency_name="Pune")
    b = work(work_id="B", constituency_name="Nagpur")
    assert rules.detect_duplicates([a, b]) == []


def test_haversine_matches_known_distance():
    km = rules.haversine_km(18.5204, 73.8567, 18.5304, 73.8567)
    assert 1.0 < km < 1.3


# --- FR-ADE-003 --------------------------------------------------------------


def test_delay_of_100_days_is_medium():
    """AC-ADE-003-01."""
    findings = rules.detect_delays(
        [work(expected_completion_date=date(2024, 1, 1))], reference_date=date(2024, 4, 10)
    )
    delayed = [f for f in findings if f.anomaly_type == "DELAYED_PROJECT"]
    assert delayed[0].severity == "MEDIUM"
    assert delayed[0].details["delay_days"] == 100


def test_sanctioned_over_a_year_ago_is_stalled():
    """AC-ADE-003 stalled rule."""
    findings = rules.detect_delays(
        [work(work_status="SANCTIONED", sanction_date=date(2023, 1, 1))],
        reference_date=date(2024, 6, 1),
    )
    stalled = [f for f in findings if f.anomaly_type == "STALLED_PROJECT"]
    assert stalled and stalled[0].severity == "HIGH"


def test_on_time_project_not_flagged():
    findings = rules.detect_delays(
        [work(expected_completion_date=date(2025, 1, 1))], reference_date=date(2024, 4, 10)
    )
    assert findings == []


# --- FR-ADE-004 --------------------------------------------------------------


def summary(**overrides) -> dict:
    base = {
        "constituency": "Pune",
        "state": "Maharashtra",
        "financial_year": "2023-24",
        "total_expenditure": 4_250_000.0,
        "total_funds_released": 5_000_000.0,
    }
    return {**base, **overrides}


def test_low_utilisation_flagged_high():
    """AC-ADE-004-01."""
    findings = rules.detect_fund_utilization([summary(total_expenditure=1_250_000.0)])
    low = [f for f in findings if f.anomaly_type == "LOW_UTILIZATION"]
    assert low and low[0].severity == "HIGH"


def test_healthy_utilisation_not_flagged():
    """AC-ADE-004-02."""
    findings = rules.detect_fund_utilization([summary()])
    assert not [f for f in findings if f.anomaly_type == "LOW_UTILIZATION"]


def test_year_over_year_shift_flagged():
    """AC-ADE-004-03."""
    findings = rules.detect_fund_utilization([
        summary(financial_year="2022-23", total_expenditure=4_500_000.0),
        summary(financial_year="2023-24", total_expenditure=1_500_000.0),
    ])
    assert any(f.anomaly_type == "SUDDEN_UTILIZATION_SHIFT" for f in findings)


# --- FR-ADE-005 --------------------------------------------------------------


def test_amount_clustering_flagged():
    """AC-ADE-005-01: 7 works sharing one amount."""
    works = [work(work_id=f"W{i}", sanctioned_amount=500_000.0) for i in range(7)]
    findings = rules.detect_patterns(works)
    clustering = [f for f in findings if f.anomaly_type == "AMOUNT_CLUSTERING"]
    assert clustering and clustering[0].severity == "MEDIUM"


def test_end_of_year_rush_flagged():
    """AC-ADE-005-02: 11 of 20 works sanctioned in March."""
    works = [work(work_id=f"M{i}", sanction_date=date(2024, 3, 5)) for i in range(11)]
    works += [work(work_id=f"J{i}", sanction_date=date(2023, 7, 5)) for i in range(9)]
    findings = rules.detect_patterns(works)
    rush = [f for f in findings if f.anomaly_type == "END_OF_YEAR_RUSH"]
    assert rush and rush[0].severity == "MEDIUM"


# --- FR-RSE-001 --------------------------------------------------------------


def test_clean_work_scores_zero():
    """AC-RSE-001-02."""
    result = rules.score_work(0, 0, 0, [], False)
    assert result == {"risk_score": 0, "risk_tier": "LOW", "components": result["components"]}
    assert sum(result["components"].values()) == 0


def test_overrun_plus_delay_scores_medium():
    """AC-RSE-001-01: 40% overrun + 200 days delay -> 40 (MEDIUM)."""
    result = rules.score_work(40.0, 200, 0, [], False)
    assert result["risk_score"] == 40
    assert result["risk_tier"] == "MEDIUM"


def test_duplicate_with_severe_overrun_reaches_fifty():
    """AC-RSE-001-03: >50% overrun (25) + probable duplicate (25) = 50.

    The SRS text says "HIGH or above" while its own tier table maps 50 to
    MEDIUM; the tier table is treated as authoritative, so 50 is the boundary.
    """
    result = rules.score_work(60.0, 0, 80, [], False)
    assert result["risk_score"] == 50
    assert result["risk_tier"] == "MEDIUM"
    assert rules.score_work(60.0, 100, 80, [], False)["risk_tier"] == "HIGH"


def test_pattern_component_is_capped_at_fifteen():
    result = rules.score_work(
        0, 0, 0, ["AMOUNT_CLUSTERING", "END_OF_YEAR_RUSH", "ROUND_NUMBER_BIAS", "AGENCY_CONCENTRATION"], False
    )
    assert result["components"]["pattern"] == 15


def test_constituency_aggregation():
    """AC-RSE-001-04: half the works above 50 pushes the constituency past 50."""
    result = rules.score_constituency([80, 70, 60, 55, 51, 10, 5, 0, 0, 0], has_fund_anomaly=True)
    assert result["high_risk_works"] == 5
    assert result["risk_score"] > 50


@pytest.mark.parametrize(
    "score,tier", [(0, "LOW"), (25, "LOW"), (26, "MEDIUM"), (50, "MEDIUM"), (51, "HIGH"), (76, "CRITICAL")]
)
def test_tier_boundaries(score, tier):
    assert rules.tier_for_score(score) == tier


def test_scoring_is_deterministic():
    args = (35.0, 120, 65, ["AMOUNT_CLUSTERING"], True)
    assert rules.score_work(*args) == rules.score_work(*args)
