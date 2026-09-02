# MPLADS Sentinel — SIH26102

An AI-powered analytics and anomaly detection system that tracks, audits and
flags fraudulent activity or inefficiency in the implementation of the **MPLADS
scheme** (Members of Parliament Local Area Development Scheme).

Built for **Smart India Hackathon 2026** · Problem Statement **SIH26102** ·
MoSPI / DIID.

Implements the *Software Requirements Specification v1.0.0-MVP* — see
[`docs/srs-traceability.md`](docs/srs-traceability.md) for a requirement-by-requirement map.

---

## What it does

Government auditors currently review MPLADS works by hand, quarterly. Sentinel
reads the same data and continuously flags what deserves attention:

- **Cost overruns** — threshold rules plus per-category z-score outliers, so a
  10% overrun is caught when its category normally runs at 2%
- **Duplicate works** — text-similarity matching within a constituency, scored
  on description, amount, timing, geography and category
- **Delayed and stalled projects** — timeline deviation with severity banding
- **Fund misutilisation** — under/over-spend thresholds, state-relative
  outliers, and year-over-year utilisation shifts
- **Suspicious patterns** — identical-amount clustering, March spending rushes,
  round-number bias, single-agency concentration

Every finding rolls into a **0-100 composite risk score** with a visible
component breakdown, at both work and constituency level.

## Screens

| Route | Purpose |
|-------|---------|
| `/` | National overview — 4 KPI cards, state risk heatmap, top-10 bar chart, anomaly donut, multi-year trend lines |
| `/state/:state` | State drill-down with a ranked constituency table |
| `/constituency/:name` | Constituency detail — KPIs, risk radar, expenditure timeline, duplicate-pair cards, filterable works table with CSV export |
| `/works` · `/works/:id` | Works explorer and per-work risk breakdown |
| `/alerts` | Alert triage with a slide-out detail panel and full audit trail |
| `/reports` | PDF briefing / CSV dataset export, scoped to your role |
| `/admin` | CSV upload, synthetic data generation, detection re-runs, audit log |

## Quick start

```bash
# Backend  →  http://localhost:8000/api/v1/docs
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend →  http://localhost:3000
cd frontend
npm install
npm run dev
```

The database is created, seeded with users, and populated with a demo dataset
automatically on first start. Vite proxies `/api` to the backend, so the browser
only ever talks to one origin.

### Docker

```bash
docker compose up --build   # → http://localhost:8080
```

## Demo accounts

Seeded per SRS FR-AAA-001. The login screen has one-click buttons for each.

| Username | Password | Role | Sees |
|----------|----------|------|------|
| `admin` | `Admin@1234` | System Administrator | Everything + data administration |
| `ministry_user` | `Ministry@1234` | Ministry Official | All constituencies, alert management |
| `state_user` | `State@1234` | State Nodal Authority | Maharashtra only |
| `district_user` | `District@1234` | District Authority | Pune district only |
| `mp_user` | `Mp@12345` | Member of Parliament | Pune constituency only |
| `public_user` | `Public@1234` | Public Viewer | Anonymised aggregates only |

Scope is enforced **server-side** on every endpoint — the UI merely hides what
the API would refuse.

## Tests

```bash
cd backend  && pytest        # 65 tests
cd frontend && npm test      # 31 tests
```

Backend tests are named after the SRS acceptance criteria they verify
(`AC-ADE-001-02`, `AC-AAA-002-01`, …), so the suite doubles as a compliance
checklist.

## Architecture

```
frontend/          React 18 + Vite + Recharts
  src/lib/         api client · auth context · formatters
  src/components/  shared UI primitives
  src/pages/       one file per screen

backend/           FastAPI + SQLAlchemy 2.0
  app/detection/
    rules.py       pure detection functions — no I/O, fully unit-testable
    synthetic.py   seeded MPLADS data generator with ground-truth labels
    pipeline.py    the only module that turns findings into database rows
  app/routers/     auth · data · analytics · admin · reports
  app/queries.py   scope-aware read helpers shared by every router
  app/security.py  JWT, RBAC matrix, audit logging

models/            ML model PROMPTS ONLY — no code, no weights
docs/              SRS traceability matrix
```

**Design principle:** detection *decisions* live in pure functions in
`rules.py`; *actions* (database writes) live in `pipeline.py`. That split is why
the rule engine has 29 fast unit tests with no fixtures.

## The `models/` folder

Contains **prompt specifications only** — deliberately no model code or weights.
The running system uses deterministic statistical detectors that satisfy every
SRS acceptance criterion; these documents describe the ML upgrade path:

| Prompt | Upgrades |
|--------|----------|
| `cost_overrun_detector.md` | Isolation Forest over engineered expenditure features |
| `duplicate_work_detector.md` | `all-MiniLM-L6-v2` embeddings + pgvector ANN search |
| `delay_risk_predictor.md` | Forward-looking delay probability with SHAP explanations |
| `fund_utilization_anomaly.md` | Robust peer-cluster outliers + change-point detection |
| `composite_risk_scorer.md` | Hybrid 60/40 rule-plus-ML blend, learned from analyst feedback |

Each states its features, model, integration contract, acceptance thresholds and
constraints. All of them honour the SRS rule that **no data leaves the
deployment** — no OpenAI, no cloud ML, local inference only.

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `sqlite:///./data/sentinel.db` | Point at PostgreSQL for production |
| `JWT_SECRET_KEY` | dev placeholder | **Must** be set in production |
| `CORS_ORIGINS` | `*` | Comma-separated allowlist |
| `COST_OVERRUN_THRESHOLD_PCT` | `15.0` | Detection threshold |
| `DUPLICATE_TEXT_SIMILARITY` | `0.85` | Detection threshold |

## Accessibility

Targets WCAG 2.1 AA (NFR-ACC-001): ARIA-labelled charts, semantic tables with
captions and scoped headers, visible focus indicators, keyboard-navigable
heatmap, and a distinct glyph alongside every risk colour so the tiers stay
readable without colour vision.

## Licence

MIT — see [LICENSE](LICENSE).
