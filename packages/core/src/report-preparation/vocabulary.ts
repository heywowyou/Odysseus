import type { ReportLanguage } from '../types/llm-output.js';

/**
 * Closed report-preparation vocabularies with their bilingual copy, plan 019.
 * Every user-facing string here is fixed safe copy: it may be combined with
 * typed operator context, but the operator never writes prompt text and the
 * model never writes this copy. French and English are added together; a
 * missing localized value falls back to the generic copy for that language
 * only, never to the other language.
 *
 * No em dashes or en dashes: the writing system forbids them in product copy.
 */

export type BilingualCopy = Record<ReportLanguage, string>;

/** Hook families the automatic opening hook can resolve to. */
export const HOOK_FAMILIES = [
  'accessibility',
  'speed-and-booking',
  'search-and-ai-visibility',
  'privacy',
  'mixed',
] as const;

export type HookFamily = (typeof HOOK_FAMILIES)[number];

/** Length bounds for operator-entered text. The Zod schemas reject anything
 *  longer instead of clamping, so stored text is never silently truncated. */
export const MAX_CUSTOM_COVER_QUESTION_LENGTH = 200;

/**
 * The canonical generic decision question shared by preparation previews and
 * report rendering. Plan 046 replaced the old state-of-the-site wording with a
 * decision-oriented French question while keeping this as the single source of
 * truth so prepared and directly rendered reports cannot drift. Issue #331:
 * the English copy had been left at the old state-of-the-site wording, which
 * is not a translation of the French; it now mirrors the French question.
 */
const GENERIC_DECISION_QUESTION_FR =
  'Quels points de votre site faut-il corriger en priorité pour améliorer son accessibilité, sa visibilité et son utilisation ?';

const GENERIC_DECISION_QUESTION_EN =
  'Which parts of your site should be fixed as a priority to improve its accessibility, visibility, and usability?';

export function resolveGenericDecisionQuestion(language: ReportLanguage): string {
  return language === 'fr' ? GENERIC_DECISION_QUESTION_FR : GENERIC_DECISION_QUESTION_EN;
}

/** One opening-hook sentence per family, replacing plan 018's generic hook
 *  when preparation exists. Remediation-neutral and claim-free. */
export const HOOK_FAMILY_COPY: Record<HookFamily, BilingualCopy> = {
  accessibility: {
    fr: "L'accessibilité ressort comme l'un des principaux sujets de ce rapport.",
    en: 'Accessibility stands out as one of the main subjects of this report.',
  },
  'speed-and-booking': {
    fr: 'La vitesse de votre site agit directement sur vos réservations.',
    en: "Your site's speed has a direct effect on bookings.",
  },
  'search-and-ai-visibility': {
    fr: 'La visibilité de votre site dans les moteurs de recherche et les assistants IA est le fil conducteur de ce rapport.',
    en: "Your site's visibility in search engines and AI assistants is the common thread of this report.",
  },
  privacy: {
    fr: 'La protection des données de vos visiteurs concentre le plus de constats sérieux de ce rapport.',
    en: "Protecting your visitors' data carries the most weight among this report's findings.",
  },
  mixed: {
    fr: 'Plusieurs domaines appellent des corrections : accessibilité, performance, visibilité et protection des données.',
    en: 'Several areas call for corrections: accessibility, performance, visibility, and data protection.',
  },
};
