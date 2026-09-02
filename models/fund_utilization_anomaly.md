# Model Prompt — Fund Utilisation Anomaly Detector

- **SRS requirement:** FR-ADE-004, `method_2_statistical` and `method_3_temporal`
- **Replaces:** the per-state z-score pass in `rules.py::detect_fund_utilization`
- **Model family:** Robust multivariate outlier detection + time-series change-point detection
- **Priority:** MUST_HAVE

---

## Prompt

> Build a detector that identifies constituencies whose fund-utilisation
> behaviour is abnormal **relative to genuinely comparable peers**. The current
> z-score approach compares every constituency to its state mean, which
> misfires: a small rural constituency is not comparable to a metropolitan one,
> and a single extreme outlier inflates the mean and standard deviation it is
> being measured against.
>
> **Unit of analysis.** One row per `(constituency, financial_year)`. Build it
> from the same aggregation the pipeline already performs — reuse
> `pipeline._fund_summaries(db)` rather than writing a parallel query.
>
> **Features.**
> - `fund_utilization_rate` = `(total_expenditure / total_funds_released) * 100`
> - `works_per_crore` = `total_works / (total_funds_released / 1e7)`
> - `average_work_cost` = `total_sanctioned / total_works`
> - `completion_ratio` = completed works / total works
> - `expenditure_concentration` — Gini coefficient of expenditure across works,
>   exposing a constituency where one work absorbs nearly the whole allocation
> - `release_to_first_spend_days` — latency between the first release and the
>   first recorded expenditure
>
> **Peer grouping.** Do **not** group by state alone. Cluster constituencies
> with `KMeans(n_clusters=5, random_state=42)` over
> `[log(total_funds_released), total_works, average_work_cost]`, then detect
> outliers *within each cluster*. Report which cluster a constituency belongs to
> so a reviewer can see the comparison set.
>
> **Outlier detection.** Use **robust** statistics throughout — the mean and
> standard deviation are exactly what fraud distorts:
> - Modified z-score via median absolute deviation:
>   `0.6745 * (x - median) / MAD`; flag when `|score| > 3.5`
> - `sklearn.covariance.EllipticEnvelope(contamination=0.05, random_state=42)`
>   for the multivariate view
> - Flag only when **both** agree, to hold false positives down
>
> **Temporal change-point detection.** For each constituency's utilisation-rate
> series across financial years, apply CUSUM (or the PELT algorithm from
> `ruptures`) to locate structural breaks. Flag a break when the level shifts by
> more than **40 percentage points**, matching the existing
> `SUDDEN_UTILIZATION_SHIFT` rule.
>
> **Preserve the threshold rules.** The absolute thresholds from FR-ADE-004
> `method_1` stay in force regardless of what the model says:
> - `< 30%` → LOW_UTILIZATION, HIGH
> - `< 50%` → LOW_UTILIZATION, MEDIUM
> - `> 110%` → OVER_UTILIZATION, HIGH
>
> **Output.**
> ```
> {
>   "constituency": str, "financial_year": str,
>   "anomaly_type": "LOW_UTILIZATION" | "OVER_UTILIZATION"
>                 | "FUND_UTILIZATION_ANOMALY" | "SUDDEN_UTILIZATION_SHIFT",
>   "severity": "MEDIUM" | "HIGH" | "CRITICAL",
>   "fund_utilization_rate": float,
>   "peer_cluster_id": int,
>   "peer_median_rate": float,
>   "modified_z_score": float,
>   "explanation": str
> }
> ```
> `explanation` must be a plain-English sentence a district officer can act on,
> e.g. *"Utilisation of 22% is far below the 78% median of 14 comparable
> constituencies with similar allocation and workload."*
>
> **Integration contract.**
> ```python
> def detect_fund_utilization_ml(summaries: list[dict], model_path: str | None = None) -> list[Finding]
> ```
> Return the shared `Finding` dataclass; return `[]` on missing artefacts.
>
> **Acceptance criteria** (write tests for each):
> - AC-ADE-004-01: `released=5000000, expenditure=1250000` (25%) →
>   LOW_UTILIZATION, HIGH.
> - AC-ADE-004-02: `released=5000000, expenditure=4250000` (85%) →
>   **not** flagged.
> - AC-ADE-004-03: 90% in FY2022-23 dropping to 30% in FY2023-24 →
>   SUDDEN_UTILIZATION_SHIFT.
> - Injecting one extreme outlier into a peer group does **not** change the
>   flags on the other members (this is the robustness property the current
>   z-score implementation lacks — test it explicitly).
>
> **Constraints.** scikit-learn (plus optional `ruptures`); deterministic with
> fixed seeds; no external API calls; skip clustering and fall back to the
> threshold rules when fewer than 20 constituency-year rows exist.
