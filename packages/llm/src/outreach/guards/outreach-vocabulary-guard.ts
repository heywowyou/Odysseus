import type { ReportLanguage } from '@odysseus/core';
import type { ProseField } from '../../prose-fields.js';

/**
 * Doctrine-specific vocabulary the outreach prose must never reach for,
 * scanned with plain patterns rather than a second model call, on
 * severity-vocabulary-guard.ts's reasoning: cold outreach prose has no
 * legitimate reason to use any of it, so a match is a rejection, not a
 * maybe. Each rule traces to a named prohibition in docs/outreach-rules.md:
 * section 4 (statistics), section 9 (conformity claim, competitor, free-mail,
 * price/offer, "predates 2025" answer), and this plan's own doctrine
 * decisions (meeting/phone ask keeps the automation boundary at the draft,
 * never the send or a call; both salutation rules because the salutation
 * itself is spliced by the assembler, never generated; curiosity-gap subject
 * lines
 * read as mass-mail tooling, the opposite of the one-verifiable-fact posture
 * argument A depends on).
 *
 * OUTREACH_PROHIBITED_EXAMPLES is the same ten categories restated as
 * concrete example strings for the system prompt (outreach-prompt.ts), kept
 * in this module so the two cannot drift apart the way SEVERITY_VOCABULARY
 * and the report's own severity strings are kept paired in one file.
 */
export interface OutreachVocabularyViolation {
  field: string;
  text: string;
  rule: string;
  matched: string;
}

const STATISTIC_PATTERNS: Record<ReportLanguage, RegExp[]> = {
  fr: [/\bpourcentage\b/i, /\bprévalence\b/i, /\bpopulation\b/i],
  en: [/\bpercentage\b/i, /\bprevalence\b/i, /\bpopulation\b/i],
};

const CONFORMITY_PATTERNS: Record<ReportLanguage, RegExp[]> = {
  fr: [/\baudit rgaa\b/i, /\btaux de conformité\b/i, /\bconformité officielle\b/i],
  en: [/\brgaa audit\b/i, /\bconformity rate\b/i, /\bofficial conformity\b/i],
};

const COMPETITOR_PATTERNS: Record<ReportLanguage, RegExp[]> = {
  fr: [/\bconcurrents?\b/i],
  en: [/\bcompetitors?\b/i],
};

const MEETING_PATTERNS: Record<ReportLanguage, RegExp[]> = {
  fr: [/\bappel téléphonique\b/i, /\brendez-vous\b/i, /\bappelez[- ]moi\b/i, /\bau téléphone\b/i],
  en: [
    /\bphone call\b/i,
    /\bschedule a call\b/i,
    /\bhop on a call\b/i,
    /\bset up a meeting\b/i,
    /\bbook a meeting\b/i,
  ],
};

const FREE_MAIL_PATTERNS: readonly RegExp[] = [
  /\bgmail\b/i,
  /\byahoo\b/i,
  /\bhotmail\b/i,
  /\boutlook\.(?:com|fr)\b/i,
  /\bfree\.fr\b/i,
  /\borange\.fr\b/i,
  /\blaposte\.net\b/i,
];

const PRICE_PATTERNS: Record<ReportLanguage, RegExp[]> = {
  fr: [/\bprix\b/i, /\btarifs?\b/i, /\bdevis\b/i, /€/u, /\bEUR\b/],
  en: [/\bprice\b/i, /\bquote\b/i, /\bpricing\b/i, /€/u, /\bEUR\b/],
};

const CURIOSITY_GAP_SUBJECT_PATTERNS: Record<ReportLanguage, RegExp[]> = {
  fr: [/\bquestion rapide\b/i, /\bêtes-vous disponible\b/i],
  en: [/\bquick question\b/i, /\bare you available\b/i, /\bguess what\b/i],
};

const PREDATES_2025_PATTERNS: Record<ReportLanguage, RegExp[]> = {
  fr: [/\bavant (?:le )?(?:1er )?juin 2025\b/i, /\bantérieur\w* (?:à|au) juin 2025\b/i],
  en: [/\bpredates june 2025\b/i, /\bbefore june 2025\b/i],
};

/**
 * The assembler always opens the body with its own greeting paragraph
 * (`copy.salutation` in outreach-draft-copy.ts), so any greeting the model
 * puts at the head of a field becomes the reader's *second* one. That is
 * exactly what a touch 1 read-through produced: "Bonjour," followed by
 * "Bonjour, nous avons regarde la version publique de votre site." - a first
 * line that reads like a broken mail merge, on a message whose argument is
 * that we notice details others miss.
 *
 * Anchored at the start of the field on purpose. The rule is about who owns
 * the opening line, not about the words themselves: "bonjour" mid-sentence is
 * ordinary prose, and there is no legitimate reason for a field to begin with
 * a form of address. Stating it here rather than in the prompt keeps it an
 * enforcement instead of a request (trade-off 11), and stating it once here
 * rather than half here and half in the assembler is why the guard now
 * rejects the generic case it used to permit.
 */
