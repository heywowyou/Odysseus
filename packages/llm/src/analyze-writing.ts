import { callOpenAiForWriting } from './client.js';
import { OPENAI_MODEL, WRITING_OPENAI_TEMPERATURE, MAX_RETRIES } from './constants.js';
import { findBusinessClaimViolations } from './business-claim-guard.js';
import { findExecutiveSummaryDigitViolations } from './executive-summary-digit-guard.js';
import { findLanguageComplianceViolations } from './language-guard.js';
import { findLegalConsequenceViolations } from './legal-consequence-guard.js';
import { findPageCountViolations } from './page-count-guard.js';
import {
  findProviderPhraseViolations,
  PROVIDER_PHRASE_RETRY_HINT,
} from './provider-phrase-guard.js';
import { findSeverityVocabularyViolations } from './severity-vocabulary-guard.js';
import { buildWritingRetryFeedback } from './writing-prompt.js';
import { normalizeWritingOutputTypography } from './typography.js';
import { findThemeKeyMismatches, isThemeKeyMismatchEmpty } from './theme-key-guard.js';
import { findTransactionalFlowViolations } from './transactional-flow-guard.js';
import { findWcagCitationViolations } from './wcag-citation-guard.js';
import { paceRateLimitedRetry } from './rate-limit-pacing.js';
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
 *  logged, retried, then fail loudly. See docs/rules/llm-layer-rules.md
 *  sections 2, 6, and 9.
 *
 *  Unlike the structure pass, each retry carries the previous attempt's
 *  rejection reason into the next call (issue #21): at the configured
 *  low temperature an identical conversation reproduced the same
 *  violation on every attempt, so a retry has to be a correction. Same
 *  mechanism as the outreach loop (issue #12). */
export async function analyzeWriting(
  input: WritingInput,
  expectedThemeKeys: readonly string[],
  usedFallbackContext: boolean,
): Promise<AnalyzeWritingResult> {
  let lastFailureReason = '';
  let previousRejection: string | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    let result: Awaited<ReturnType<typeof callOpenAiForWriting>>;
    try {
      result = await callOpenAiForWriting(input, usedFallbackContext, previousRejection);
    } catch (error) {
      // See analyzeStructure's identical comment - a parse/validation
      // failure or provider refusal is retried like any other rejected attempt.
      lastFailureReason = error instanceof Error ? error.message : String(error);
      previousRejection = buildWritingRetryFeedback(lastFailureReason);
      console.error(
        `odysseus analyze (writing pass, language=${input.language}): attempt ${attempt}/${MAX_RETRIES + 1} failed - ${lastFailureReason}`,
      );
      await paceRateLimitedRetry(attempt, lastFailureReason);
      continue;
    }

    const mismatch = findThemeKeyMismatches(expectedThemeKeys, result.output);
    if (!isThemeKeyMismatchEmpty(mismatch)) {
      lastFailureReason = `theme key mismatch - missing: [${mismatch.missing.join(', ')}], extra: [${mismatch.extra.join(', ')}], duplicate: [${mismatch.duplicate.join(', ')}]`;
      previousRejection = buildWritingRetryFeedback(lastFailureReason);
      console.error(
        `odysseus analyze (writing pass, language=${input.language}): attempt ${attempt}/${MAX_RETRIES + 1} rejected - ${lastFailureReason}`,
      );
      continue;
    }

    const violations = findLanguageComplianceViolations(result.output, input.language);
    if (violations.length > 0) {
      lastFailureReason = `language compliance violations in field(s): ${violations.map((v) => v.field).join(', ')}`;
      previousRejection = buildWritingRetryFeedback(lastFailureReason);
      console.error(
        `odysseus analyze (writing pass, language=${input.language}): attempt ${attempt}/${MAX_RETRIES + 1} rejected - ${lastFailureReason}`,
      );
      continue;
    }

    const severityViolations = findSeverityVocabularyViolations(result.output, input.language);
    if (severityViolations.length > 0) {
      lastFailureReason = `severity vocabulary violations in field(s): ${severityViolations.map((v) => `${v.field} ("${v.matched}")`).join(', ')}`;
      previousRejection = buildWritingRetryFeedback(lastFailureReason);
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
      previousRejection = buildWritingRetryFeedback(lastFailureReason);
      console.error(
        `odysseus analyze (writing pass, language=${input.language}): attempt ${attempt}/${MAX_RETRIES + 1} rejected - ${lastFailureReason}`,
      );
      continue;
    }

    const pageCountViolations = findPageCountViolations(result.output, input.language);
    if (pageCountViolations.length > 0) {
      lastFailureReason = `invented page count in field(s): ${pageCountViolations.map((v) => `${v.field} ("${v.matched}")`).join(', ')}`;
      previousRejection = buildWritingRetryFeedback(lastFailureReason);
      console.error(
        `odysseus analyze (writing pass, language=${input.language}): attempt ${attempt}/${MAX_RETRIES + 1} rejected - ${lastFailureReason}`,
      );
      continue;
    }

    const wcagViolations = findWcagCitationViolations(result.output);
    if (wcagViolations.length > 0) {
      lastFailureReason = `outdated WCAG version citation in field(s): ${wcagViolations.map((v) => `${v.field} ("${v.matched}")`).join(', ')}`;
      previousRejection = buildWritingRetryFeedback(lastFailureReason);
      console.error(
        `odysseus analyze (writing pass, language=${input.language}): attempt ${attempt}/${MAX_RETRIES + 1} rejected - ${lastFailureReason}`,
      );
      continue;
    }

    const businessViolations = findBusinessClaimViolations(result.output, input.language);
    if (businessViolations.length > 0) {
      lastFailureReason = `unhedged business-value claim in field(s): ${businessViolations.map((v) => `${v.field} ("${v.matched}")`).join(', ')}`;
      previousRejection = buildWritingRetryFeedback(lastFailureReason);
      console.error(
        `odysseus analyze (writing pass, language=${input.language}): attempt ${attempt}/${MAX_RETRIES + 1} rejected - ${lastFailureReason}`,
      );
      continue;
    }

    const transactionalFlowViolations = findTransactionalFlowViolations(
      result.output,
      input.language,
      input.transactionalFlowStatus ?? 'unknown',
    );
    if (transactionalFlowViolations.length > 0) {
      lastFailureReason = `transactional-flow claim conflicts with the deterministic signal in field(s): ${transactionalFlowViolations.map((v) => `${v.field} ("${v.matched}")`).join(', ')}`;
      previousRejection = buildWritingRetryFeedback(lastFailureReason);
      console.error(
        `odysseus analyze (writing pass, language=${input.language}): attempt ${attempt}/${MAX_RETRIES + 1} rejected - ${lastFailureReason}`,
      );
      continue;
    }

    const digitViolations = findExecutiveSummaryDigitViolations(result.output);
    if (digitViolations.length > 0) {
      lastFailureReason = `executiveSummary contains a digit, which the report template now owns: "${digitViolations[0]!.text}"`;
      previousRejection = buildWritingRetryFeedback(lastFailureReason);
      console.error(
        `odysseus analyze (writing pass, language=${input.language}): attempt ${attempt}/${MAX_RETRIES + 1} rejected - ${lastFailureReason}`,
      );
      continue;
    }

    // Last of the rejecting guards deliberately: naming the provider two
    // ways is a presentation defect, not a claim the report should not be
    // making, so a response tripping this and a substantive guard records
    // the substantive reason. Prompt text alone did not hold this - every
    // regenerated French analysis mixed two approved phrasings at both 0.7
    // and 1.0 (see provider-phrase-guard.ts).
    const providerPhraseViolations = findProviderPhraseViolations(result.output, input.language);
    if (providerPhraseViolations.length > 0) {
      lastFailureReason = `provider phrasing is not consistent across the response: ${providerPhraseViolations.map((v) => `${v.field} (${v.matched})`).join(', ')}. ${PROVIDER_PHRASE_RETRY_HINT}`;
      previousRejection = buildWritingRetryFeedback(lastFailureReason);
      console.error(
        `odysseus analyze (writing pass, language=${input.language}): attempt ${attempt}/${MAX_RETRIES + 1} rejected - ${lastFailureReason}`,
      );
      continue;
    }

    // Normalization, not validation: applied after every rejecting guard
    // has passed, so a guard never inspects text this rewrote.
    return {
      output: normalizeWritingOutputTypography(result.output, input.language),
      model: OPENAI_MODEL,
      temperature: WRITING_OPENAI_TEMPERATURE,
    };
  }

  throw new Error(
    `odysseus analyze (writing pass, language=${input.language}): exhausted ${MAX_RETRIES + 1} attempts without a valid response. Last failure: ${lastFailureReason}`,
  );
}
