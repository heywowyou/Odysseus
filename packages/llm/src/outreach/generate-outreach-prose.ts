import { MAX_RETRIES, MISTRAL_MODEL, MISTRAL_TEMPERATURE } from '../constants.js';
import { findLanguageComplianceViolationsInFields } from '../language-guard.js';
import { findLegalConsequenceViolationsInFields } from '../legal-consequence-guard.js';
import { normalizeOutreachOutputTypography } from '../typography.js';
import { findAliasViolations } from './guards/alias-guard.js';
import { findObservationScopeViolations } from './guards/observation-scope-guard.js';
import { findOutreachFormatViolations } from './guards/outreach-format-guard.js';
import { findOutreachNumberViolations } from './guards/outreach-number-guard.js';
import { findOutreachStructureViolations } from './guards/outreach-structure-guard.js';
import { findOutreachVocabularyViolations } from './guards/outreach-vocabulary-guard.js';
import { callMistralForOutreach } from './outreach-client.js';
import { OUTREACH_TOUCH_LIMITS } from './outreach-limits.js';
import type { OutreachProseInput } from './outreach-input.js';
import { buildOutreachRetryFeedback } from './outreach-prompt.js';
import { outreachProseFields, type OutreachProseOutput } from './outreach-schema.js';

export interface GenerateOutreachProseResult {
  output: OutreachProseOutput;
  model: string;
  temperature: number;
}

/**
 * Retry-and-guard orchestration for one outreach touch, independent of the
 * paid structure/writing passes' own retry budgets (analyze-writing.ts,
 * analyze-structure.ts) - same MAX_RETRIES constant, separate loop. Unlike
 * those passes, a rejected attempt's reason is fed back into the next
 * call (issue #12): three identical prompts at the configured low
 * temperature produced three near identical undershoots on live Mistral,
 * so a retry must be a correction, not a rerun.
 *
 * selectedObservationKey comes from SelectedOutreachEvidence
 * (packages/core/src/prospecting/outreach-evidence-selection.ts), never from
 * OutreachProseInput itself - outreach-input.ts deliberately withholds it
 * from what the model is shown, so it has to be threaded in alongside the
 * narrow input rather than read back off it. undefined for touch 3, which
 * carries no evidence at all.
 *
 * Guard order is ranked by doctrine severity, not call convenience, since
 * order decides which reason gets logged when a response fails more than
 * one check: alias, observation scope, vocabulary, legal consequence,
 * number, format, language, structure. Typography normalization runs last,
 * after every guard has passed, so no guard inspects text it rewrote.
 */
