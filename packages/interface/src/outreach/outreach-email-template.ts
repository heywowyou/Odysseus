/**
 * The body of every outreach email, as fixed operator-approved sentences
 * (trade-off 83). No model writes outreach any more: the operator rejected
 * every generated draft as reading translated, then approved this wording
 * sentence by sentence on 2026-09-11. Code fills in only the hotel's name
 * and the categories of its own preview's three proof cards.
 *
 * **Why two variants per sentence.** A single fixed text sent to every hotel
 * is the signature of mass mail, to recipients and to spam filters alike. Each
 * rotating sentence has two approved wordings, and the choice is derived from
 * the candidate id, so one hotel always receives the same combination (a
 * re-draft never changes the wording) while neighbouring hotels differ.
 *
 * **Why the category list comes from the proof cards.** The email may name
 * only problems that hotel's own scan found (non-negotiable rule 1); the three
 * proof cards are exactly what the linked preview shows, so the email and the
 * page it links to name the same categories. "Notamment" / "notably" keeps the
 * list honest without claiming it is exhaustive.
 *
 * French was written first; English is translated from it.
 */

import type { OutreachProofCard, ReportLanguage } from '@odysseus/core';
import { frenchOfHotel } from './hotel-name.js';
import type { DraftBodyBlock, DraftLink } from './render-outreach-draft.js';

export type OutreachCategory = OutreachProofCard['category'];

/** Reading order of categories in a list, whatever order the cards came in. */
const CATEGORY_ORDER: readonly OutreachCategory[] = [
  'accessibility',
  'seo',
  'performance',
  'geo',
  'rendering',
  'privacy',
];

/** A subject longer than this falls back to "Votre site" instead of the
 *  hotel's name; the same bound the model-era subject guard enforced. */
const OUTREACH_SUBJECT_MAX_CHARS = 78;

const NBSP = '\u00a0';

interface EmailTemplate {
  /** "de l'Hôtel des Tilleuls" / "of Hôtel des Tilleuls". */
  of: (hotelName: string) => string;
  /** Used when the catalogue name is unusable. */
  fallbackOf: string;
  /** Subject prefix when the hotel's name would make the subject too long. */
  fallbackSubjectName: string;
  subjectSeparator: string;
  subjectNoun: Record<OutreachCategory, string>;
  findingPhrase: Record<OutreachCategory, string>;
  joinList: (items: readonly string[]) => string;
  opening: readonly [(of: string) => string, (of: string) => string];
  findings: readonly [(list: string) => string, (list: string) => string];
  linkLead: string;
  closing: readonly [string, string];
  question: readonly [string, string];
  reminder: readonly [(of: string) => string, (of: string) => string];
  finalIntro: (of: string) => string;
  finalClosing: string;
}

function joinWith(conjunction: string): (items: readonly string[]) => string {
  return (items) =>
    items.length <= 1
      ? items.join('')
      : `${items.slice(0, -1).join(', ')} ${conjunction} ${items[items.length - 1] ?? ''}`;
}

