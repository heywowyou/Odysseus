/**
 * report-feedback-palais-gallien.md item 8: `Finding` has no confidence
 * marker distinguishing a genuine deterministic conformance check from a
 * heuristic red-flag one - `FindingSource` is only 'axe' | 'lighthouse' |
 * 'custom' | 'renderdiff', and 'custom' is shared by both
 * `alt-text-quality-heuristic` (explicitly a heuristic, per
 * normalize-alt-text.ts's own module comment) and genuinely deterministic
 * custom checks like keyboard-trap or form-error-not-associated.
 *
 * `findings.ts` is a locked contract and cannot gain a new field for
 * this, so the distinction lives here instead, the same pattern
 * `LIGHTHOUSE_EXCLUDED_AUDITS` (constants.ts) already uses for a
 * different rule-identity problem. Any report-layer table that presents
 * itself as a list of confirmed conformance failures (the WCAG
 * conformance summary, the draft accessibility statement) must exclude
 * every rule in this set rather than fold it in alongside genuine axe-
 * core criterion failures.
 */
import { ALT_TEXT_QUALITY_HEURISTIC_RULE_ID } from './normalize-alt-text.js';

export const HEURISTIC_RULE_IDS: ReadonlySet<string> = new Set([ALT_TEXT_QUALITY_HEURISTIC_RULE_ID]);