export async function generateOutreachProse(
  input: OutreachProseInput,
  selectedObservationKey: string | undefined,
): Promise<GenerateOutreachProseResult> {
  let lastFailureReason = '';
  let previousRejection: string | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    const logPrefix = `odysseus outreach (touch ${input.touch}, language=${input.language}): attempt ${attempt}/${MAX_RETRIES + 1}`;

    let result: Awaited<ReturnType<typeof callMistralForOutreach>>;
    try {
      result = await callMistralForOutreach(input, previousRejection);
    } catch (error) {
      // Same posture as analyzeWriting/analyzeStructure: a parse/validation
      // failure is retried like any other rejected attempt, including
      // refusal-like model behavior, since Mistral has no distinct refusal
      // signal.
      lastFailureReason = error instanceof Error ? error.message : String(error);
      previousRejection = buildOutreachRetryFeedback(lastFailureReason);
      console.error(`${logPrefix} failed - ${lastFailureReason}`);
      continue;
    }

    const fields = outreachProseFields(result.output);

    const aliasViolations = findAliasViolations(input, result.output);
    if (aliasViolations.length > 0) {
      lastFailureReason = `alias violation in field(s): ${aliasViolations.map((v) => `${v.field} (${v.reason})`).join(', ')}`;
      previousRejection = buildOutreachRetryFeedback(lastFailureReason);
      console.error(`${logPrefix} rejected - ${lastFailureReason}`);
      continue;
    }

    const scopeViolations = findObservationScopeViolations(result.output, selectedObservationKey);
    if (scopeViolations.length > 0) {
      lastFailureReason = `observation scope violation in field(s): ${scopeViolations.map((v) => `${v.field} ("${v.matched}")`).join(', ')}`;
      previousRejection = buildOutreachRetryFeedback(lastFailureReason);
      console.error(`${logPrefix} rejected - ${lastFailureReason}`);
      continue;
    }

    const vocabularyViolations = findOutreachVocabularyViolations(fields, input.language);
    if (vocabularyViolations.length > 0) {
      lastFailureReason = `vocabulary violation in field(s): ${vocabularyViolations.map((v) => `${v.field} (${v.rule}: "${v.matched}")`).join(', ')}`;
      previousRejection = buildOutreachRetryFeedback(lastFailureReason);
      console.error(`${logPrefix} rejected - ${lastFailureReason}`);
      continue;
    }

    const legalViolations = findLegalConsequenceViolationsInFields(fields, input.language);
    if (legalViolations.length > 0) {
      lastFailureReason = `legal-consequence claim in field(s): ${legalViolations.map((v) => `${v.field} ("${v.matched}")`).join(', ')}`;
      previousRejection = buildOutreachRetryFeedback(lastFailureReason);
      console.error(`${logPrefix} rejected - ${lastFailureReason}`);
      continue;
    }

    const numberViolations = findOutreachNumberViolations(fields);
    if (numberViolations.length > 0) {
      lastFailureReason = `digit in field(s): ${numberViolations.map((v) => `${v.field} ("${v.matched}")`).join(', ')}`;
      previousRejection = buildOutreachRetryFeedback(lastFailureReason);
      console.error(`${logPrefix} rejected - ${lastFailureReason}`);
      continue;
    }

    const formatViolations = findOutreachFormatViolations(fields);
    if (formatViolations.length > 0) {
      lastFailureReason = `format violation in field(s): ${formatViolations.map((v) => `${v.field} (${v.rule}: "${v.matched}")`).join(', ')}`;
      previousRejection = buildOutreachRetryFeedback(lastFailureReason);
      console.error(`${logPrefix} rejected - ${lastFailureReason}`);
      continue;
    }

    const languageViolations = findLanguageComplianceViolationsInFields(fields, input.language, {
      dualDetect: true,
    });
    if (languageViolations.length > 0) {
      lastFailureReason = `language compliance violations in field(s): ${languageViolations.map((v) => v.field).join(', ')}`;
      previousRejection = buildOutreachRetryFeedback(lastFailureReason);
      console.error(`${logPrefix} rejected - ${lastFailureReason}`);
      continue;
    }

    const structureViolations = findOutreachStructureViolations(result.output);
    if (structureViolations.length > 0) {
      lastFailureReason = `structure violation in field(s): ${structureViolations.map((v) => `${v.field} (${v.reason}${v.detail !== undefined ? `: ${v.detail}` : ''})`).join(', ')}`;
      // A word-count shortfall is the one rejection the model demonstrably
      // cannot fix from the reason string alone (issue #12: 56 -> 57 -> 59
      // across three told-apart attempts), so it gets the arithmetic spelled
      // out: what was counted, what the floor is, what to write instead.
      const shortfall = structureViolations.find((v) => v.reason === 'too-few-words');
      const wordShortfall =
        shortfall?.detail !== undefined
          ? {
              count: Number(shortfall.detail),
              min: OUTREACH_TOUCH_LIMITS[input.touch].minWords,
            }
          : undefined;
      previousRejection = buildOutreachRetryFeedback(lastFailureReason, wordShortfall);
      console.error(`${logPrefix} rejected - ${lastFailureReason}`);
      continue;
    }

    return {
      output: normalizeOutreachOutputTypography(result.output, input.language),
      model: MISTRAL_MODEL,
      temperature: MISTRAL_TEMPERATURE,
    };
  }

  throw new Error(
    `odysseus outreach (touch ${input.touch}, language=${input.language}): exhausted ${MAX_RETRIES + 1} attempts without a valid response. Last failure: ${lastFailureReason}`,
  );
}
