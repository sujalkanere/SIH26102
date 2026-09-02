"""API-level tests covering auth, RBAC, pagination, filtering and reports."""
from app.detection import synthetic
from app.ingestion import parse_works_csv, validate_work_row

API = "/api/v1"


# --- FR-AAA-001 --------------------------------------------------------------


def test_login_returns_tokens(client):
    """AC-AAA-001-01."""
    response = client.post(f"{API}/auth/login", json={"username": "admin", "password": "Admin@1234"})
    body = response.json()
    assert response.status_code == 200
    assert body["access_token"] and body["refresh_token"]
    assert body["user"]["role"] == "ROLE_ADMIN"


def test_bad_password_is_rejected(client):
    """AC-AAA-001-02."""
    response = client.post(f"{API}/auth/login", json={"username": "admin", "password": "wrong"})
    assert response.status_code == 401


def test_refresh_issues_new_access_token(client):
    """AC-AAA-001-04."""
    login = client.post(
        f"{API}/auth/login", json={"username": "ministry_user", "password": "Ministry@1234"}
    ).json()
    response = client.post(f"{API}/auth/refresh", json={"refresh_token": login["refresh_token"]})
    assert response.status_code == 200
    assert response.json()["access_token"]


def test_missing_token_returns_401(client):
    """AC-API-001-04."""
    assert client.get(f"{API}/works").status_code == 401


def test_refresh_token_rejected_as_access_token(client):
    login = client.post(
        f"{API}/auth/login", json={"username": "admin", "password": "Admin@1234"}
    ).json()
    headers = {"Authorization": f"Bearer {login['refresh_token']}"}
    assert client.get(f"{API}/works", headers=headers).status_code == 401


# --- FR-AAA-002 --------------------------------------------------------------


def test_state_user_sees_only_their_state(client, state_headers):
    """AC-AAA-002-01."""
    body = client.get(f"{API}/constituencies", headers=state_headers).json()
    assert body["data"]
    assert {c["state"] for c in body["data"]} == {"Maharashtra"}


def test_mp_cannot_read_other_constituency(client, mp_headers):
    """AC-AAA-002-02."""
    assert client.get(f"{API}/constituencies/Nagpur", headers=mp_headers).status_code == 403


def test_mp_can_read_own_constituency(client, mp_headers):
    assert client.get(f"{API}/constituencies/Pune", headers=mp_headers).status_code == 200


def test_admin_sees_every_constituency(client, admin_headers, state_headers):
    """AC-AAA-002-03."""
    admin_total = client.get(f"{API}/constituencies", headers=admin_headers).json()["pagination"]["total_records"]
    state_total = client.get(f"{API}/constituencies", headers=state_headers).json()["pagination"]["total_records"]
    assert admin_total > state_total


def test_public_role_cannot_list_works(client, public_headers):
    """AC-AAA-002-04."""
    assert client.get(f"{API}/works", headers=public_headers).status_code == 403


def test_ministry_cannot_upload(client, ministry_headers):
    files = {"file": ("works.csv", b"work_id\n", "text/csv")}
    assert client.post(f"{API}/admin/upload", files=files, headers=ministry_headers).status_code == 403


# --- FR-API-001 --------------------------------------------------------------


def test_pagination_envelope(client, admin_headers):
    """AC-API-001-02."""
    body = client.get(f"{API}/works?page=2&per_page=10", headers=admin_headers).json()
    assert len(body["data"]) == 10
    assert body["pagination"]["page"] == 2
    assert body["pagination"]["total_pages"] >= 2


def test_state_filter_applies(client, admin_headers):
    """AC-API-001-03."""
    body = client.get(f"{API}/works?state=Maharashtra&per_page=50", headers=admin_headers).json()
    assert body["data"]
    assert {w["state"] for w in body["data"]} == {"Maharashtra"}


def test_works_sorted_by_risk_descending(client, admin_headers):
    body = client.get(f"{API}/works?sort_by=risk_score&sort_order=desc", headers=admin_headers).json()
    scores = [w["risk_score"] for w in body["data"]]
    assert scores == sorted(scores, reverse=True)


def test_work_detail_includes_risk_and_anomalies(client, admin_headers):
    listed = client.get(f"{API}/works?per_page=1", headers=admin_headers).json()["data"][0]
    body = client.get(f"{API}/works/{listed['work_id']}", headers=admin_headers).json()
    assert body["work"]["work_id"] == listed["work_id"]
    assert set(body["work"]["risk_components"]) >= {"cost_overrun", "delay", "duplicate"}
    assert isinstance(body["anomalies"], list)


