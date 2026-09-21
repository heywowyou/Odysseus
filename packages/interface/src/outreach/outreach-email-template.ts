/** Operator-approved outreach sequence, locked 2026-09-14. */

import type { OutreachPreviewSeverity, OutreachProofCard, ReportLanguage } from '@odysseus/core';
import { frenchOfHotel } from './hotel-name.js';
import type { DraftBodyBlock, DraftLink } from './render-outreach-draft.js';

export type OutreachCategory = OutreachProofCard['category'];

const OUTREACH_SUBJECT_MAX_CHARS = 78;
const NBSP = '\u00a0';
const SEVERITY_ORDER: readonly OutreachPreviewSeverity[] = [
  'critical',
  'serious',
  'moderate',
  'minor',
];

export interface OutreachScanSummary {
  distinctFindingCount: number;
  affectedPageCount: number;
  severityTotals: Record<OutreachPreviewSeverity, number>;
  /** Categories of the published preview's three cards, in their published order.
   * For v3 this is the paid report's first-three priority order. */
  proofCardCategories: readonly OutreachCategory[];
}

interface EmailTemplate {
  of: (hotelName: string) => string;
  fallbackOf: string;
  subjectAnalysis: (of: string) => string;
  fallbackAnalysis: string;
  joinList: (items: readonly string[]) => string;
  categoryLabel: Record<OutreachCategory, string>;
  severityLabel: Record<OutreachPreviewSeverity, (count: number) => string>;
  opening: (of: string) => string;
  findingsSummary: (
    findingCount: number,
    affectedPageCount: number,
    severities: string,
    categories: string,
  ) => string;
  impactBridge: (categories: readonly OutreachCategory[]) => string;
  linkLead: string;
  referenceLinkLead: string;
  closing: string;
  question: string;
  reminderIntro: (of: string) => string;
  reminderQuestion: string;
  reminderCommercial: string;
  reminderAction: string;
  finalIntro: (of: string) => string;
  finalLawLead: string;
  finalCommercial: string;
  finalAction: string;
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
  subjectAnalysis: (of) => `Analyse du site ${of}`,
  fallbackAnalysis: 'Analyse de votre site',
  joinList: joinWith('et'),
  categoryLabel: {
    accessibility: "l'accessibilité",
    seo: 'le référencement dans les moteurs de recherche',
    performance: 'les performances du site',
    geo: "la visibilité dans les assistants d'IA",
    rendering: "l'affichage de votre contenu pour les moteurs de recherche",
    privacy: 'la confidentialité et la sécurité',
  },
  severityLabel: {
    critical: (count) => `${count} ${count === 1 ? 'critique' : 'critiques'}`,
    serious: (count) => `${count} sérieux`,
    moderate: (count) => `${count} ${count === 1 ? 'modéré' : 'modérés'}`,
    minor: (count) => `${count} ${count === 1 ? 'mineur' : 'mineurs'}`,
  },
  opening: (of) => `Nous avons récemment analysé le site web ${of}.`,
  findingsSummary: (findingCount, affectedPageCount, severities, categories) =>
    `Notre analyse a relevé ${findingCount} ${findingCount === 1 ? 'constat distinct' : 'constats distincts'} ` +
    `sur ${affectedPageCount} ${affectedPageCount === 1 ? 'page' : 'pages'} de votre site` +
    `${severities === '' ? '' : `, dont ${severities}`}. ` +
    `Les principaux problèmes concernent notamment ${categories}.`,
  impactBridge: (categories) =>
    categories.includes('accessibility')
      ? 'Ces constats ont un impact direct sur l’expérience de vos clients et peuvent également relever du cadre légal applicable en matière d’accessibilité.'
      : 'Ces constats ont un impact direct sur l’expérience de vos clients.',
  linkLead: `Vous trouverez un résumé de notre analyse ici${NBSP}:`,
  referenceLinkLead: `Pour voir concrètement le document livré, vous pouvez consulter un exemple d’audit complet${NBSP}:`,
  closing:
    'L’audit complet de votre site est disponible à l’achat. Il détaille les constats relevés, les pages concernées et les corrections à apporter.',
  question: `Souhaitez-vous que je vous transmette les modalités de l’audit complet${NBSP}?`,
  reminderIntro: (of) =>
    `Je me permets de revenir vers vous au sujet de mon précédent message concernant l’analyse du site ${of}.`,
  reminderQuestion: `Avez-vous eu l’occasion de consulter l’aperçu${NBSP}?`,
  reminderCommercial:
    'Si vous souhaitez agir sur ces constats, l’audit complet de votre site est disponible à l’achat. Il indique, pour chacun, les pages concernées et les corrections à apporter.',
  reminderAction: `Souhaitez-vous que je vous transmette les modalités${NBSP}?`,
  finalIntro: (of) =>
    `Je me permets de vous écrire une dernière fois au sujet de l’analyse du site ${of}.`,
  finalLawLead:
    'Avant de clore ce sujet, un dernier point mérite votre attention : le cadre réglementaire de l’accessibilité numérique peut être pertinent au regard des constats relevés lors de notre analyse.',
  finalCommercial:
    'Indépendamment de cette question juridique, l’aperçu de notre analyse reste disponible dans mon premier message. Si vous souhaitez disposer du détail technique, l’audit complet est disponible à l’achat et indique les pages concernées et les corrections à apporter.',
  finalAction: `Il vous suffit de répondre à ce message si vous souhaitez l’obtenir.`,
  finalExit: 'Sans retour de votre part, je ne vous relancerai pas davantage.',
};

