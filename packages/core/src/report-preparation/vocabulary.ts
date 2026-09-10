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

/** Situations the operator can pick from, exactly the six approved choices. */
export const REPORT_SITUATIONS = [
  'no-work-started',
  'redesign-underway',
  'corrections-underway',
  'accessibility-programme',
  'periodic-review',
  'unknown',
] as const;

export type ReportSituation = (typeof REPORT_SITUATIONS)[number];

/** Triggers the operator can pick from, exactly the nine approved choices. */
export const REPORT_TRIGGERS = [
  'legal-question',
  'customer-complaint',
  'booking-or-conversion',
  'search-visibility',
  'redesign',
  'procurement',
  'commercial-discussion',
  'proactive-review',
  'other',
] as const;

export type ReportTrigger = (typeof REPORT_TRIGGERS)[number];

/** Stakeholder roles allowed to carry a name. No free-form roles. */
export const REPORT_STAKEHOLDER_ROLES = [
  'management',
  'technical',
  'communications',
  'legal',
] as const;

export type ReportStakeholderRole = (typeof REPORT_STAKEHOLDER_ROLES)[number];

/** Hook families the automatic opening hook can resolve to. */
export const HOOK_FAMILIES = [
  'accessibility',
  'speed-and-booking',
  'search-and-ai-visibility',
  'privacy',
  'mixed',
] as const;

export type HookFamily = (typeof HOOK_FAMILIES)[number];

/** Journey catalogue IDs. Closed: adding one requires a new evidence
 *  predicate and step evaluators (trade-off 62). */
export const JOURNEY_IDS = ['discovery-navigation', 'transaction-booking'] as const;

export type JourneyId = (typeof JOURNEY_IDS)[number];

/** Stable step IDs inside the closed journey catalogue. Operators never
 *  choose these; each needs a failure detector and positive evidence that
 *  the detector ran before it can render anything but `not-evaluated`. */
export type JourneyStepId = 'arrival-page' | 'main-pages' | 'booking-page' | 'booking-form';

/** The three and only three states a displayed journey step can have. */
export const JOURNEY_STEP_STATES = [
  'issue-observed',
  'no-issue-detected',
  'not-evaluated',
] as const;

export type JourneyStepState = (typeof JOURNEY_STEP_STATES)[number];

/** Operator decision stored against a stable catalogue journey ID. */
export const JOURNEY_DECISIONS = ['confirmed', 'removed'] as const;

export type JourneyDecisionKind = (typeof JOURNEY_DECISIONS)[number];

/** Length bounds for operator-entered text. The Zod schemas reject anything
 *  longer instead of clamping, so stored text is never silently truncated. */
export const MAX_CUSTOM_COVER_QUESTION_LENGTH = 200;
export const MAX_TRIGGER_OTHER_NOTE_LENGTH = 300;
export const MAX_STAKEHOLDER_NAME_LENGTH = 80;

export const SITUATION_COPY: Record<ReportSituation, BilingualCopy> = {
  'no-work-started': {
    fr: 'Aucun travail commencé',
    en: 'No work started',
  },
  'redesign-underway': {
    fr: 'Refonte prévue ou en cours',
    en: 'Redesign planned or underway',
  },
  'corrections-underway': {
    fr: 'Corrections en cours',
    en: 'Corrections underway',
  },
  'accessibility-programme': {
    fr: "Programme d'accessibilité existant",
    en: 'Existing accessibility programme',
  },
  'periodic-review': {
    fr: 'Revue périodique',
    en: 'Periodic review',
  },
  unknown: {
    fr: 'Inconnue',
    en: 'Unknown',
  },
};

/** The automatic question for each situation. `unknown` has none: it falls
 *  back to the generic question, which is why the generic bytes live here. */
export const SITUATION_QUESTION_COPY: Partial<Record<ReportSituation, BilingualCopy>> = {
  'no-work-started': {
    fr: 'Par où commencer pour rendre ce site plus accessible, plus rapide et plus visible ?',
    en: 'Where should you start to make this site more accessible, faster, and easier to find?',
  },
  'redesign-underway': {
    fr: 'Votre refonte est prévue ou en cours : que faut-il corriger avant la mise en ligne ?',
    en: 'Your redesign is planned or underway: what should be fixed before launch?',
  },
  'corrections-underway': {
    fr: 'Vos corrections sont en cours : que reste-t-il à traiter, et dans quel ordre ?',
    en: 'Your corrections are underway: what remains, and in what order?',
  },
  'accessibility-programme': {
    fr: "Votre programme d'accessibilité est engagé : où en êtes-vous réellement ?",
    en: 'Your accessibility programme is underway: where do you actually stand?',
  },
  'periodic-review': {
    fr: "Qu'est-ce qui a changé sur votre site depuis la dernière revue ?",
    en: 'What has changed on your site since the last review?',
  },
};

/**
 * The canonical generic decision question, plan 018 step 4. French bytes are
 * the mockup's own script data (docs/report/design/
 * report-mockup-standalone.flat.html, meta.question) kept byte-identical:
 * U+2019 in "l’état", plain spaces, plain "?" - the report must not
 * paraphrase the one sentence both the cover and the opening display, since
 * plan 018 step 5 asserts the two render sites agree exactly. The single
 * string table lives here in core so the preparation preview and the report
 * package cannot drift apart; packages/report re-exports the resolver.
 */
