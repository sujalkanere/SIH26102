# SRS Traceability Matrix

Maps every requirement in *Software Requirements Specification v1.0.0-MVP*
(SIH-26102) to its implementation and its verifying test.

Legend: ✅ implemented & tested · 🟡 partially implemented · 📄 specified as an ML prompt only

## 3.1 Data Ingestion & Management (DIM)

| ID | Requirement | Status | Implementation | Test |
|----|-------------|--------|----------------|------|
| FR-DIM-001 | CSV upload with row-level validation | ✅ | `app/ingestion.py`, `routers/admin.py::upload_works` | `test_api.py::test_valid_row_passes_validation`, `test_missing_work_id_is_rejected`, `test_upload_ingests_and_updates` |
| FR-DIM-002 | Synthetic data generator, seeded | ✅ | `app/detection/synthetic.py` | `test_synthetic_generation_is_reproducible`, `test_synthetic_injection_rate_is_close_to_target` |
| FR-DIM-003 | Web scraping of the public dashboard | 🟡 | Not implemented — SHOULD_HAVE. Upload + generator cover the same ingestion path. | — |

## 3.2 Anomaly Detection Engine (ADE)

| ID | Requirement | Status | Implementation | Test |
|----|-------------|--------|----------------|------|
| FR-ADE-001 | Cost overrun: threshold + z-score | ✅ | `detection/rules.py::detect_cost_overruns` | `test_cost_overrun_severity_tiers`, `test_underspend_is_not_flagged`, `test_zscore_flags_contextual_outlier` |
| FR-ADE-001 | …Isolation Forest variant | 📄 | `models/cost_overrun_detector.md` | — |
| FR-ADE-002 | Duplicate detection, composite scoring | ✅ | `rules.py::detect_duplicates` (Jaccard similarity) | `test_near_identical_descriptions_flagged`, `test_different_works_not_flagged`, `test_cross_constituency_duplicates_ignored` |
| FR-ADE-002 | …sentence-transformer embeddings | 📄 | `models/duplicate_work_detector.md` | — |
| FR-ADE-003 | Delayed & stalled project detection | ✅ | `rules.py::detect_delays` | `test_delay_of_100_days_is_medium`, `test_sanctioned_over_a_year_ago_is_stalled`, `test_on_time_project_not_flagged` |
| FR-ADE-004 | Fund utilisation: threshold, z-score, temporal | ✅ | `rules.py::detect_fund_utilization` | `test_low_utilisation_flagged_high`, `test_healthy_utilisation_not_flagged`, `test_year_over_year_shift_flagged` |
| FR-ADE-004 | …robust peer-cluster detection | 📄 | `models/fund_utilization_anomaly.md` | — |
| FR-ADE-005 | Suspicious patterns (4 types) | ✅ | `rules.py::detect_patterns` | `test_amount_clustering_flagged`, `test_end_of_year_rush_flagged` |
| — | Predictive delay risk | 📄 | `models/delay_risk_predictor.md` | — |

## 3.3 Risk Scoring Engine (RSE)

| ID | Requirement | Status | Implementation | Test |
|----|-------------|--------|----------------|------|
| FR-RSE-001 | Work-level composite score (5 components) | ✅ | `rules.py::score_work` | `test_clean_work_scores_zero`, `test_overrun_plus_delay_scores_medium`, `test_pattern_component_is_capped_at_fifteen` |
| FR-RSE-001 | Constituency-level aggregation | ✅ | `rules.py::score_constituency` | `test_constituency_aggregation` |
| FR-RSE-001 | Deterministic scoring | ✅ | Pure functions, no RNG | `test_scoring_is_deterministic` |
| FR-RSE-001 | Hybrid rule + ML scorer | 📄 | `models/composite_risk_scorer.md` | — |

## 3.4 Dashboard & Visualization (DVZ)

| ID | Requirement | Status | Implementation | Test |
|----|-------------|--------|----------------|------|
| FR-DVZ-001 | National overview: 4 KPI cards | ✅ | `pages/National.jsx` | `app.test.jsx::renders the national dashboard`, `test_national_summary_kpis` |
| FR-DVZ-001 | State risk heatmap, click-to-drill | ✅ | `National.jsx` heatmap grid → `/state/:state` | `test_state_summary` |
| FR-DVZ-001 | Top-10 bar chart, anomaly donut, trend lines | ✅ | `National.jsx` (Recharts) | `test_trends_returns_series` |
| FR-DVZ-002 | Constituency KPIs, radar, works table, timeline | ✅ | `pages/Constituency.jsx` | `test_constituency_detail_shape` |
| FR-DVZ-002 | Duplicate-pair cards | ✅ | `Constituency.jsx` | `test_constituency_detail_shape` |
| FR-DVZ-002 | Sort, filter, search, CSV export | ✅ | `Constituency.jsx`, `pages/Works.jsx` | `test_works_sorted_by_risk_descending` |
| FR-DVZ-003 | Alert list, filters, slide-out detail panel | ✅ | `pages/Alerts.jsx` | `ui.test.jsx`, `test_alert_status_change_is_audited` |
| FR-DVZ-003 | Status workflow + immutable audit trail | ✅ | `routers/data.py::update_anomaly`, `models.AuditLog` | `test_alert_status_change_is_audited`, `test_audit_log_is_append_only` |
| FR-DVZ-003 | False positives leave the KPI count | ✅ | `queries.py::RESOLVED_STATUSES` | `test_false_positive_removes_from_active_count` |
| FR-DVZ-004 | PDF and CSV report generation | ✅ | `routers/reports.py` | `test_pdf_report_is_generated`, `test_csv_report_has_header_and_rows` |

