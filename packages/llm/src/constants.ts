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

/** Model for every pass of the report writing path. GPT-5.6 Luna replaced
 *  gpt-5.4-mini on 2026-09-18 (operator decision): at $0.20/$1.20 per
 *  million tokens it is cheaper than the Mini it replaces even with
 *  reasoning on, which the Mini never had. Persisted analyses record the
 *  requested model, so a model change is visible in provenance. */
export const OPENAI_MODEL = 'gpt-5.6-luna';

/** Reasoning effort for every production pass. 'xhigh' is the highest
 *  value the API accepts for GPT-5.6 (it rejects 'max'), chosen because
 *  the whole report still costs well under a dollar at Luna's price. */
export const OPENAI_REASONING_EFFORT = 'xhigh' as const;

/** With reasoning on, GPT-5.6 accepts only the default temperature (1)
 *  and rejects 0.2 with a 400, so 1 is the value actually sent and
 *  persisted. The original rationale for 0.2 follows.
 *
 *  Determinism lever for a task with one correct, repeatable answer over
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
export const OPENAI_TEMPERATURE = 1;

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
 *  budget ever being exceeded again. Raised to 64000 with reasoning on:
 *  GPT-5.6 counts hidden reasoning tokens against this same budget. */
export const MAX_OUTPUT_TOKENS = 64000;

/** Separate budget for the Plan 070 grounded critic (analyze-critic.ts): it
 *  emits at most MAX_WRITING_CRITIC_ISSUES short issues, never prose, but
 *  GPT-5.6 counts hidden reasoning tokens against this same budget. Kept as
 *  its own constant so tuning the critic never silently retunes a
 *  production pass. */
export const WRITING_CRITIC_MAX_OUTPUT_TOKENS = 64000;

/** Plan 070 decision 2: the one kill switch for the grounded critic and its
 *  targeted repair. Off, the writing path makes exactly Plan 067's calls and
 *  produces exactly its output. There is deliberately no environment
 *  variable or per-job option. It stays off until the plan's calibration
 *  record meets every acceptance threshold. */
export const WRITING_CRITIC_ENABLED: boolean = false;

/** Advisory correction proposals are kept separate from the support-verdict
 * reviewer so their budget can be measured and tuned without retuning either
 * production writing or the existing shadow-review stream. */
export const CORRECTION_REVIEW_MAX_OUTPUT_TOKENS = 64000;
