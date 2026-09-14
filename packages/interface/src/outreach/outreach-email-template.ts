/** Operator-approved outreach sequence, locked 2026-09-14. */

import type { OutreachProofCard, ReportLanguage } from '@odysseus/core';
import { frenchOfHotel } from './hotel-name.js';
import type { DraftBodyBlock, DraftLink } from './render-outreach-draft.js';

export type OutreachCategory = OutreachProofCard['category'];

const CATEGORY_ORDER: readonly OutreachCategory[] = [
  'accessibility',
  'seo',
  'performance',
  'geo',
  'rendering',
  'privacy',
];
const OUTREACH_SUBJECT_MAX_CHARS = 78;
const NBSP = '\u00a0';

interface EmailTemplate {
  of: (hotelName: string) => string;
  fallbackOf: string;
  subjectAudit: (of: string) => string;
  subjectAnalysis: (of: string) => string;
  fallbackAudit: string;
  fallbackAnalysis: string;
  relation: Record<OutreachCategory, (count: number) => string>;
  joinList: (items: readonly string[]) => string;
  opening: (of: string) => string;
  findingsLead: string;
  criticalFinding: (count: number) => string;
  impactBridge: string;
  linkLead: string;
  closing: string;
  question: string;
  reminderIntro: (of: string) => string;
  reminderQuestion: string;
  reminderCommercial: string;
  finalIntro: (of: string) => string;
  finalLawLead: string;
  finalCommercial: string;
  finalExit: string;
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
  subjectAudit: (of) => `Audit du site ${of}`,
  subjectAnalysis: (of) => `Analyse du site ${of}`,
  fallbackAudit: 'Audit de votre site',
  fallbackAnalysis: 'Analyse de votre site',
  relation: {
    accessibility: (count) => `${count === 1 ? 'lié' : 'liés'} à l'accessibilité`,
    seo: (count) =>
      `${count === 1 ? 'lié' : 'liés'} au référencement dans les moteurs de recherche`,
    performance: (count) => `${count === 1 ? 'lié' : 'liés'} aux performances du site`,
    geo: (count) => `${count === 1 ? 'lié' : 'liés'} à la visibilité dans les assistants d'IA`,
    rendering: (count) =>
      `${count === 1 ? 'lié' : 'liés'} à l'affichage de votre contenu pour les moteurs de recherche`,
    privacy: (count) => `${count === 1 ? 'lié' : 'liés'} à la confidentialité et à la sécurité`,
  },
  joinList: joinWith('et'),
  opening: (of) =>
    `Nous avons récemment effectué un audit du site web ${of} et souhaitions vous faire part de ce que notre analyse a révélé.`,
  findingsLead: 'Cette analyse a mis en évidence plusieurs problèmes importants, notamment',
  criticalFinding: (count) => `${count} ${count === 1 ? 'constat critique' : 'constats critiques'}`,
  impactBridge:
    "Ces constats ont un impact direct sur l’expérience de vos clients et peuvent également relever du cadre légal applicable en matière d’accessibilité.",
  linkLead: `Vous trouverez un résumé de notre analyse ici${NBSP}:`,
  closing:
    "L'audit complet de votre site est disponible à l'achat dès à présent. Pour chacun de ces constats, il indique la page concernée et la correction à apporter.",
  question: `Souhaitez-vous recevoir le détail de ces constats${NBSP}?`,
  reminderIntro: (of) =>
    `Je me permets de revenir vers vous au sujet de mon précédent message concernant l'audit du site ${of}.`,
  reminderQuestion: `Avez-vous eu l'occasion de consulter l'aperçu${NBSP}?`,
  reminderCommercial:
    "Si vous souhaitez aller plus loin, l'audit complet de votre site est disponible à l'achat. Il détaille chacun des constats relevés, les pages concernées et les corrections à apporter.",
  finalIntro: (of) =>
    `Je me permets de vous écrire une dernière fois au sujet de l'audit du site ${of}.`,
  finalLawLead:
    "Avant de clore ce sujet, je souhaitais attirer votre attention sur le cadre réglementaire de l'accessibilité numérique, au regard des constats relevés lors de notre analyse.",
  finalCommercial:
    "L'aperçu de notre analyse reste disponible dans mon premier message et l'audit complet est disponible à l'achat si vous souhaitez consulter le détail des constats, les pages concernées et les corrections à apporter.",
  finalExit: 'Sans retour de votre part, je ne vous relancerai pas davantage.',
};

