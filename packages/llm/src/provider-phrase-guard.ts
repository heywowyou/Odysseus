import type { ReportLanguage } from '@odysseus/core';
import type { ProseField } from './prose-fields.js';
import type { WritingPassOutput } from './writing-schema.js';

/**
 * Plan 027, lever A: the single mandated provider phrase ("votre
 * prestataire technique" every time, in every report) was measured to
 * produce eighteen identical recommendedActions openings across every
 * theme of every stored French analysis. The fix is not to drop the
 * consistency requirement - a report that names "your technical provider"
 * in one priority and "your agency" in the next still reads as two
 * parties - it's to stop mandating the exact same string across every
 * report ever generated. Each response commits to exactly one of these
 * per language and uses it from its first recommendedActions entry to its
 * last; different responses are free to land on different members.
 *
 * This table lives with the guard rather than with the prompt, so the
 * words the prompt offers and the words the guard accepts cannot drift
 * apart - the same arrangement SEVERITY_VOCABULARY and
 * REQUIRED_WCAG_VERSION already use. writing-prompt.ts imports it.
 */
export const TECHNICAL_PROVIDER_PHRASES: Record<ReportLanguage, readonly string[]> = {
  fr: [
    'votre prestataire technique',
    'votre prestataire web',
    "l'équipe technique en charge de votre site",
  ],
  en: ['your technical provider', 'your website provider', 'the technical team managing your site'],
};

export interface ProviderPhraseViolation {
  field: string;
  text: string;
  matched: string;
}

/** The model writes a real typographic apostrophe as often as a straight
 *  one, and the typography normalizer that would settle the difference
 *  runs only after every rejecting guard has passed. Matching on a
 *  straightened copy is what keeps "l'équipe technique en charge de votre
 *  site" detectable in both forms. */
function straighten(text: string): string {
  return text.replace(/[’ʼ]/g, "'").toLowerCase();
}

function phrasesUsedIn(text: string, language: ReportLanguage): string[] {
  const haystack = straighten(text);
  return TECHNICAL_PROVIDER_PHRASES[language].filter((phrase) =>
    haystack.includes(straighten(phrase)),
  );
}

/**
 * Rejects a response that names the client's provider two different ways.
 *
 * Measured need, not a hypothetical: at both 0.7 and 1.0 every regenerated
 * French analysis mixed two approved phrasings inside one report (Villas
 * Foch, 2026-09-07: "votre prestataire technique" 27 times alongside
 * "votre prestataire web" 9 times), despite the prompt saying in both
 * languages never to mix two phrasings within one response. Prompt text
 * alone does not hold this, and the failure it produces is the exact
 * "reads as two different parties" defect the varied-phrase change was
 * designed to avoid.
 *
 * Only mixing is a violation. A response that never names the provider at
 * all is left to the prompt: that would be a different, unmeasured
 * complaint, and this guard deliberately does not invent one.
 */
export function findProviderPhraseViolationsInFields(
  fields: readonly ProseField[],
  language: ReportLanguage,
): ProviderPhraseViolation[] {
  const violations: ProviderPhraseViolation[] = [];
  let committed: { phrase: string; field: string } | undefined;

  for (const { field, text } of fields) {
    for (const phrase of phrasesUsedIn(text, language)) {
      if (!committed) {
        committed = { phrase, field };
        continue;
      }
      // Anything other than the response's first phrase is a mix, and the
      // violation names both sides so the retry feedback can say which two
      // phrasings collided rather than just that something did.
      if (phrase !== committed.phrase) {
        violations.push({
          field,
          text,
          matched: `"${phrase}" after committing to "${committed.phrase}" in ${committed.field}`,
        });
      }
    }
  }

  return violations;
}

/** Same field walk as findSeverityVocabularyViolations, so a violation is
 *  reported against the same field names every other writing-pass guard
 *  uses. */
export function findProviderPhraseViolations(
  output: WritingPassOutput,
  language: ReportLanguage,
): ProviderPhraseViolation[] {
  const fields: ProseField[] = [
    { field: 'executiveSummary', text: output.executiveSummary },
    { field: 'notes', text: output.notes },
  ];

  output.themes.forEach((theme, i) => {
    const prefix = `themes[${i}](${theme.themeKey})`;
    fields.push({ field: `${prefix}.title`, text: theme.title });
    fields.push({ field: `${prefix}.businessImpact`, text: theme.businessImpact });
    theme.recommendedActions.forEach((action, j) => {
      fields.push({ field: `${prefix}.recommendedActions[${j}]`, text: action });
    });
  });

  return findProviderPhraseViolationsInFields(fields, language);
}

/**
 * Appended to this guard's rejection reason, and to nothing else.
 *
 * Measured need (2026-09-07, live): the generic retry feedback says only
 * that the response was inconsistent, and it is the last thing the model
 * reads. The cheapest way to satisfy "be consistent" is to make every
 * sentence identical, which is what happened - the Villas Foch retry came
 * back with all twenty-nine recommendedActions opening
 * "Demandez a votre prestataire technique de", against seventy-five
 * percent before the guard existed. That is the templated prose plan 027
 * exists to remove, so the correction has to say which words must match
 * and which must not.
 */
export const PROVIDER_PHRASE_RETRY_HINT =
  'Keep the phrasing you used first and change only the words that name the provider elsewhere. Do not make the sentences themselves uniform: the openings of your recommendedActions entries must still vary from theme to theme, and repeating one opening formula across every entry is its own defect.';
