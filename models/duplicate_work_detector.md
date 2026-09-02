# Model Prompt — Duplicate Work Detector (NLP)

- **SRS requirement:** FR-ADE-002, `step_1_text_embedding` and `step_2_similarity_search`
- **Replaces:** the Jaccard token overlap in `rules.py::text_similarity`
- **Model family:** Sentence-transformer bi-encoder + vector similarity search
- **Priority:** MUST_HAVE

---

## Prompt

> Build a semantic duplicate-work detector that finds MPLADS works funded twice
> under differently-worded descriptions. The current implementation uses Jaccard
> token overlap, which misses paraphrases ("Construction of community hall" vs
> "Building of panchayat bhavan") and is fooled by shared boilerplate.
>
> **Embedding model.** Use `sentence-transformers/all-MiniLM-L6-v2` (384-dim,
> ~80 MB, Apache 2.0). Download it **once at image build time** and bundle it in
> the container — SRS §5.3 forbids runtime downloads and external calls. Load
> from a local path only; fail loudly if the path is missing.
>
> **Indexing.** Embed every `work_description`, L2-normalise, and store in the
> `works.description_embedding` column (`VECTOR(384)`, pgvector). Create an
> `ivfflat` index with `vector_cosine_ops` and `lists = sqrt(row_count)`.
> Re-embed a work only when its description actually changes — hash the text and
> compare.
>
> **Candidate generation.** For each work, retrieve nearest neighbours
> **within the same constituency only**. Cross-constituency duplicates are
> explicitly out of MVP scope (AC-ADE-002-03) and must never be emitted. Use
> pgvector ANN search, not a Python O(n²) loop, and cap at the 50 nearest
> neighbours per work.
>
> **Filtering.** Keep a candidate pair only when all hold:
> - cosine similarity > **0.85**
> - `|amount_a - amount_b| / max(amount_a, amount_b)` < **0.30**
> - `|sanction_date_a - sanction_date_b|` < **365 days**
>
> **Scoring.** Reuse `rules.duplicate_composite_score(...)` unchanged — pass the
> cosine similarity in place of the Jaccard value. Do not fork the weighting
> logic; the 40/20/15/15/10 split is shared with the rule-based path and must
> stay in one place.
>
> **Output.** One record per pair, deduplicated so that `work_id_a < work_id_b`
> (matching the `duplicate_pairs` table CHECK constraint):
> ```
> {
>   "work_id_a": str, "work_id_b": str,
>   "text_similarity": float, "amount_similarity": float,
>   "composite_score": int, "severity": "MEDIUM" | "HIGH",
>   "matched_phrases": [str]
> }
> ```
> Populate `matched_phrases` with the highest-attention overlapping n-grams so a
> reviewer can see at a glance what made the two descriptions look alike.
>
> **Integration contract.**
> ```python
> def detect_duplicates_ml(works: list[dict], model_path: str, threshold: float = 0.85) -> list[Finding]
> ```
> Return the same `Finding` dataclass as `rules.py`. When the model or the vector
> index is unavailable, return `[]` and let the Jaccard implementation serve as
> fallback.
>
> **Acceptance criteria** (write tests for each):
> - AC-ADE-002-01: "Construction of community hall **at** Village Rampur" vs
>   "...**in** Village Rampur" → flagged POTENTIAL_DUPLICATE, composite ≥ 70.
> - AC-ADE-002-02: "Construction of primary school building" vs "Installation of
>   solar street lights" → **not** flagged.
> - AC-ADE-002-03: identical descriptions in different constituencies →
>   **not** flagged.
> - AC-ADE-002-04: 5,000 works in one constituency scored in **under 30 seconds**.
> - AC-ADE-002-05: **precision ≥ 0.75**, **recall ≥ 0.80** against
>   `synthetic_anomaly_labels.csv`.
>
> **Constraints.** Model must be open-source and locally deployable; English
> only for the MVP; batch embeddings (batch size 64) to control memory; no
> external API calls of any kind.
