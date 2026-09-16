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
 * Since 2026-09-07 the phrase is chosen in code before the call (see
 * selectProviderPhrase below) and the prompt shows only that one, so this
 * guard no longer arbitrates between two phrasings the model was invited
 * to choose from. It asserts a single fact: nothing but the assigned
 * phrase names the provider.
 *
 * Using a non-assigned phrase is the only violation. A response that never
 * names the provider at all is left to the prompt: that would be a
 * different, unmeasured complaint, and this guard deliberately does not
 * invent one.
 */
export function findProviderPhraseViolationsInFields(
  fields: readonly ProseField[],
  language: ReportLanguage,
  selectedPhrase: string,
): ProviderPhraseViolation[] {
  const violations: ProviderPhraseViolation[] = [];

  for (const { field, text } of fields) {
    for (const phrase of phrasesUsedIn(text, language)) {
      // Anything other than the phrase this report was assigned is a
      // violation. The anchor is the code-chosen phrase, never "whichever
      // approved phrase appeared in the earliest-scanned field": that older
      // rule made the verdict depend on scan order, so a single stray
      // mention in `notes` could condemn sixteen internally consistent
      // recommendedActions (Briketenia EN, 2026-09-07).
      if (phrase !== selectedPhrase) {
        violations.push({
          field,
          text,
          matched: `"${phrase}" instead of the assigned "${selectedPhrase}"`,
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
  selectedPhrase: string,
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

  return findProviderPhraseViolationsInFields(fields, language, selectedPhrase);
}

/**
 * Picks the one phrase a given report may use, before the model is called.
 *
 * Why this exists, measured 2026-09-07: offering the model three approved
 * synonyms and then forbidding their mixture put two instructions in
 * tension, and the model resolved that tension the wrong way on five of
 * five live runs. Three of those five exhausted the retry budget and
 * produced no analysis at all, which under trade-off 44 means no
 * deliverable, since the paid deliverable is the French and English pair.
 *
 * Showing exactly one phrase makes the mixture unrepresentable in the same
 * spirit as trade-off 70's per-call theme-key schema: the failure is
 * removed by construction rather than caught after the fact. The guard
 * above survives as the assertion that should now never fire.
 *
 * The index is derived from the audit's identity, not the language, so the
 * French and English reports of one audit name the provider correspondingly
 * rather than drifting apart. A missing seed resolves to the first phrase,
 * which keeps stored-analysis tooling and fixtures deterministic.
 */
export function selectProviderPhrase(language: ReportLanguage, seed?: string): string {
  const phrases = TECHNICAL_PROVIDER_PHRASES[language];
  return phrases[selectProviderPhraseIndex(seed, phrases.length)] as string;
}

/** FNV-1a, chosen because it is a few lines of arithmetic with no
 *  dependency and a stable result across machines and Node versions - a
 *  report regenerated next year must land on the same phrase it shipped
 *  with, or a client comparing two copies sees their provider renamed. */
export function selectProviderPhraseIndex(seed: string | undefined, count: number): number {
  if (!seed) return 0;
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % count;
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
export function providerPhraseRetryHint(selectedPhrase: string): string {
  return `Use exactly "${selectedPhrase}" everywhere you name the provider, and no other wording for it. Do not make the sentences themselves uniform: the openings of your recommendedActions entries must still vary from theme to theme, and repeating one opening formula across every entry is its own defect.`;
}

/** The clause openers that attach the provider after a comma. Measured in
 *  issue #309 as the ending of almost every action in two production
 *  reports, where it produced causality that does not hold ("Chaque page
 *  doit déclarer une adresse canonique cohérente, car l'équipe technique
 *  ... évite ainsi..."). */
const TRAILING_PROVIDER_CLAUSE_OPENERS: Record<ReportLanguage, readonly string[]> = {
  fr: ['et', 'afin que', 'pour que', 'car', 'si bien que', 'de sorte que', 'ce qui permet à'],
  en: ['and', 'so that', 'so', 'because', 'which lets', 'allowing'],
};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Issue #309: the prompt used to require the provider phrase in every
 * recommendedActions entry while forbidding an action to open on it, and the
 * model met both by bolting the provider onto the end of each sentence
 * ("..., et l'équipe technique en charge de votre site peut..."). The
 * prompt now asks for the provider at most once per theme, as the agent of
 * the main clause; this asserts both halves, since a prompt rule on
 * sentence shape alone has repeatedly not held (see the plan 027 notes
 * above).
 */
export function findProviderPlacementViolations(
  output: WritingPassOutput,
  language: ReportLanguage,
  selectedPhrase: string,
): ProviderPhraseViolation[] {
  const phrase = straighten(selectedPhrase);
  const trailingClause = new RegExp(
    `,\\s*(?:${TRAILING_PROVIDER_CLAUSE_OPENERS[language].map(escapeRegExp).join('|')})\\s+${escapeRegExp(phrase)}`,
    'u',
  );
  const violations: ProviderPhraseViolation[] = [];

  output.themes.forEach((theme, i) => {
    const prefix = `themes[${i}](${theme.themeKey})`;
    const naming = theme.recommendedActions
      .map((action, j) => ({ action, j }))
      .filter(({ action }) => straighten(action).includes(phrase));
    if (naming.length > 1) {
      violations.push({
        field: `${prefix}.recommendedActions`,
        text: naming.map(({ action }) => action).join(' | '),
        matched: `"${selectedPhrase}" named in ${naming.length} actions of one theme`,
      });
    }
    for (const { action, j } of naming) {
      const clause = straighten(action).match(trailingClause);
      if (clause) {
        violations.push({
          field: `${prefix}.recommendedActions[${j}]`,
          text: action,
          matched: `provider attached after a comma ("${clause[0]}")`,
        });
      }
    }
  });

  return violations;
}

export function providerPlacementRetryHint(selectedPhrase: string): string {
  return `Name "${selectedPhrase}" in at most one recommendedActions entry per theme, and only as the agent of the main clause, never in a clause added after a comma. The other actions do not need to name the provider at all.`;
}