def test_unknown_work_returns_404(client, admin_headers):
    assert client.get(f"{API}/works/NOPE", headers=admin_headers).status_code == 404


def test_openapi_docs_available(client):
    """AC-API-001-05."""
    assert client.get(f"{API}/docs").status_code == 200
    assert client.get(f"{API}/openapi.json").status_code == 200


def test_health_endpoint(client):
    assert client.get(f"{API}/health").json()["status"] == "ok"


# --- FR-DVZ-001 / analytics --------------------------------------------------


def test_national_summary_kpis(client, ministry_headers):
    """AC-DVZ-001-02."""
    body = client.get(f"{API}/analytics/national-summary", headers=ministry_headers).json()
    assert body["total_works"] > 0
    assert body["total_expenditure"] > 0
    assert body["anomalies_detected"] > 0
    assert body["state_risk"] and body["top_risk_constituencies"]


def test_trends_returns_series(client, ministry_headers):
    body = client.get(f"{API}/analytics/trends?metric=anomaly_count", headers=ministry_headers).json()
    assert body["metric"] == "anomaly_count"
    assert all({"period", "series", "value"} <= set(point) for point in body["data"])


def test_state_summary(client, ministry_headers):
    body = client.get(f"{API}/analytics/state-summary/Maharashtra", headers=ministry_headers).json()
    assert body["state"] == "Maharashtra"
    assert body["constituencies"]


def test_public_summary_is_open(client):
    body = client.get(f"{API}/analytics/public-summary").json()
    assert body["total_works"] > 0
    assert "anomaly_type_distribution" in body


# --- FR-DVZ-002 / FR-DVZ-003 -------------------------------------------------


def test_constituency_detail_shape(client, ministry_headers):
    name = client.get(f"{API}/constituencies", headers=ministry_headers).json()["data"][0]["name"]
    body = client.get(f"{API}/constituencies/{name}", headers=ministry_headers).json()
    assert body["constituency"]["name"] == name
    assert isinstance(body["expenditure_timeline"], list)
    assert isinstance(body["duplicate_pairs"], list)


