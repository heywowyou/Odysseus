import { findBusinessClaimViolations } from './business-claim-guard.js';
import { findExecutiveSummaryDigitViolations } from './executive-summary-digit-guard.js';
import { findFindingCountViolations } from './finding-count-guard.js';
import { findLanguageComplianceViolations } from './language-guard.js';
import { findLegalConsequenceViolations, excerptAroundMatch } from './legal-consequence-guard.js';
import { findPageCountViolations } from './page-count-guard.js';
import { findPositionalReferenceViolations } from './positional-reference-guard.js';
import { PROSE_REGISTER_RETRY_HINT, findProseRegisterViolations } from './prose-register-guard.js';
import {
  findProviderPhraseViolations,
  findProviderPlacementViolations,
  providerPlacementRetryHint,
  providerPhraseRetryHint,
} from './provider-phrase-guard.js';
import { findSeverityVocabularyViolations } from './severity-vocabulary-guard.js';
import { findThemeKeyMismatches, isThemeKeyMismatchEmpty } from './theme-key-guard.js';
import { findThemeTitleViolations } from './theme-title-guard.js';
import { findPerformanceEvidenceViolations } from './performance-evidence-guard.js';
import { findTransactionalFlowViolations } from './transactional-flow-guard.js';
import { findWcagCitationViolations } from './wcag-citation-guard.js';
import type { WritingGuardName } from './telemetry/events.js';
import type { WritingInput, WritingPassOutput } from './writing-schema.js';

/**
 * What losing a guard costs.
 *
 * `blocking` is the original posture and the right one for a rule 1 or rule 6
 * breach: an invented count, a legal-consequence claim, a severity word that
 * contradicts the deterministic mapping. A report that ships one of those is
 * worse than no report, so these reject to exhaustion.
 *
 * `style` is a rule about wording placement and register. Losing an entire
 * bilingual report - a paid scan, both analyses, the operator's day - over how
 * often an approved phrase appears is the worse trade, and the operator reviews
 * every report before approving it. Issue #407: on the final attempt only, an
 * output whose remaining violations are all `style` is accepted and the escapes
 * are logged and counted. Earlier attempts still reject on style, so the model
 * is still asked to fix it while there is budget to do so.
 */
export type WritingGuardSeverity = 'blocking' | 'style';

export interface WritingGuard {
  readonly name: WritingGuardName;
  readonly severity: WritingGuardSeverity;
  /** The operator-facing reason this attempt failed, or `null` when it
   *  passed. The reason carries the guard's own retry hint where it has one,
   *  because the reason is what the next attempt's correction is built from. */
  readonly check: (output: WritingPassOutput) => string | null;
}

/**
 * Every content guard the writing pass applies, in the order a failure is
 * reported.
 *
 * The order is load-bearing and is the order the fourteen copy-pasted
 * `if (violations.length > 0) { ...; continue; }` blocks used to run in: a
 * substantive breach is listed before a style drift, so when a response trips
 * both, the substantive one is what the operator reads first. Issue #406 turned
 * those blocks into this table because running them in sequence meant an
 * attempt reported exactly one defect, and three independent defects could not
 * be corrected inside a three-attempt budget however well the model fixed each
 * one it was told about.
 */
