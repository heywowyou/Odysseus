import { callMistralForWriting } from './client.js';
import { MISTRAL_MODEL, MISTRAL_TEMPERATURE, MAX_RETRIES } from './constants.js';
import { findBusinessClaimViolations } from './business-claim-guard.js';
import { findExecutiveSummaryDigitViolations } from './executive-summary-digit-guard.js';
import { findLanguageComplianceViolations } from './language-guard.js';
import { findLegalConsequenceViolations } from './legal-consequence-guard.js';
import { findPageCountViolations } from './page-count-guard.js';
import { findSeverityVocabularyViolations } from './severity-vocabulary-guard.js';
import { normalizeWritingOutputTypography } from './typography.js';
import { findThemeKeyMismatches, isThemeKeyMismatchEmpty } from './theme-key-guard.js';
import { findWcagCitationViolations } from './wcag-citation-guard.js';
import type { WritingInput, WritingPassOutput } from './writing-schema.js';

export interface AnalyzeWritingResult {
  output: WritingPassOutput;
  model: string;
  temperature: number;
}

/** Retry-and-guard orchestration for the writing pass, independent of
 *  the structure pass's own retry budget. Rejects a response whose
 *  themeKeys don't exactly match what it was shown (the correlation
 *  guard needed to merge prose back onto the right structural theme),
 *  and rejects a response that fails the language-compliance heuristic.
 *  Both are treated exactly like an invented finding ID: rejected,
 *  logged, retried, then fail loudly. See docs/llm-layer-rules.md
 *  sections 2, 6, and 9. */
export async function analyzeWriting(
  input: WritingInput,
  expectedThemeKeys: readonly string[],
  usedFallbackContext: boolean,
): Promise<AnalyzeWritingResult> {
  let lastFailureReason = '';

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    let result: Awaited<ReturnType<typeof callMistralForWriting>>;
    try {
      result = await callMistralForWriting(input, usedFallbackContext);
    } catch (error) {
      // See analyzeStructure's identical comment - a parse/validation
      // failure is retried like any other rejected attempt, including
      // refusal-like model behavior since Mistral has no distinct refusal
      // signal.
      lastFailureReason = error instanceof Error ? error.message : String(error);
      console.error(
        `odysseus analyze (writing pass, language=${input.language}): attempt ${attempt}/${MAX_RETRIES + 1} failed - ${lastFailureReason}`,
      );
      continue;
    }

    const mismatch = findThemeKeyMismatches(expectedThemeKeys, result.output);
    if (!isThemeKeyMismatchEmpty(mismatch)) {
      lastFailureReason = `theme key mismatch - missing: [${mismatch.missing.join(', ')}], extra: [${mismatch.extra.join(', ')}], duplicate: [${mismatch.duplicate.join(', ')}]`;
      console.error(
        `odysseus analyze (writing pass, language=${input.language}): attempt ${attempt}/${MAX_RETRIES + 1} rejected - ${lastFailureReason}`,
      );
      continue;
    }

    const violations = findLanguageComplianceViolations(result.output, input.language);
    if (violations.length > 0) {
      lastFailureReason = `language compliance violations in field(s): ${violations.map((v) => v.field).join(', ')}`;
      console.error(
        `odysseus analyze (writing pass, language=${input.language}): attempt ${attempt}/${MAX_RETRIES + 1} rejected - ${lastFailureReason}`,
      );
      continue;
    }

    const severityViolations = findSeverityVocabularyViolations(result.output, input.language);
    if (severityViolations.length > 0) {
      lastFailureReason = `severity vocabulary violations in field(s): ${severityViolations.map((v) => `${v.field} ("${v.matched}")`).join(', ')}`;
      console.error(
        `odysseus analyze (writing pass, language=${input.language}): attempt ${attempt}/${MAX_RETRIES + 1} rejected - ${lastFailureReason}`,
      );
      continue;
    }

    // Ahead of the digit guard deliberately: a sanction claim is a rule 6
    // breach, not a style drift, so it should be the reason recorded when a
    // response trips both.
    const legalViolations = findLegalConsequenceViolations(result.output, input.language);
    if (legalViolations.length > 0) {
      lastFailureReason = `legal-consequence claim in field(s): ${legalViolations.map((v) => `${v.field} ("${v.matched}")`).join(', ')}`;
      console.error(
        `odysseus analyze (writing pass, language=${input.language}): attempt ${attempt}/${MAX_RETRIES + 1} rejected - ${lastFailureReason}`,
      );
      continue;
    }

    const pageCountViolations = findPageCountViolations(result.output, input.language);
    if (pageCountViolations.length > 0) {
      lastFailureReason = `invented page count in field(s): ${pageCountViolations.map((v) => `${v.field} ("${v.matched}")`).join(', ')}`;
      console.error(
        `odysseus analyze (writing pass, language=${input.language}): attempt ${attempt}/${MAX_RETRIES + 1} rejected - ${lastFailureReason}`,
      );
      continue;
    }

    const wcagViolations = findWcagCitationViolations(result.output);
    if (wcagViolations.length > 0) {
      lastFailureReason = `outdated WCAG version citation in field(s): ${wcagViolations.map((v) => `${v.field} ("${v.matched}")`).join(', ')}`;
      console.error(
        `odysseus analyze (writing pass, language=${input.language}): attempt ${attempt}/${MAX_RETRIES + 1} rejected - ${lastFailureReason}`,
      );
      continue;
    }

    const businessViolations = findBusinessClaimViolations(result.output, input.language);
    if (businessViolations.length > 0) {
      lastFailureReason = `unhedged business-value claim in field(s): ${businessViolations.map((v) => `${v.field} ("${v.matched}")`).join(', ')}`;
      console.error(
        `odysseus analyze (writing pass, language=${input.language}): attempt ${attempt}/${MAX_RETRIES + 1} rejected - ${lastFailureReason}`,
      );
      continue;
    }

    const digitViolations = findExecutiveSummaryDigitViolations(result.output);
    if (digitViolations.length > 0) {
      lastFailureReason = `executiveSummary contains a digit, which the report template now owns: "${digitViolations[0]!.text}"`;
      console.error(
        `odysseus analyze (writing pass, language=${input.language}): attempt ${attempt}/${MAX_RETRIES + 1} rejected - ${lastFailureReason}`,
      );
      continue;
    }

    // Normalization, not validation: applied after every rejecting guard
    // has passed, so a guard never inspects text this rewrote.
    return {
      output: normalizeWritingOutputTypography(result.output, input.language),
      model: MISTRAL_MODEL,
      temperature: MISTRAL_TEMPERATURE,
    };
  }

  throw new Error(
    `odysseus analyze (writing pass, language=${input.language}): exhausted ${MAX_RETRIES + 1} attempts without a valid response. Last failure: ${lastFailureReason}`,
  );
}