const GENERIC_DECISION_QUESTION_FR = 'Quel est l’état actuel de votre site, et par où commencer ?';

const GENERIC_DECISION_QUESTION_EN =
  'What is the current state of your site, and where should you start?';

export function resolveGenericDecisionQuestion(language: ReportLanguage): string {
  return language === 'fr' ? GENERIC_DECISION_QUESTION_FR : GENERIC_DECISION_QUESTION_EN;
}

export const TRIGGER_COPY: Record<ReportTrigger, BilingualCopy> = {
  'legal-question': { fr: 'Question juridique', en: 'Legal question' },
  'customer-complaint': { fr: 'Réclamation client', en: 'Customer complaint' },
  'booking-or-conversion': { fr: 'Réservation ou conversion', en: 'Booking or conversion' },
  'search-visibility': {
    fr: 'Visibilité dans les moteurs de recherche',
    en: 'Search visibility',
  },
  redesign: { fr: 'Refonte', en: 'Redesign' },
  procurement: { fr: "Appel d'offres", en: 'Procurement' },
  'commercial-discussion': { fr: 'Discussion commerciale', en: 'Commercial discussion' },
  'proactive-review': { fr: 'Revue proactive', en: 'Proactive review' },
  other: { fr: 'Autre', en: 'Other' },
};

export const STAKEHOLDER_ROLE_COPY: Record<ReportStakeholderRole, BilingualCopy> = {
  management: { fr: 'Direction', en: 'Management' },
  technical: { fr: 'Technique ou IT', en: 'Technical or IT' },
  communications: { fr: 'Communication', en: 'Communications' },
  legal: { fr: 'Juridique', en: 'Legal' },
};

/** One opening-hook sentence per family, replacing plan 018's generic hook
 *  when preparation exists. Remediation-neutral and claim-free. */
export const HOOK_FAMILY_COPY: Record<HookFamily, BilingualCopy> = {
  accessibility: {
    fr: "L'accessibilité de votre site concentre le plus de constats de ce rapport.",
    en: 'Accessibility carries the most findings in this report.',
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
    fr: 'Ce rapport mélange plusieurs sujets urgents : accessibilité, performance, visibilité et protection des données.',
    en: 'This report mixes several urgent subjects: accessibility, performance, visibility, and data protection.',
  },
};

export interface JourneyStepCopy {
  stepId: JourneyStepId;
  label: BilingualCopy;
  description: BilingualCopy;
}

export interface JourneyCopyEntry {
  label: BilingualCopy;
  description: BilingualCopy;
  steps: readonly JourneyStepCopy[];
}

export const JOURNEY_COPY: Record<JourneyId, JourneyCopyEntry> = {
  'discovery-navigation': {
    label: { fr: 'Découverte et navigation', en: 'Discovery and navigation' },
    description: {
      fr: "Ce parcours vérifie ce qu'un visiteur voit en arrivant et en naviguant sur les pages principales.",
      en: 'This journey covers what a visitor sees when arriving and moving through the main pages.',
    },
    steps: [
      {
        stepId: 'arrival-page',
        label: { fr: "Page d'arrivée", en: 'Arrival page' },
        description: {
          fr: 'Ce que la première page visitée affiche.',
          en: 'What the first visited page displays.',
        },
      },
      {
        stepId: 'main-pages',
        label: { fr: 'Pages principales', en: 'Main pages' },
        description: {
          fr: "Ce que les pages principales révèlent aux contrôles d'accessibilité.",
          en: 'What the main pages reveal to the accessibility checks.',
        },
      },
    ],
  },
  'transaction-booking': {
    label: { fr: 'Réservation et transaction', en: 'Booking and transaction' },
    description: {
      fr: "Ce parcours vérifie ce qu'un visiteur voit lorsqu'il entame une réservation ou un achat.",
      en: 'This journey covers what a visitor sees when starting a booking or purchase.',
    },
    steps: [
      {
        stepId: 'booking-page',
        label: { fr: 'Page de réservation', en: 'Booking page' },
        description: {
          fr: 'Ce que la page de réservation affiche.',
          en: 'What the booking page displays.',
        },
      },
      {
        stepId: 'booking-form',
        label: { fr: 'Formulaire de réservation', en: 'Booking form' },
        description: {
          fr: "Ce que le formulaire de réservation révèle aux contrôles d'accessibilité.",
          en: 'What the booking form reveals to the accessibility checks.',
        },
      },
    ],
  },
};

/** The tri-state wording, exactly three approved states. */
export const JOURNEY_STEP_STATE_COPY: Record<JourneyStepState, BilingualCopy> = {
  'issue-observed': { fr: 'Problème constaté', en: 'Issue observed' },
  'no-issue-detected': { fr: 'Aucun problème détecté', en: 'No issue detected' },
  'not-evaluated': { fr: 'Non évalué', en: 'Not evaluated' },
};