const EN: EmailTemplate = {
  of: (hotelName) => `of ${hotelName}`,
  fallbackOf: 'of your property',
  subjectAudit: (of) => `Website audit ${of}`,
  subjectAnalysis: (of) => `Website analysis ${of}`,
  fallbackAudit: 'Website audit',
  fallbackAnalysis: 'Website analysis',
  relation: {
    accessibility: () => 'related to accessibility',
    seo: () => 'related to search-engine visibility',
    performance: () => 'related to website performance',
    geo: () => 'related to visibility in AI assistants',
    rendering: () => 'related to how your content displays to search engines',
    privacy: () => 'related to privacy and security',
  },
  joinList: joinWith('and'),
  opening: (of) =>
    `We recently carried out an audit of the website ${of} and wanted to share what our analysis found.`,
  findingsLead: 'This analysis highlighted several important issues, including',
  criticalFinding: (count) => `${count} ${count === 1 ? 'critical finding' : 'critical findings'}`,
  impactBridge:
    "These findings have a direct impact on your customers' experience and may also fall within the applicable legal framework for accessibility.",
  linkLead: 'You will find a summary of our analysis here:',
  closing:
    'The full audit is available for purchase now. For each of these findings, it shows the page concerned and the correction to apply.',
  question: 'Would you like to receive the details of these findings?',
  reminderIntro: (of) =>
    `I am following up on my previous message about the audit of the website ${of}.`,
  reminderQuestion: 'Have you had a chance to review the preview?',
  reminderCommercial:
    'If you would like to go further, the full audit is available for purchase. It details each finding, the pages concerned and the corrections to apply.',
  finalIntro: (of) => `I am writing one last time about the audit of the website ${of}.`,
  finalLawLead:
    'Before closing the subject, I wanted to draw your attention to the regulatory framework for digital accessibility in light of the findings from our analysis.',
  finalCommercial:
    'The preview of our analysis remains available in my first message, and the full audit is available for purchase if you would like to review the findings, the pages concerned and the corrections to apply.',
  finalExit: 'If I do not hear back from you, I will not follow up again.',
};

function templateFor(language: ReportLanguage): EmailTemplate {
  return language === 'fr' ? FR : EN;
}

function hotelOf(template: EmailTemplate, hotelName: string | undefined): string {
  return hotelName === undefined || hotelName.trim() === ''
    ? template.fallbackOf
    : template.of(hotelName);
}

function stableBit(value: string): 0 | 1 {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash & 1) as 0 | 1;
}

export interface OutreachVariantPick {
  opening: 0 | 1;
  findings: 0 | 1;
  closing: 0 | 1;
  question: 0 | 1;
  reminder: 0 | 1;
}

export function pickOutreachVariants(seed: string): OutreachVariantPick {
  const bit = stableBit(seed);
  return { opening: bit, findings: bit, closing: bit, question: bit, reminder: bit };
}

export function composeOutreachSubject(options: {
  language: ReportLanguage;
  hotelName: string | undefined;
  categories: readonly OutreachCategory[];
}): string {
  const template = templateFor(options.language);
  const name = options.hotelName?.trim() ?? '';
  const variant = stableBit(name || 'fallback');
  const subject =
    name === ''
      ? variant === 0
        ? template.fallbackAudit
        : template.fallbackAnalysis
      : variant === 0
        ? template.subjectAudit(template.of(name))
        : template.subjectAnalysis(template.of(name));
  if (subject.length <= OUTREACH_SUBJECT_MAX_CHARS) return subject;
  return variant === 0 ? template.fallbackAudit : template.fallbackAnalysis;
}

function criticalCounts(
  categories: readonly OutreachCategory[],
): Array<[OutreachCategory, number]> {
  const counts = new Map<OutreachCategory, number>();
  for (const category of categories) counts.set(category, (counts.get(category) ?? 0) + 1);
  return CATEGORY_ORDER.flatMap((category) => {
    const count = counts.get(category) ?? 0;
    return count > 0 ? [[category, count] as [OutreachCategory, number]] : [];
  }).slice(0, 3);
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
  const counts = criticalCounts(options.categories);
  const list = template.joinList(
    counts.map(([category, count], index) => {
      const relation = template.relation[category](count);
      return index === 0
        ? `${template.criticalFinding(count)} ${relation}`
        : `${count} ${relation}`;
    }),
  );
  return [
    { kind: 'paragraph', text: template.opening(of) },
    { kind: 'paragraph', text: `${template.findingsLead} ${list}.` },
    { kind: 'paragraph', text: template.impactBridge },
    { kind: 'link', lead: template.linkLead, link: options.previewLink },
    { kind: 'paragraph', text: template.closing },
    { kind: 'paragraph', text: template.question },
  ];
}

export function composeTouchTwoBody(options: {
  language: ReportLanguage;
  hotelName: string | undefined;
  variants: OutreachVariantPick;
}): DraftBodyBlock[] {
  const template = templateFor(options.language);
  const of = hotelOf(template, options.hotelName);
  return [
    { kind: 'paragraph', text: template.reminderIntro(of) },
    { kind: 'paragraph', text: template.reminderQuestion },
    { kind: 'paragraph', text: template.reminderCommercial },
  ];
}

export function composeTouchThreeFrame(options: {
  language: ReportLanguage;
  hotelName: string | undefined;
}): { intro: string[]; closing: string[] } {
  const template = templateFor(options.language);
  const of = hotelOf(template, options.hotelName);
  return {
    intro: [template.finalIntro(of), template.finalLawLead],
    closing: [template.finalCommercial, template.finalExit],
  };
}