const FR: EmailTemplate = {
  of: frenchOfHotel,
  fallbackOf: 'de votre établissement',
  fallbackSubjectName: 'Votre site',
  subjectSeparator: `${NBSP}: `,
  subjectNoun: {
    accessibility: 'accessibilité',
    seo: 'référencement',
    performance: 'performance',
    geo: 'visibilité IA',
    // A rendering gap is a search problem to a hotelier, and two identical
    // words in one subject read as a template bug.
    rendering: 'référencement',
    privacy: 'confidentialité',
  },
  findingPhrase: {
    accessibility: "d'accessibilité",
    seo: 'de référencement dans les moteurs de recherche',
    performance: 'de vitesse de chargement',
    geo: "de visibilité dans les assistants d'IA",
    rendering: "d'affichage de votre contenu pour les moteurs de recherche",
    privacy: 'de confidentialité et de sécurité',
  },
  joinList: joinWith('et'),
  opening: [
    (of) => `Nous vous écrivons car nous avons analysé le site ${of}.`,
    (of) => `Nous avons récemment analysé le site ${of} et souhaitions vous en faire part.`,
  ],
  findings: [
    (list) => `Nous y avons relevé plusieurs problèmes, notamment en matière ${list}.`,
    (list) =>
      `Cette analyse a mis en évidence plusieurs points à corriger, notamment en matière ${list}.`,
  ],
  linkLead: `Vous trouverez un résumé de notre analyse ici${NBSP}:`,
  closing: [
    "Pour chacun de ces points, l'audit complet indique la page concernée et la correction à apporter.",
    "L'audit complet détaille chacun de ces points, avec la page concernée et la correction à apporter.",
  ],
  question: [
    `Souhaitez-vous que nous vous en présentions le détail${NBSP}? N'hésitez pas à répondre à cet e-mail.`,
    'Nous restons à votre disposition pour vous en dire davantage.',
  ],
  reminder: [
    (of) =>
      `Nous nous permettons de vous relancer au sujet de l'analyse du site ${of}. Le résumé ` +
      `reste consultable via le lien de notre précédent message${NBSP}; n'hésitez pas à ` +
      'répondre à cet e-mail si vous souhaitez en recevoir le détail.',
    (of) =>
      'Nous souhaitions nous assurer que notre précédent message vous était bien parvenu. ' +
      `Le résumé de notre analyse du site ${of} reste consultable via le lien qu'il ` +
      `contient${NBSP}; n'hésitez pas à répondre à cet e-mail si vous souhaitez en recevoir le détail.`,
  ],
  finalIntro: (of) =>
    `Ce sera notre dernier message au sujet du site ${of}. Avant de clore ce sujet, voici, ` +
    "pour information, le cadre réglementaire de l'accessibilité numérique tel que les " +
    'textes le décrivent.',
  finalClosing:
    'Nous restons à votre disposition si vous souhaitez recevoir le détail de notre analyse.',
};

const EN: EmailTemplate = {
  of: (hotelName) => `of ${hotelName}`,
  fallbackOf: 'of your property',
  fallbackSubjectName: 'Your website',
  subjectSeparator: ': ',
  subjectNoun: {
    accessibility: 'accessibility',
    seo: 'search',
    performance: 'performance',
    geo: 'AI visibility',
    rendering: 'search',
    privacy: 'privacy',
  },
  findingPhrase: {
    accessibility: 'accessibility',
    seo: 'search engine visibility',
    performance: 'loading speed',
    geo: 'visibility in AI assistants',
    rendering: 'how your content displays to search engines',
    privacy: 'privacy and security',
  },
  joinList: joinWith('and'),
  opening: [
    (of) => `We are writing because we have analysed the website ${of}.`,
    (of) => `We recently analysed the website ${of} and wanted to share what we found.`,
  ],
  findings: [
    (list) => `We found several issues, notably in ${list}.`,
    (list) => `This analysis brought up several points to fix, notably in ${list}.`,
  ],
  linkLead: 'You will find a summary of our analysis here:',
  closing: [
    'For each of these points, the full audit shows the page concerned and the fix to apply.',
    'The full audit details each of these points, with the page concerned and the fix to apply.',
  ],
  question: [
    'Would you like us to walk you through the details? Feel free to reply to this email.',
    'We remain at your disposal to tell you more.',
  ],
  reminder: [
    (of) =>
      `We are following up on the analysis of the website ${of}. The summary is still ` +
      'available through the link in our previous message; feel free to reply to this email ' +
      'if you would like the details.',
    (of) =>
      'We wanted to make sure our previous message reached you. The summary of our analysis ' +
      `of the website ${of} is still available through the link it contains; feel free to ` +
      'reply to this email if you would like the details.',
  ],
  finalIntro: (of) =>
    `This will be our last message about the website ${of}. Before we close the subject, ` +
    'here, for information, is the regulatory framework for digital accessibility as the ' +
    'texts describe it.',
  finalClosing: 'We remain at your disposal if you would like the details of our analysis.',
};

