import type { Severity } from '@odysseus/core';

/** Severity floor for what the model sees. 'minor' findings are real and
 *  still appear in the report's findings appendix (Milestone 6 reads the
 *  unfiltered findings.json for that), but are excluded from the themed
 *  narrative sent to the model. See docs/rules/llm-layer-rules.md section 1. */
export const LLM_SEVERITY_FLOOR: readonly Severity[] = ['critical', 'serious', 'moderate'];

/** Hard rejection retry budget. After this many failed attempts
 *  (schema-invalid response or invented finding IDs), the analyze command
 *  fails loudly. See docs/rules/llm-layer-rules.md section 2. */
export const MAX_RETRIES = 2;

/** Generic model alias selected by the operator after the 2026-09-03 second
 *  pass. Persisted analyses record the requested alias; a future provider-side
 *  repointing is therefore an explicit accepted reproducibility trade-off. */
export const OPENAI_MODEL = 'gpt-5.4-mini';

/** Determinism lever for a task with one correct, repeatable answer over
 *  the same findings, not a brainstorm: two runs over the same findings
 *  should not produce materially different priorities. 0.2 is a
 *  deliberate low value favoring repeatability over variety. Unlike
 *  Claude Opus 5 (which rejected the temperature parameter outright with
 *  an HTTP 400), the OpenAI Chat Completions API accepts values from 0 to 2,
 *  so this is a real
 *  sampling knob, not just a label. Revisit with real cost/quality data. Recorded
 *  on every persisted analysis (see docs/rules/llm-layer-rules.md section 3) so
 *  a temperature change never gets mistaken for the client's site
 *  changing. */
export const OPENAI_TEMPERATURE = 0.2;

/** Plan 027: the writing pass's own temperature, distinct from
 *  OPENAI_TEMPERATURE above (which still governs the structure and
 *  reviewer passes). The determinism argument for 0.2 is about repeatable
 *  priorities over the same findings; priorities are decided entirely by
 *  the structure pass, which keeps 0.2 unchanged. The writing pass only
 *  produces prose, which has no repeatability requirement, and 0.2 was
 *  measured to make near-verbatim reproduction of the prompt's own
 *  examples likely (see plans/027-french-report-prose-quality.md). Raised
 *  from an initial 0.7 to 1.0 (operator decision, 2026-09-07) for a
 *  stronger break from that pattern; still inside the range where strict
 *  JSON structured output remains reliable. This is not the per-pass model
 *  split trade-off 67 rejected - that rejection was about the single
 *  `model` provenance field on a reused structure pass, not temperature,
 *  and the persisted `temperature` field already records specifically the
 *  writing pass's own call (see docs/rules/llm-layer-rules.md section 3),
 *  so recording this value there stays accurate with no new field. */
export const WRITING_OPENAI_TEMPERATURE = 1.0;

/** Generous enough for up to 20 themes of French or English prose (writing
 *  pass) or a full findings echo across findingIds and quickWins (structure
 *  pass), per the locked llmOutputSchema's max theme count. Raised from
 *  8192 after a real run against a 124-finding site (15 themes) truncated
 *  mid-JSON under the previous provider (Claude Opus 5, whose adaptive
 *  thinking shared this same budget). Preserved at this size for the current
 *  non-reasoning provider, and client.ts explicitly checks for a truncated
 *  (finish_reason: 'length') response as a defensive measure against this
 *  budget ever being exceeded again. */
export const MAX_OUTPUT_TOKENS = 16000;

/** Separate budget for the shadow reviewer pass (analyze-review.ts): it
 *  emits one short verdict-plus-reason object per prose field, never
 *  prose, so its worst case is roughly 20 themes times 4 fields times a
 *  bounded reason (reviewer-schema.ts), well under the writing pass's
 *  needs. Kept as its own constant so tuning the reviewer never silently
 *  retunes a production pass. Same value as MAX_OUTPUT_TOKENS today. */
export const REVIEWER_MAX_OUTPUT_TOKENS = 16000;
