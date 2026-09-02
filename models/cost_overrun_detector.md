# Model Prompt — Cost Overrun & Expenditure Outlier Detector

- **SRS requirement:** FR-ADE-001, `method_3_ml`
- **Replaces:** the z-score pass inside `backend/app/detection/rules.py::detect_cost_overruns`
- **Model family:** Isolation Forest (unsupervised multivariate outlier detection)
- **Priority:** MUST_HAVE

---

## Prompt

> Build an unsupervised anomaly detector that flags MPLADS works whose
> expenditure profile deviates from its peer group, going beyond the fixed
> ">15% overrun" rule already implemented.
>
> **Training data.** Read works from the `works` table (or a DataFrame with the
> same columns). Use `backend/app/detection/synthetic.py` to generate a labelled
> development set; `synthetic_anomaly_labels.csv` gives ground truth for works
> injected with `COST_OVERRUN`.
>
> **Features.** Engineer exactly these, and document each one:
> - `sanctioned_amount` (log1p-transformed — the distribution is heavy-tailed,
>   spanning ₹50,000 to ₹50,00,000)
> - `actual_expenditure` (log1p-transformed)
> - `cost_overrun_percentage` — reuse
>   `rules.cost_overrun_percentage(sanctioned, actual)`; do not reimplement it
> - `days_to_completion` = `completion_date - sanction_date`, or
>   `reference_date - sanction_date` when the work is still open
> - `work_category` — one-hot encoded over the nine SRS categories
>   (EDUCATION, HEALTH, DRINKING_WATER, SANITATION, ROADS, COMMUNITY_ASSETS,
>   POWER, SPORTS, OTHER)
> - `amount_percentile_within_category` — the work's sanctioned amount as a
>   percentile of its own category, so a large road project is not penalised for
>   simply being expensive
>
> **Model.** `sklearn.ensemble.IsolationForest` with `contamination=0.05`,
> `n_estimators=200`, `random_state=42`. Fit a `StandardScaler` on the numeric
> features first and persist scaler and forest together.
>
> **Training trigger.** Retrain whenever an ingestion brings the corpus to
> **≥ 500 records**. Below that threshold, skip ML entirely and let the existing
> rule-based path handle detection — do not emit a model trained on too little
> data.
>
> **Output.** For each work return:
> ```
> {
>   "work_id": str,
>   "anomaly_score": float,      # raw score_samples() output
>   "confidence_score": float,   # min-max normalised to 0.0-1.0
>   "is_anomaly": bool,
>   "top_contributing_features": [str, str, str]
> }
> ```
> Derive `top_contributing_features` by ablation: recompute the score with each
> feature replaced by its training median and rank features by how much the
> score moves. Officials must be able to see *why* a work was flagged.
>
> **Severity mapping.** Combine with the rule-based result rather than replacing
> it. When the threshold rule already fired, keep its severity. When only the ML
> model fires, emit severity `MEDIUM` and `detection_method="ISOLATION_FOREST"`.
>
> **Integration contract.** Expose a single function:
> ```python
> def detect_cost_overrun_ml(works: list[dict], model_path: str | None = None) -> list[Finding]
> ```
> returning the same `Finding` dataclass used in `rules.py`. Loading a missing or
> corrupt artefact must return `[]` rather than raising — the rule-based detector
> stays the fallback.
>
> **Acceptance criteria** (write tests for each):
> - AC-ADE-001-05: on synthetic data with ground truth, **precision ≥ 0.70** and
>   **recall ≥ 0.80** for the cost-overrun class.
> - Scoring 10,000 works completes in **under 30 seconds** on 2 vCPU.
> - Two runs with `random_state=42` on identical input produce identical scores.
> - A work with `sanctioned=100000, actual=90000` (underspend) is **not** flagged.
>
> **Constraints.** scikit-learn only; no external API calls; persist to
> `ML_MODEL_PATH` via `joblib`; never write artefacts into `models/`.