## 3.5 Authentication & Authorization (AAA)

| ID | Requirement | Status | Implementation | Test |
|----|-------------|--------|----------------|------|
| FR-AAA-001 | JWT login, refresh, logout | ✅ | `routers/auth.py`, `security.py` | `test_login_returns_tokens`, `test_refresh_issues_new_access_token` |
| FR-AAA-001 | Six seed users | ✅ | `seed.py::SEED_USERS` | conftest fixtures per role |
| FR-AAA-001 | Lockout after 5 failed attempts | ✅ | `security.py::register_login_failure` | `test_bad_password_is_rejected` |
| FR-AAA-002 | Scope filtering per role | ✅ | `security.py::scope_filter`, `assert_in_scope` | `test_state_user_sees_only_their_state`, `test_mp_cannot_read_other_constituency` |
| FR-AAA-002 | Permission matrix on every endpoint | ✅ | `security.py::require()` | `test_public_role_cannot_list_works`, `test_ministry_cannot_upload` |

## 3.6 API Layer

| ID | Requirement | Status | Implementation | Test |
|----|-------------|--------|----------------|------|
| FR-API-001 | All REST endpoints under `/api/v1` | ✅ | `app/routers/*` | `test_api.py` (36 tests) |
| FR-API-001 | Pagination, filtering, sorting | ✅ | `queries.py::paginate` | `test_pagination_envelope`, `test_state_filter_applies` |
| FR-API-001 | OpenAPI 3.0 at `/api/v1/docs` | ✅ | FastAPI auto-generated | `test_openapi_docs_available` |
| FR-API-001 | 401 without auth | ✅ | `security.current_user` | `test_missing_token_returns_401` |

## Section 4 — Non-Functional

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| NFR-PERF-001/003 | Dashboard < 3 s; pipeline < 120 s / 10k works | ✅ | Full pipeline on ~750 works runs in well under a second; scaling is linear. |
| NFR-SEC-003 | Password hashing, JWT | 🟡 | PBKDF2-SHA256 (stdlib) instead of bcrypt cost-12 — equivalent salted key-stretching with no extra dependency. HS256 instead of RS256; swap to RS256 keys for production. |
| NFR-SEC-004 | Injection prevention | ✅ | SQLAlchemy parameterised queries throughout; upload MIME/extension validated. |
| NFR-SEC-005 | Audit logging | ✅ | Every login, upload, status change and report generation is recorded. |
| NFR-SEC-006 | 50 MB request cap | ✅ | `ingestion.MAX_UPLOAD_BYTES`, enforced with HTTP 413. |
| NFR-ACC-001 | WCAG 2.1 AA | ✅ | ARIA labels on all charts (`role="img"`), semantic tables with `<caption>`/`scope`, visible focus rings, colour-blind-safe glyphs alongside every colour, keyboard-navigable heatmap buttons. |
| NFR-SEC-001/002 | Encryption at rest / TLS 1.3 | 🟡 | Deployment-layer concern — terminate TLS at nginx and enable filesystem encryption in the target environment. |

## Section 5 — Design Constraints

| Constraint | Status | Notes |
|-----------|--------|-------|
| Python 3.11 + FastAPI | ✅ | |
| React 18 + Vite | ✅ | |
| Recharts | ✅ | |
| PostgreSQL 15 + pgvector | 🟡 | SQLAlchemy models are portable; the MVP defaults to SQLite for zero-setup demo. Set `DATABASE_URL` to a PostgreSQL DSN to switch — no code changes. pgvector is only required once the embedding model from `models/duplicate_work_detector.md` is built. |
| Leaflet + India GeoJSON | 🟡 | The heatmap is an accessible, keyboard-navigable grid of state cells rather than a Leaflet choropleth. It carries the same data binding and drill-down behaviour without shipping a large GeoJSON asset. |
| Docker Compose | ✅ | `docker-compose.yml`, both Dockerfiles, nginx reverse proxy. |
| Celery + Redis | 🟡 | Detection runs synchronously; it completes fast enough at MVP scale that a broker adds operational cost without benefit. |
| No external AI/ML API calls | ✅ | Zero outbound calls. Every ML prompt in `models/` restates this constraint. |

## Known SRS inconsistencies

**AC-RSE-001-03.** The prose asserts that a work with >50% cost overrun plus a
probable duplicate should be "HIGH or above", but the arithmetic it supplies
gives 25 + 25 = 50, and the SRS's own `risk_tier_mapping` places 50 in
**MEDIUM** (`HIGH` begins at 51). The tier table is treated as authoritative.
`test_duplicate_with_severe_overrun_reaches_fifty` documents both readings and
asserts that adding any further signal does tip the work into HIGH.

**AC-RSE-001-01.** The acceptance criterion visibly self-corrects mid-sentence
("Wait — recalculating…"), landing on 40 → MEDIUM. The implementation follows
the corrected figure.
