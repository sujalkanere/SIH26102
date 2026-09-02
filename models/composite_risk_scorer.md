# Model Prompt — Composite Risk Scorer (Hybrid Rule + ML)

- **SRS requirement:** FR-RSE-001
- **Augments:** `rules.py::score_work` and `rules.py::score_constituency`
- **Model family:** Supervised ensemble blended with the deterministic rule score
- **Priority:** MUST_HAVE

---

## Prompt

> Build the hybrid scoring layer described in the SRS as "rule-based + ML-based
> hybrid scoring model". A deterministic rule scorer already exists and produces
> auditable 0-100 scores from five weighted components. Your job is to **add a
> learned signal without discarding the deterministic one** — a government
> auditor must always be able to reconstruct why a work scored what it did.
>
> **Keep the rule score authoritative.** `rules.score_work` must remain
> unchanged and must keep passing its existing tests. The ML output is a second
> opinion, blended in, never a silent replacement.
>
> **Blending.**
> ```
> final_score = round(0.6 * rule_score + 0.4 * ml_score)
> ```
> Both terms are on a 0-100 scale. Surface **all three** numbers — `rule_score`,
> `ml_score`, `final_score` — through the API and in the UI breakdown. If the
> ML artefact is absent, `final_score == rule_score` exactly, and the system
> continues to function.
>
> **Training signal.** True fraud labels do not exist for MPLADS. Use a
> weak-supervision approach:
> 1. Treat the injected ground truth in `synthetic_anomaly_labels.csv` as the
>    primary label source during development.
> 2. In production, use analyst feedback as the label: alerts marked
>    `RESOLVED` (confirmed) are positives, `FALSE_POSITIVE` are negatives. The
>    `anomalies.status` column and the `audit_log` already capture this.
> 3. Retrain only once **at least 200 labelled alerts** have accumulated. Below
>    that, the deterministic score stands alone — document this gate clearly.
>
> **Features.** The five rule components (`cost_overrun`, `delay`, `duplicate`,
> `pattern`, `fund_utilization`) plus contextual signals the rules ignore:
> - `constituency_historical_alert_rate`
> - `agency_historical_alert_rate`
> - `category_relative_cost_percentile`
> - `count_of_concurrent_anomaly_types` on the same work
> - `days_since_sanction`
> - `is_election_year` (boolean)
>
> **Model.** `sklearn.ensemble.GradientBoostingClassifier`, `random_state=42`,
> `max_depth=4` to keep it inspectable. Take `predict_proba()[:, 1] * 100` as
> `ml_score`. Tune with `GroupKFold` grouped by **constituency**, so a
> constituency never appears in both train and validation folds — otherwise the
> historical-rate features leak and the model looks better than it is.
>
> **Handle class imbalance.** Confirmed fraud is rare. Use
> `class_weight`-equivalent sample weights; report **precision-recall AUC**, not
> ROC-AUC, which flatters imbalanced problems.
>
> **Tier mapping.** Unchanged from the SRS, and applied to `final_score`:
> `0-25` LOW · `26-50` MEDIUM · `51-75` HIGH · `76-100` CRITICAL.
> Reuse `rules.tier_for_score` — do not duplicate the boundaries.
>
> **Constituency roll-up.** Leave `rules.score_constituency` as the single
> implementation; simply feed it the blended work scores.
>
> **Output.**
> ```
> {
>   "work_id": str,
>   "rule_score": int, "ml_score": int, "final_score": int,
>   "risk_tier": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
>   "component_scores": {"cost_overrun": int, "delay": int, "duplicate": int,
>                        "pattern": int, "fund_utilization": int},
>   "ml_top_factors": [{"feature": str, "shap_value": float}],
>   "model_version": str, "scored_at": str
> }
> ```
>
> **Integration contract.**
> ```python
> def score_work_hybrid(work_features: dict, model_path: str | None = None) -> dict
> ```
> With `model_path=None` the function must return exactly what
> `rules.score_work` returns, with `ml_score` omitted. Enforce this in a test.
>
> **Acceptance criteria** (write tests for each):
> - AC-RSE-001-01: 40% overrun + 200-day delay, no other flags →
>   `rule_score == 40`, tier MEDIUM.
> - AC-RSE-001-02: no anomalies → score 0, tier LOW.
> - AC-RSE-001-03: >50% overrun + probable duplicate → `rule_score == 50`.
>   *(Note: the SRS prose says "HIGH or above" while its own tier table maps 50
>   to MEDIUM. The tier table is authoritative — the codebase follows it, and
>   this discrepancy is documented in `docs/srs-traceability.md`.)*
> - AC-RSE-001-04: a constituency with 10 works, 5 scoring above 50, scores
>   above 50.
> - Scores are **deterministic**: identical input yields identical output across
>   runs and processes.
> - Precision-recall AUC **≥ 0.75** on held-out labelled alerts.
>
> **Constraints.** scikit-learn and shap only; no external API calls; version
> every artefact and record `model_version` on each score so historical
> decisions remain reproducible; never let an ML failure block scoring — catch,
> log, and fall back to the rule score.