const LEADING_SALUTATION_PATTERNS: Record<ReportLanguage, RegExp[]> = {
  fr: [
    /^\s*(?:bonjour|bonsoir|salut|coucou|madame|monsieur|mesdames|messieurs|cher|chers|chère|chères)\b/iu,
  ],
  en: [/^\s*(?:hello|hi|hey|greetings|dear|good (?:morning|afternoon|evening))\b/iu],
};

/** madame/monsieur/sir/team etc are generic forms of address, not a name the
 *  model invented - a salutation is spliced by the assembler, so the model
 *  should not write one at all, but only an invented proper name is worth a
 *  distinct rule name over the generic address-word case. */
const GENERIC_ADDRESS_TERMS = new Set([
  'madame',
  'monsieur',
  'messieurs',
  'mesdames',
  'sir',
  'madam',
  'team',
  'équipe',
]);

function isUppercaseLetter(char: string): boolean {
  return char !== char.toLowerCase() && char === char.toUpperCase();
}

function checkNamedSalutation(text: string): string | null {
  const match = text.match(/\b(?:cher|chère|dear)\s+(\p{L}[\p{L}'-]*)/iu);
  if (!match) return null;
  const captured = match[1];
  if (captured === undefined) return null;
  if (!isUppercaseLetter(captured.charAt(0))) return null;
  if (GENERIC_ADDRESS_TERMS.has(captured.toLowerCase())) return null;
  return match[0];
}

function pushIfMatch(
  violations: OutreachVocabularyViolation[],
  field: string,
  text: string,
  rule: string,
  patterns: readonly RegExp[],
): void {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      violations.push({ field, text, rule, matched: match[0] });
      return;
    }
  }
}

export function findOutreachVocabularyViolations(
  fields: readonly ProseField[],
  language: ReportLanguage,
): OutreachVocabularyViolation[] {
  const violations: OutreachVocabularyViolation[] = [];

  for (const { field, text } of fields) {
    pushIfMatch(violations, field, text, 'statistics', STATISTIC_PATTERNS[language]);
    pushIfMatch(violations, field, text, 'conformity-claim', CONFORMITY_PATTERNS[language]);
    pushIfMatch(violations, field, text, 'competitor', COMPETITOR_PATTERNS[language]);
    pushIfMatch(violations, field, text, 'meeting-or-phone-ask', MEETING_PATTERNS[language]);
    pushIfMatch(violations, field, text, 'free-mail', FREE_MAIL_PATTERNS);
    pushIfMatch(violations, field, text, 'price-or-offer', PRICE_PATTERNS[language]);
    pushIfMatch(violations, field, text, 'predates-2025-answer', PREDATES_2025_PATTERNS[language]);
    pushIfMatch(
      violations,
      field,
      text,
      'leading-salutation',
      LEADING_SALUTATION_PATTERNS[language],
    );

    const salutation = checkNamedSalutation(text);
    if (salutation !== null) {
      violations.push({ field, text, rule: 'named-salutation', matched: salutation });
    }

    if (field === 'subject') {
      pushIfMatch(
        violations,
        field,
        text,
        'curiosity-gap-subject',
        CURIOSITY_GAP_SUBJECT_PATTERNS[language],
      );
    }
  }

  return violations;
}

export const OUTREACH_PROHIBITED_EXAMPLES: Record<ReportLanguage, string[]> = {
  fr: [
    '15 % des internautes rencontrent ces difficultés',
    'Vos concurrents ont déjà corrigé ce point',
    'Un rapide appel téléphonique pour en discuter ?',
    'Cher Jean,',
    'Bonjour, nous avons regardé votre site',
    'Notre audit RGAA officiel de votre site',
    'Contactez-nous à contact@gmail.com',
    'Notre offre à 1 600 EUR HT',
    'Question rapide',
    "Comme votre site date d'avant juin 2025, vous n'êtes pas concerné",
  ],
  en: [
    '15% of internet users run into this',
    'Your competitors have already fixed this',
    'A quick phone call to discuss?',
    'Dear John,',
    'Hello, we had a look at your site',
    'Our official RGAA audit of your site',
    'Reach us at contact@gmail.com',
    'Our offer at EUR 1,600',
    'Quick question',
    "Since your site predates June 2025, you're not affected",
  ],
};