function templateFor(language: ReportLanguage): EmailTemplate {
  return language === 'fr' ? FR : EN;
}

/** Which approved wording each rotating sentence uses, derived from the
 *  candidate id so the same hotel always gets the same combination. FNV-1a:
 *  tiny, dependency-free, and stable across runs and machines. */
export interface OutreachVariantPick {
  opening: 0 | 1;
  findings: 0 | 1;
  closing: 0 | 1;
  question: 0 | 1;
  reminder: 0 | 1;
}

export function pickOutreachVariants(seed: string): OutreachVariantPick {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const bit = (position: number): 0 | 1 => ((hash >>> position) & 1) as 0 | 1;
  return { opening: bit(0), findings: bit(1), closing: bit(2), question: bit(3), reminder: bit(4) };
}

/** Unique categories in reading order. A rendering gap folds into search when
 *  both are present, so the body never names search engines twice. */
function orderedCategories(categories: readonly OutreachCategory[]): OutreachCategory[] {
  const present = new Set(categories);
  if (present.has('seo')) present.delete('rendering');
  return CATEGORY_ORDER.filter((category) => present.has(category));
}

function hotelOf(template: EmailTemplate, hotelName: string | undefined): string {
  return hotelName === undefined || hotelName.trim() === ''
    ? template.fallbackOf
    : template.of(hotelName);
}

export function composeOutreachSubject(options: {
  language: ReportLanguage;
  hotelName: string | undefined;
  categories: readonly OutreachCategory[];
}): string {
  const template = templateFor(options.language);
  const nouns = [
    ...new Set(orderedCategories(options.categories).map((c) => template.subjectNoun[c])),
  ];
  const list = template.joinList(nouns);
  const name = options.hotelName?.trim() ?? '';
  const named = `${name}${template.subjectSeparator}${list}`;
  return name !== '' && named.length <= OUTREACH_SUBJECT_MAX_CHARS
    ? named
    : `${template.fallbackSubjectName}${template.subjectSeparator}${list}`;
}

export function composeTouchOneBody(options: {
  language: ReportLanguage;
  hotelName: string | undefined;
  categories: readonly OutreachCategory[];
  variants: OutreachVariantPick;
  previewLink: DraftLink;
}): DraftBodyBlock[] {
  const template = templateFor(options.language);
  const of = hotelOf(template, options.hotelName);
  const list = template.joinList(
    orderedCategories(options.categories).map((c) => template.findingPhrase[c]),
  );
  const v = options.variants;
  return [
    { kind: 'paragraph', text: template.opening[v.opening](of) },
    { kind: 'paragraph', text: template.findings[v.findings](list) },
    { kind: 'link', lead: template.linkLead, link: options.previewLink },
    { kind: 'paragraph', text: template.closing[v.closing] },
    { kind: 'paragraph', text: template.question[v.question] },
  ];
}

export function composeTouchTwoBody(options: {
  language: ReportLanguage;
  hotelName: string | undefined;
  variants: OutreachVariantPick;
}): DraftBodyBlock[] {
  const template = templateFor(options.language);
  const of = hotelOf(template, options.hotelName);
  return [{ kind: 'paragraph', text: template.reminder[options.variants.reminder](of) }];
}

/** Touch 3's own sentences; the assembler places the deterministic facts
 *  block between them. */
export function composeTouchThreeFrame(options: {
  language: ReportLanguage;
  hotelName: string | undefined;
}): { intro: string; closing: string } {
  const template = templateFor(options.language);
  return {
    intro: template.finalIntro(hotelOf(template, options.hotelName)),
    closing: template.finalClosing,
  };
}
