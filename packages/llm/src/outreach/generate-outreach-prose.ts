import { MAX_RETRIES, OPENAI_MODEL, OPENAI_TEMPERATURE } from '../constants.js';
import { findLanguageComplianceViolationsInFields } from '../language-guard.js';
import { findLegalConsequenceViolationsInFields } from '../legal-consequence-guard.js';
import { paceRateLimitedRetry } from '../rate-limit-pacing.js';
import { normalizeOutreachOutputTypography } from '../typography.js';
import { findAliasViolations } from './guards/alias-guard.js';
import { findObservationScopeViolations } from './guards/observation-scope-guard.js';
import { findOutreachFormatViolations } from './guards/outreach-format-guard.js';
import { findOutreachNumberViolations } from './guards/outreach-number-guard.js';
import { findOutreachStructureViolations } from './guards/outreach-structure-guard.js';
import { findOutreachVocabularyViolations } from './guards/outreach-vocabulary-guard.js';
import { callOpenAiForOutreach } from './outreach-client.js';
import { OUTREACH_TOUCH_LIMITS } from './outreach-limits.js';
import type { OutreachProseInput } from './outreach-input.js';
import { buildOutreachRetryFeedback } from './outreach-prompt.js';
import { outreachProseFields, type OutreachProseOutput } from './outreach-schema.js';

export interface GenerateOutreachProseResult {
  output: OutreachProseOutput;
  model: string;
  temperature: number;
}

/** Extra attempts granted when an attempt fails on nothing but the touch-1
 *  word floor. Issue #14: in 2026-08 live Mistral measurements, temperature
 *  0.2 landed 56-58 words
 *  against the 60 floor often enough that roughly one run in two exhausted
 *  the base budget. A pure shortfall is the one rejection where every other
 *  guard has already passed, so an extra attempt is cheap and carries no
 *  doctrine risk: the floor itself is untouched, and each extra attempt runs
 *  the full guard gauntlet again. Any other rejection consumes the base
 *  budget exactly as before. */
export const WORD_SHORTFALL_EXTRA_ATTEMPTS = 2;

/** The escalation ceiling for the word ask on repeated shortfalls: the
 *  doctrine band's midpoint. The live runs undershoot whatever they are
 *  asked for by a handful of words, so asking past the floor is what makes
 *  the next attempt land inside 60 to 90; the cap keeps the ask well clear
 *  of the 90-word ceiling, where overshooting would trade a shortfall for
 *  its mirror image. */
const WORD_ASK_CEILING_ABOVE_MIN = 15;

/**
 * Retry-and-guard orchestration for one outreach touch, independent of the
 * paid structure/writing passes' own retry budgets (analyze-writing.ts,
 * analyze-structure.ts) - same MAX_RETRIES constant, separate loop. Unlike
 * those passes, a rejected attempt's reason is fed back into the next
 * call (issue #12): three identical prompts at the configured low
 * temperature produced three near identical undershoots in 2026-08 live
 * Mistral measurements,
 * so a retry must be a correction, not a rerun. A rejection that is nothing
 * but a word-count shortfall additionally buys attempts past the base
 * budget (issue #14): every other guard has already passed at that point,
 * and the ask escalates by the model's own undershoot so the next attempt
 * clears the floor instead of landing just beneath it.
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
  const baseAttempts = MAX_RETRIES + 1;
  const maxAttempts = baseAttempts + WORD_SHORTFALL_EXTRA_ATTEMPTS;
  let lastFailureReason = '';
  let previousRejection: string | undefined;
  let extraShortfallAttemptsUsed = 0;
  let attemptsUsed = 0;
  /** Whether the immediately preceding rejection was nothing but a
   *  word-count shortfall. Reset every attempt and set only by the structure
   *  block; the top-of-loop budget gate reads it. */
  let lastRejectionPureShortfall = false;
  /** The word total the current retry is asked for. undefined until a first
   *  shortfall, then escalated by the model's own undershoot so the next
   *  attempt lands inside the band rather than just below it. */
  let shortfallAsk: number | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Entering an attempt beyond the base budget is legitimate only when the
    // previous rejection was a pure word-count shortfall, and only while
    // extra attempts remain. Every other rejection spent the base budget.
    if (attempt > baseAttempts) {
      if (
        !lastRejectionPureShortfall ||
        extraShortfallAttemptsUsed >= WORD_SHORTFALL_EXTRA_ATTEMPTS
      )
        break;
      extraShortfallAttemptsUsed += 1;
    }
    attemptsUsed = attempt;
    lastRejectionPureShortfall = false;
    const attemptBudget = attempt <= baseAttempts ? baseAttempts : maxAttempts;
    const logPrefix = `odysseus outreach (touch ${input.touch}, language=${input.language}): attempt ${attempt}/${attemptBudget}`;

    let result: Awaited<ReturnType<typeof callOpenAiForOutreach>>;
    try {
      result = await callOpenAiForOutreach(input, previousRejection);
    } catch (error) {
      // Same posture as analyzeWriting/analyzeStructure: a parse/validation
      // failure or provider refusal is retried like any other rejected attempt.
      lastFailureReason = error instanceof Error ? error.message : String(error);
      previousRejection = buildOutreachRetryFeedback(lastFailureReason);
      console.error(`${logPrefix} failed - ${lastFailureReason}`);
      await paceRateLimitedRetry(attempt, lastFailureReason);
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
      // A pure shortfall (this violation and nothing else) is what buys
      // attempts beyond the base budget: everything except length has
      // already passed at this point.
      lastRejectionPureShortfall = shortfall !== undefined && structureViolations.length === 1;

      const count = shortfall?.detail !== undefined ? Number(shortfall.detail) : NaN;
      if (shortfall !== undefined && Number.isFinite(count)) {
        const min = OUTREACH_TOUCH_LIMITS[input.touch].minWords;
        const ask = shortfallAsk ?? min + 2;
        // Escalate by the model's own undershoot plus a margin (issue #14:
        // asked for 62 it delivered 56-58, so a fixed ask keeps landing just
        // below the floor), capped at the band's midpoint.
        shortfallAsk = Math.min(ask + (ask - count) + 2, min + WORD_ASK_CEILING_ABOVE_MIN);
        previousRejection = buildOutreachRetryFeedback(lastFailureReason, {
          count,
          min,
          target: ask,
        });
      } else {
        previousRejection = buildOutreachRetryFeedback(lastFailureReason);
      }
      console.error(`${logPrefix} rejected - ${lastFailureReason}`);
      continue;
    }

    return {
      output: normalizeOutreachOutputTypography(result.output, input.language),
      model: OPENAI_MODEL,
      temperature: OPENAI_TEMPERATURE,
    };
  }

  throw new Error(
    `odysseus outreach (touch ${input.touch}, language=${input.language}): exhausted ${attemptsUsed} attempts without a valid response. Last failure: ${lastFailureReason}`,
  );
}
