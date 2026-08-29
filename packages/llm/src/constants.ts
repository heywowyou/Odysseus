import type { Severity } from '@odysseus/core';

/** Severity floor for what the model sees. 'minor' findings are real and
 *  still appear in the report's findings appendix (Milestone 6 reads the
 *  unfiltered findings.json for that), but are excluded from the themed
 *  narrative sent to the model. See docs/llm-layer-rules.md section 1. */
export const LLM_SEVERITY_FLOOR: readonly Severity[] = ['critical', 'serious', 'moderate'];

/** Hard rejection retry budget. After this many failed attempts
 *  (schema-invalid response or invented finding IDs), the analyze command
 *  fails loudly. See docs/llm-layer-rules.md section 2. */
export const MAX_RETRIES = 2;

/** Temporary, 2026-08-29: the configured API key's subscription tier
 *  returns HTTP 403 tier_not_allowed for 'mistral-large-latest' specifically
 *  (confirmed after billing was added - not a quota gate; medium and small
 *  both work fine on the same key), so every live pass (structure, writing,
 *  outreach) is pointed at medium until Large access is restored or a
 *  provider decision replaces this entirely. Revert once Large access is
 *  confirmed working again; see docs/session/current-session.md for the
 *  full investigation. */
export const MISTRAL_MODEL = 'mistral-medium-latest';

/** Determinism lever for a task with one correct, repeatable answer over
 *  the same findings, not a brainstorm: two runs over the same findings
 *  should not produce materially different priorities. 0.2 is a
 *  deliberate low value favoring repeatability over variety. Unlike
 *  Claude Opus 5 (which rejected the temperature parameter outright with
 *  an HTTP 400), Mistral accepts it normally, so this is a real sampling
 *  knob, not just a label. Revisit with real cost/quality data. Recorded
 *  on every persisted analysis (see docs/llm-layer-rules.md section 3) so
 *  a temperature change never gets mistaken for the client's site
 *  changing. */
export const MISTRAL_TEMPERATURE = 0.2;

/** Generous enough for up to 20 themes of French or English prose (writing
 *  pass) or a full findings echo across findingIds and quickWins (structure
 *  pass), per the locked llmOutputSchema's max theme count. Raised from
 *  8192 after a real run against a 124-finding site (15 themes) truncated
 *  mid-JSON under the previous provider (Claude Opus 5, whose adaptive
 *  thinking shared this same budget). Preserved at this size for Mistral:
 *  reasoningEffort is deliberately never set in client.ts precisely to
 *  avoid reintroducing that failure mode (Magistral's chain-of-thought
 *  "thinking" content blocks would share this same budget with the JSON
 *  answer), and client.ts explicitly checks for a truncated
 *  (finishReason: 'length') response as a defensive measure against this
 *  budget ever being exceeded again. */
export const MAX_OUTPUT_TOKENS = 16000;

/** Separate budget for the shadow reviewer pass (analyze-review.ts): it
 *  emits one short verdict-plus-reason object per prose field, never
 *  prose, so its worst case is roughly 20 themes times 4 fields times a
 *  bounded reason (reviewer-schema.ts), well under the writing pass's
 *  needs. Kept as its own constant so tuning the reviewer never silently
 *  retunes a production pass. Same value as MAX_OUTPUT_TOKENS today. */
export const REVIEWER_MAX_OUTPUT_TOKENS = 16000;
