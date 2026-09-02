# ML Model Prompts — MPLADS Sentinel

This folder contains **prompt specifications only**. No model code, weights, or
training scripts live here by design.

Each `.md` file is a self-contained brief that an AI coding agent (or a human ML
engineer) can execute to produce one model. The running MVP does **not** depend
on any of them: the backend ships deterministic statistical and rule-based
detectors that satisfy every acceptance criterion in the SRS. These prompts
describe the **ML upgrade path** that replaces or augments each heuristic.

## Contents

| File | Replaces / augments | SRS requirement |
|------|--------------------|-----------------|
| [`cost_overrun_detector.md`](cost_overrun_detector.md) | `detect_cost_overruns` z-score pass | FR-ADE-001 method_3_ml |
| [`duplicate_work_detector.md`](duplicate_work_detector.md) | `text_similarity` Jaccard tokens | FR-ADE-002 step_1/step_2 |
| [`delay_risk_predictor.md`](delay_risk_predictor.md) | Adds forward-looking prediction | FR-ADE-003 (extension) |
| [`fund_utilization_anomaly.md`](fund_utilization_anomaly.md) | `detect_fund_utilization` z-score pass | FR-ADE-004 method_2 |
| [`composite_risk_scorer.md`](composite_risk_scorer.md) | `score_work` fixed weights | FR-RSE-001 |

## Ground rules that apply to every prompt

These come from SRS §5.3 (Data Privacy) and §5.4 (Integration Constraints) and
are **non-negotiable**:

1. **No external AI/ML API calls.** No OpenAI, Anthropic, Google AI, or any
   hosted inference service. All computation happens inside the deployment.
2. **Models must run locally.** Any pretrained artefact must be downloadable
   once and bundled into the Docker image.
3. **Open-source licences only**, compatible with government deployment.
4. **Reproducible.** Fixed random seeds; identical input must yield identical
   output.
5. **Explainable.** Every score must decompose into human-readable factors —
   an official has to justify an investigation to an auditor.
6. **Persist artefacts to `ML_MODEL_PATH`** (see SRS §5.2 env vars), never into
   this folder.
7. **Validate against `synthetic_anomaly_labels.csv`** produced by
   `backend/app/detection/synthetic.py`, which carries ground-truth labels.

## How to use a prompt

1. Open the relevant `.md` file and hand its **Prompt** section to your agent.
2. Have it write code under `backend/app/detection/ml/` (create as needed).
3. Wire the model in behind the existing pure function so the rule-based path
   remains the fallback when no artefact is present.
4. Add tests that assert the precision/recall floors stated in the prompt.