const EN: EmailTemplate = {
  of: (hotelName) => `of ${hotelName}`,
  fallbackOf: 'of your property',
  subjectAnalysis: (of) => `Website analysis ${of}`,
  fallbackAnalysis: 'Website analysis',
  joinList: joinWith('and'),
  categoryLabel: {
    accessibility: 'accessibility',
    seo: 'search-engine visibility',
    performance: 'website performance',
    geo: 'visibility in AI assistants',
    rendering: 'how your content displays to search engines',
    privacy: 'privacy and security',
  },
  severityLabel: {
    critical: (count) => `${count} critical`,
    serious: (count) => `${count} serious`,
    moderate: (count) => `${count} moderate`,
    minor: (count) => `${count} minor`,
  },
  opening: (of) => `We recently analyzed the website ${of}.`,
  findingsSummary: (findingCount, affectedPageCount, severities, categories) =>
    `Our analysis identified ${findingCount} distinct ${findingCount === 1 ? 'finding' : 'findings'} ` +
    `across ${affectedPageCount} ${affectedPageCount === 1 ? 'page' : 'pages'} of your website` +
    `${severities === '' ? '' : `, including ${severities}`}. ` +
    `The main issues include ${categories}.`,
  impactBridge: (categories) =>
    categories.includes('accessibility')
      ? "These findings have a direct impact on your customers' experience and may also fall within the applicable legal framework for accessibility."
      : "These findings have a direct impact on your customers' experience.",
  linkLead: 'You will find a summary of our analysis here:',
  referenceLinkLead:
    'To see exactly what the delivered document looks like, you can view an example of a full audit:',
  closing:
    'The full audit of your website is available for purchase. It details the findings identified, the pages concerned and the corrections to apply.',
  question: 'Would you like me to send you the details for the full audit?',
  reminderIntro: (of) =>
    `I am following up on my previous message about the analysis of the website ${of}.`,
  reminderQuestion: 'Have you had a chance to review the preview?',
  reminderCommercial:
    'If you would like to act on these findings, the full audit of your website is available for purchase. For each finding, it identifies the pages concerned and the corrections to apply.',
  reminderAction: 'Would you like me to send you the details?',
  finalIntro: (of) => `I am writing one last time about the analysis of the website ${of}.`,
  finalLawLead:
    'Before closing the subject, one final point deserves your attention: the regulatory framework for digital accessibility may be relevant in light of the findings from our analysis.',
  finalCommercial:
    'Independently of that legal question, the preview of our analysis remains available in my first message. If you would like the technical detail, the full audit is available for purchase and identifies the pages concerned and the corrections to apply.',
  finalAction: 'Simply reply to this message if you would like to receive it.',
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
  const subject =
    name === '' ? template.fallbackAnalysis : template.subjectAnalysis(template.of(name));
  return subject.length <= OUTREACH_SUBJECT_MAX_CHARS ? subject : template.fallbackAnalysis;
}

function uniqueProofCategories(categories: readonly OutreachCategory[]): OutreachCategory[] {
  return categories.filter((category, index) => categories.indexOf(category) === index).slice(0, 3);
}

function severitySummary(template: EmailTemplate, summary: OutreachScanSummary): string {
  const items = SEVERITY_ORDER.flatMap((severity) => {
    const count = summary.severityTotals[severity];
    return count > 0 ? [template.severityLabel[severity](count)] : [];
  }).slice(0, 2);
  return template.joinList(items);
}

export function composeTouchOneBody(options: {
  language: ReportLanguage;
  hotelName: string | undefined;
  scanSummary: OutreachScanSummary;
  variants: OutreachVariantPick;
  previewLink: DraftLink;
  referenceLink: DraftLink;
}): DraftBodyBlock[] {
  const template = templateFor(options.language);
  const of = hotelOf(template, options.hotelName);
  const categories = uniqueProofCategories(options.scanSummary.proofCardCategories);
  const categoryList = template.joinList(
    categories.map((category) => template.categoryLabel[category]),
  );
  const findings = template.findingsSummary(
    options.scanSummary.distinctFindingCount,
    options.scanSummary.affectedPageCount,
    severitySummary(template, options.scanSummary),
    categoryList,
  );
  return [
    { kind: 'paragraph', text: template.opening(of) },
    { kind: 'paragraph', text: findings },
    { kind: 'paragraph', text: template.impactBridge(categories) },
    { kind: 'link', lead: template.linkLead, link: options.previewLink },
    { kind: 'paragraph', text: template.closing },
    { kind: 'link', lead: template.referenceLinkLead, link: options.referenceLink },
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
    { kind: 'paragraph', text: template.reminderAction },
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
    closing: [template.finalCommercial, template.finalAction, template.finalExit],
  };
}