def test_alert_status_change_is_audited(client, ministry_headers):
    """AC-DVZ-003-01."""
    anomaly = client.get(f"{API}/anomalies?per_page=1", headers=ministry_headers).json()["data"][0]
    response = client.patch(
        f"{API}/anomalies/{anomaly['id']}",
        json={"status": "ACKNOWLEDGED", "note": "Reviewed by desk officer"},
        headers=ministry_headers,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "ACKNOWLEDGED"

    trail = client.get(f"{API}/audit-log", headers=ministry_headers).json()["data"]
    entry = next(e for e in trail if e["resource_id"] == anomaly["id"])
    assert entry["old_value"]["status"] == "NEW"
    assert entry["new_value"]["status"] == "ACKNOWLEDGED"


def test_false_positive_removes_from_active_count(client, ministry_headers):
    """AC-DVZ-003-02."""
    before = client.get(f"{API}/analytics/national-summary", headers=ministry_headers).json()
    anomaly = client.get(
        f"{API}/anomalies?status=NEW&per_page=1", headers=ministry_headers
    ).json()["data"][0]
    client.patch(
        f"{API}/anomalies/{anomaly['id']}",
        json={"status": "FALSE_POSITIVE"},
        headers=ministry_headers,
    )
    after = client.get(f"{API}/analytics/national-summary", headers=ministry_headers).json()
    assert after["anomalies_detected"] == before["anomalies_detected"] - 1


def test_audit_log_is_append_only(client, ministry_headers):
    """AC-DVZ-003-03: no mutation route is exposed."""
    entry = client.get(f"{API}/audit-log", headers=ministry_headers).json()["data"][0]
    assert client.delete(f"{API}/audit-log/{entry['id']}", headers=ministry_headers).status_code in (404, 405)


def test_anomaly_status_must_be_known(client, ministry_headers):
    anomaly = client.get(f"{API}/anomalies?per_page=1", headers=ministry_headers).json()["data"][0]
    response = client.patch(
        f"{API}/anomalies/{anomaly['id']}", json={"status": "BOGUS"}, headers=ministry_headers
    )
    assert response.status_code == 422


# --- FR-DVZ-004 --------------------------------------------------------------


def test_csv_report_has_header_and_rows(client, ministry_headers):
    """AC-DVZ-004-02."""
    response = client.post(
        f"{API}/reports/generate",
        json={"scope": "NATIONAL", "financial_year": "ALL", "format": "CSV"},
        headers=ministry_headers,
    )
    assert response.status_code == 200
    lines = response.text.strip().splitlines()
    assert lines[0].startswith("work_id,constituency_name")
    assert len(lines) > 1


def test_pdf_report_is_generated(client, ministry_headers):
    """AC-DVZ-004-01."""
    response = client.post(
        f"{API}/reports/generate",
        json={"scope": "NATIONAL", "financial_year": "ALL", "format": "PDF"},
        headers=ministry_headers,
    )
    assert response.status_code == 200
    assert response.content.startswith(b"%PDF")


# --- FR-DIM-001 / FR-DIM-002 -------------------------------------------------


def test_valid_row_passes_validation():
    """AC-DIM-001-01."""
    row = {
        "work_id": "W1", "constituency_name": "Pune", "state": "Maharashtra",
        "work_description": "Road repair", "work_category": "ROADS",
        "sanctioned_amount": "100000", "actual_expenditure": "90000",
        "sanction_date": "2023-05-01", "work_status": "COMPLETED", "financial_year": "2023-24",
    }
    record, errors = validate_work_row(row, 2)
    assert errors == [] and record["work_id"] == "W1"


def test_missing_work_id_is_rejected():
    """AC-DIM-001-02."""
    csv_bytes = (
        b"work_id,constituency_name,state,work_description,work_category,"
        b"sanctioned_amount,sanction_date,work_status,financial_year\n"
        b",Pune,Maharashtra,Road,ROADS,100000,2023-05-01,COMPLETED,2023-24\n"
    )
    valid, errors = parse_works_csv(csv_bytes)
    assert valid == []
    assert any(e["column"] == "work_id" and e["row_number"] == 2 for e in errors)


def test_upload_ingests_and_updates(client, admin_headers):
    """AC-DIM-001-04: re-uploading a work_id updates the stored record."""
    header = (
        "work_id,constituency_name,state,work_description,work_category,"
        "sanctioned_amount,actual_expenditure,sanction_date,expected_completion_date,"
        "work_status,implementing_agency,financial_year\n"
    )
    row = (
        "UPLOAD-1,Pune,Maharashtra,Construction of test drain,SANITATION,"
        "100000,250000,2023-05-01,2023-12-01,IN_PROGRESS,PWD,2023-24\n"
    )
    files = {"file": ("works.csv", (header + row).encode(), "text/csv")}
    body = client.post(f"{API}/admin/upload", files=files, headers=admin_headers).json()
    assert body["records_valid"] == 1 and body["records_rejected"] == 0

    detail = client.get(f"{API}/works/UPLOAD-1", headers=admin_headers).json()
    assert detail["work"]["actual_expenditure"] == 250000
    assert detail["work"]["risk_score"] > 0  # 150% overrun must score


def test_upload_rejects_non_csv(client, admin_headers):
    files = {"file": ("works.txt", b"hello", "text/plain")}
    assert client.post(f"{API}/admin/upload", files=files, headers=admin_headers).status_code == 422


def test_synthetic_generation_is_reproducible():
    """AC-DIM-002-04."""
    first = synthetic.generate_dataset(num_constituencies=3, works_per_constituency=20, seed=42)
    second = synthetic.generate_dataset(num_constituencies=3, works_per_constituency=20, seed=42)
    assert first["works"] == second["works"]


def test_synthetic_injection_rate_is_close_to_target():
    """AC-DIM-002-02."""
    dataset = synthetic.generate_dataset(num_constituencies=8, works_per_constituency=100, anomaly_rate=0.08)
    labelled = {label["work_id"] for label in dataset["labels"]}
    ratio = len(labelled) / len(dataset["works"])
    assert 0.04 < ratio < 0.16


def test_detection_run_is_idempotent(client, admin_headers):
    first = client.post(f"{API}/admin/run-detection", headers=admin_headers).json()
    second = client.post(f"{API}/admin/run-detection", headers=admin_headers).json()
    assert first["anomalies_detected"] == second["anomalies_detected"]