export function buildWritingGuards(
  input: WritingInput,
  expectedThemeKeys: readonly string[],
  assignedProviderPhrase: string,
): readonly WritingGuard[] {
  const language = input.language;
  return [
    {
      name: 'theme-key',
      severity: 'blocking',
      check: (output) => {
        const mismatch = findThemeKeyMismatches(expectedThemeKeys, output);
        if (isThemeKeyMismatchEmpty(mismatch)) return null;
        return `theme key mismatch - missing: [${mismatch.missing.join(', ')}], extra: [${mismatch.extra.join(', ')}], duplicate: [${mismatch.duplicate.join(', ')}]`;
      },
    },
    {
      name: 'theme-title',
      severity: 'blocking',
      check: (output) => {
        const violations = findThemeTitleViolations(output, language);
        if (violations.length === 0) return null;
        return `theme title must be a short noun phrase: ${violations.map((v) => `${v.field} (${v.reason})`).join(', ')}`;
      },
    },
    {
      name: 'language-compliance',
      severity: 'blocking',
      check: (output) => {
        const violations = findLanguageComplianceViolations(output, language);
        if (violations.length === 0) return null;
        return `language compliance violations in field(s): ${violations.map((v) => v.field).join(', ')}`;
      },
    },
    {
      name: 'severity-vocabulary',
      severity: 'blocking',
      check: (output) => {
        const violations = findSeverityVocabularyViolations(output, language);
        if (violations.length === 0) return null;
        return `severity vocabulary violations in field(s): ${violations.map((v) => `${v.field} ("${v.matched}")`).join(', ')}`;
      },
    },
    {
      // Ahead of the digit guard deliberately: a sanction claim is a rule 6
      // breach, not a style drift, so it should lead the reason recorded when
      // a response trips both.
      name: 'legal-consequence',
      severity: 'blocking',
      check: (output) => {
        const violations = findLegalConsequenceViolations(output, language);
        if (violations.length === 0) return null;
        return `legal-consequence claim in field(s): ${violations.map((v) => `${v.field} ("${v.matched}" in "${excerptAroundMatch(v.text, v.matched)}")`).join(', ')}`;
      },
    },
    {
      name: 'page-count',
      severity: 'blocking',
      check: (output) => {
        const violations = findPageCountViolations(output, language);
        if (violations.length === 0) return null;
        return `invented page count in field(s): ${violations.map((v) => `${v.field} ("${v.matched}")`).join(', ')}`;
      },
    },
    {
      // Same reasoning as the page-count guard above, generalized to the
      // finding noun and severity words: audit-rehearsal notes recorded
      // reports contradicting their own finding counts in prose, which the
      // report template already owns and renders correctly.
      name: 'finding-count',
      severity: 'blocking',
      check: (output) => {
        const violations = findFindingCountViolations(output, language);
        if (violations.length === 0) return null;
        return `invented finding count in field(s): ${violations.map((v) => `${v.field} ("${v.matched}")`).join(', ')}`;
      },
    },
    {
      // Audit-rehearsal notes recorded "la priorité 1 ci-dessus" pointing at
      // content that rendered below it - the writing pass has no visibility
      // into final page layout.
      name: 'positional-reference',
      severity: 'blocking',
      check: (output) => {
        const violations = findPositionalReferenceViolations(output, language);
        if (violations.length === 0) return null;
        return `positional reference to other report content in field(s): ${violations.map((v) => `${v.field} ("${v.matched}")`).join(', ')}`;
      },
    },
    {
      name: 'wcag-citation',
      severity: 'blocking',
      check: (output) => {
        const violations = findWcagCitationViolations(output);
        if (violations.length === 0) return null;
        return `outdated WCAG version citation in field(s): ${violations.map((v) => `${v.field} ("${v.matched}")`).join(', ')}`;
      },
    },
    {
      name: 'business-claim',
      severity: 'blocking',
      check: (output) => {
        const violations = findBusinessClaimViolations(output, language);
        if (violations.length === 0) return null;
        return `unhedged business-value claim in field(s): ${violations.map((v) => `${v.field} ("${v.matched}")`).join(', ')}`;
      },
    },
    {
      name: 'transactional-flow',
      severity: 'blocking',
      check: (output) => {
        const violations = findTransactionalFlowViolations(
          output,
          language,
          input.transactionalFlowStatus ?? 'unknown',
        );
        if (violations.length === 0) return null;
        return `transactional-flow claim conflicts with the deterministic signal in field(s): ${violations.map((v) => `${v.field} ("${v.matched}")`).join(', ')}`;
      },
    },
    {
      name: 'performance-evidence',
      severity: 'blocking',
      check: (output) => {
        const violations = findPerformanceEvidenceViolations(input, output);
        if (violations.length === 0) return null;
        return `performance prose contradicts reconciled evidence in field(s): ${violations.map((v) => `${v.field} (${v.metric})`).join(', ')}`;
      },
    },
    {
      name: 'executive-summary-digit',
      severity: 'blocking',
      check: (output) => {
        const violations = findExecutiveSummaryDigitViolations(output);
        if (violations.length === 0) return null;
        return `executiveSummary contains a digit, which the report template now owns: "${violations[0]!.text}"`;
      },
    },
    {
      // Issue #309: untranslated jargon in French prose and subjective
      // impressions of the site that no finding measures. A register defect
      // is a wording defect the operator's review catches, so it is a style
      // guard (issue #407).
      name: 'prose-register',
      severity: 'style',
      check: (output) => {
        const violations = findProseRegisterViolations(output, language);
        if (violations.length === 0) return null;
        return `prose register defect in field(s): ${violations.map((v) => `${v.field} (${v.matched})`).join(', ')}. ${PROSE_REGISTER_RETRY_HINT}`;
      },
    },
    {
      // Issue #309: the provider bolted onto the end of every action. This is
      // the guard that exhausted three attempts of a real ten-theme report on
      // its own (issue #407), which is why it is style rather than blocking.
      name: 'provider-placement',
      severity: 'style',
      check: (output) => {
        const violations = findProviderPlacementViolations(
          output,
          language,
          assignedProviderPhrase,
        );
        if (violations.length === 0) return null;
        return `provider named in the wrong place: ${violations.map((v) => `${v.field} (${v.matched})`).join(', ')}. ${providerPlacementRetryHint(assignedProviderPhrase)}`;
      },
    },
    {
      // Last deliberately: naming the provider two ways is a presentation
      // defect, not a claim the report should not be making, so a response
      // tripping this and a substantive guard records the substantive reason
      // first. Since the phrase is assigned in code and the prompt shows only
      // that one, this should be a guard that never fires; it stays because
      // the model can still reach for an approved synonym it was never shown
      // (see provider-phrase-guard.ts).
      name: 'provider-phrase',
      severity: 'style',
      check: (output) => {
        const violations = findProviderPhraseViolations(output, language, assignedProviderPhrase);
        if (violations.length === 0) return null;
        return `provider phrasing does not match the one assigned to this report: ${violations.map((v) => `${v.field} (${v.matched})`).join(', ')}. ${providerPhraseRetryHint(assignedProviderPhrase)}`;
      },
    },
  ];
}

export interface WritingGuardFailure {
  readonly guard: WritingGuardName;
  readonly severity: WritingGuardSeverity;
  readonly reason: string;
}

/** Runs every guard and returns all of them that failed, in table order.
 *  Issue #406: every guard runs, so one retry carries the complete
 *  correction list rather than the first defect found. */
export function runWritingGuards(
  guards: readonly WritingGuard[],
  output: WritingPassOutput,
): readonly WritingGuardFailure[] {
  const failures: WritingGuardFailure[] = [];
  for (const guard of guards) {
    const reason = guard.check(output);
    if (reason !== null) {
      failures.push({ guard: guard.name, severity: guard.severity, reason });
    }
  }
  return failures;
}
