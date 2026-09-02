# Model Prompt — Project Delay Risk Predictor

- **SRS requirement:** FR-ADE-003 (predictive extension); supports §2.4 "Predictive Intelligence"
- **Augments:** `rules.py::detect_delays`, which is retrospective only
- **Model family:** Gradient-boosted classifier (survival-flavoured framing)
- **Priority:** SHOULD_HAVE

---

## Prompt

> Build a model that predicts, for works **still in progress**, the probability
> that they will miss their expected completion date by more than 90 days. The
> existing detector only reports delays that have already happened; this shifts
> the platform from post-hoc auditing to early warning.
>
> **Labelling.** Train on historical *completed* works only. A work is a
> positive example when
> `(completion_date - expected_completion_date).days > 90`. Discard works with a
> null `expected_completion_date` — they carry no learnable signal. Never train
> on open works: their outcome is unknown and including them leaks the label.
>
> **Features** (all must be knowable *at sanction time* — no leakage from the
> future):
> - `sanctioned_amount`, log1p-transformed
> - `planned_duration_days` = `expected_completion_date - sanction_date`
> - `work_category`, one-hot over the nine SRS categories
> - `implementing_agency`, target-encoded using **out-of-fold** means only
> - `sanction_month` (1-12) — captures the March end-of-year rush
> - `constituency_historical_delay_rate` — the share of that constituency's
>   *prior* works that ran late, computed strictly from earlier financial years
> - `agency_historical_delay_rate`, same time-respecting construction
> - `works_active_in_constituency_at_sanction` — a workload proxy
>
> **Model.** `sklearn.ensemble.HistGradientBoostingClassifier`,
> `random_state=42`, early stopping on a validation split. Calibrate the output
> with `CalibratedClassifierCV(method="isotonic")` — a raw boosted score is not
> a probability, and officials will read this number as one.
>
> **Validation.** Split **chronologically by financial year**, never randomly:
> train on 2019-20 through 2022-23, test on 2023-24. A random split leaks future
> information through the historical-rate features and will overstate accuracy.
>
> **Output.**
> ```
> {
>   "work_id": str,
>   "delay_probability": float,        # calibrated 0.0-1.0
>   "predicted_delay_band": "ON_TIME" | "MINOR" | "MAJOR" | "SEVERE",
>   "top_risk_factors": [{"feature": str, "contribution": float}]
> }
> ```
> Bands: `< 0.25` ON_TIME, `0.25-0.50` MINOR, `0.50-0.75` MAJOR, `> 0.75` SEVERE.
> Derive `top_risk_factors` from SHAP values (`shap.TreeExplainer`) so every
> prediction is explainable.
>
> **Surfacing.** These are *predictions*, not detected anomalies. Emit them with
> `anomaly_type="PREDICTED_DELAY_RISK"` and mark them clearly in the UI as
> forecasts — they must never be mixed into the confirmed-anomaly KPI counts.
>
> **Integration contract.**
> ```python
> def predict_delay_risk(works: list[dict], model_path: str) -> list[dict]
> ```
> Score only works with `work_status` in `SANCTIONED`, `IN_PROGRESS`, `ON_HOLD`.
> Return `[]` when no artefact is present.
>
> **Acceptance criteria** (write tests for each):
> - **ROC-AUC ≥ 0.70** on the chronologically held-out financial year.
> - Calibration error (Brier score) **≤ 0.20**.
> - No feature used at inference is unavailable at sanction time — assert this
>   explicitly in a test that inspects the feature list.
> - Predictions are deterministic for a fixed seed and identical input.
>
> **Constraints.** scikit-learn and shap only; no external API calls; persist to
> `ML_MODEL_PATH`; document the training date and row count in the artefact
> metadata so stale models can be detected.
