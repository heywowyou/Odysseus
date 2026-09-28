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
 *  reasoning on, which the Mini never had. GPT-6 Luna replaced it on
 *  2026-09-23 (operator decision): same tier, newer, and cheaper again at
 *  $0.10/$0.50. Persisted analyses record the requested model, so a model
 *  change is visible in provenance. */
export const OPENAI_MODEL = 'gpt-6-luna';

/** Reasoning effort for every production pass: 'xhigh', the highest value
 *  Chat Completions accepts for GPT-5.6 and GPT-6 Luna alike. The GPT-6
 *  model page lists 'max', but a real call on 2026-09-23 was refused with
 *  "does not support 'max' with this model". The whole report still costs
 *  well under a dollar at Luna's price. */
export const OPENAI_REASONING_EFFORT = 'xhigh' as const;

/** Every pass sends temperature 1: with reasoning on, the model accepts only
 *  its default and rejects a lower value with a 400. So priorities are no
 *  longer made repeatable by a low temperature. Repeatability comes from the
 *  deterministic inputs (normalized findings, fixed ordering), the schema and
 *  guards, and reuse of a stored structure pass. The value is recorded on
 *  every persisted analysis (docs/rules/llm-layer-rules.md section 3), so a
 *  change is never mistaken for the client's site changing. An earlier
 *  provider ran the structure pass at 0.2 for repeatable priorities; that
 *  lever is gone. */
export const OPENAI_TEMPERATURE = 1;

/** The writing pass's own temperature (plan 027), kept as a separate
 *  constant so it can move independently of OPENAI_TEMPERATURE. It is 1 for
 *  the same reason; the plan had also raised it (0.2, then 0.7, then 1.0 on
 *  2026-09-07) because a low value made near-verbatim reproduction of the
 *  prompt's own examples likely (plans/archive/027-french-report-prose-quality.md).
 *  The persisted `temperature` field records this writing call's value. */
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
 *  Reasoning models count hidden reasoning tokens against this same budget. */
export const MAX_OUTPUT_TOKENS = 64000;

/** Separate budget for the Plan 070 grounded critic (analyze-critic.ts): it
 *  emits at most MAX_WRITING_CRITIC_ISSUES short issues, never prose, but
 *  Reasoning models count hidden reasoning tokens against this same budget. Kept as
 *  its own constant so tuning the critic never silently retunes a
 *  production pass. */
export const WRITING_CRITIC_MAX_OUTPUT_TOKENS = 64000;

/** Plan 070 decision 2: the one kill switch for the grounded critic and its
 *  targeted repair. Off, the writing path makes exactly Plan 067's calls and
 *  produces exactly its output. There is deliberately no environment
 *  variable or per-job option. Turned on 2026-09-23 by operator decision,
 *  with the switch to GPT-6 Luna (trade-off 102), ahead of the plan's full
 *  calibration record: on the saved Chicago audit it raised 2 accepted issues
 *  for about $0.01. Its hits on real reports are the calibration from here. */
export const WRITING_CRITIC_ENABLED: boolean = true;

/** Advisory correction proposals are kept separate from the support-verdict
 * reviewer so their budget can be measured and tuned without retuning either
 * production writing or the existing shadow-review stream. */
export const CORRECTION_REVIEW_MAX_OUTPUT_TOKENS = 64000;
