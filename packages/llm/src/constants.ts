import type { Severity } from '@odysseus/core';

/** Severity floor for what the model sees. 'minor' findings are real and
 *  still appear in the report's findings appendix (Milestone 6 reads the
 *  unfiltered findings.json for that), but are excluded from the themed
 *  narrative sent to the model. See docs/llm-layer-rules.md section 1. */
export const LLM_SEVERITY_FLOOR: readonly Severity[] = ['critical', 'serious', 'moderate'];

/** Hard rejection retry budget. After this many failed attempts
 *  (schema-invalid response, invented finding IDs, or a refusal
 *  stop_reason), the analyze command fails loudly. See
 *  docs/llm-layer-rules.md section 2. */
export const MAX_RETRIES = 2;

export const CLAUDE_MODEL = 'claude-opus-5';

/** Claude's reasoning-depth parameter (output_config.effort). 'medium' is
 *  a deliberate middle ground: this is a reasoning-heavy grouping and
 *  prioritization task worth spending on, but not one where the highest
 *  tier is obviously justified. Revisit with real cost/quality data.
 *  Recorded on every persisted analysis (see docs/llm-layer-rules.md
 *  section 3) so an effort-level change never gets mistaken for the
 *  client's site changing. */
export const CLAUDE_EFFORT = 'medium';

/** Generous enough for up to 20 themes plus a full findings echo across
 *  findingIds and quickWins, per the locked llmOutputSchema's max theme
 *  count. */
export const MAX_OUTPUT_TOKENS = 8192;
