import type { OutreachPreviewLanguage } from '@odysseus/core';
import { outreachPreviewStringsV2 } from './strings-v2.js';

export interface OutreachPreviewStringsV3 {
  documentTitle: string;
  lede: string;
  resultsHeading: string;
  coverageSubheading: string;
  coverageIntro: string;
  coverage: { inventoried: string; contentChecked: string; performanceMeasured: string };
  performanceNote: string;
  totalsSubheading: string;
  distinctFindings: string;
  affectedPages: string;
  severityHeading: string;
  severity: { critical: string; serious: string; moderate: string; minor: string };
  categoryHeading: string;
  category: {
    accessibility: string;
    seo: string;
    geo: string;
    performance: string;
    rendering: string;
    privacy: string;
  };
  prioritiesHeading: string;
  prioritiesIntro: string;
  priorityPageSingular: string;
  priorityPagesPlural: string;
  prioritySiteWide: string;
  scrollCueLabel: string;
  offerHeading: string;
  offerBody: string;
  offerReplyLabel: string;
  offerLinkLabel: string;
  privacyHeading: string;
  privacyController: string;
  privacyData: string;
  privacyOriginsIntro: string;
  dataOrigin: {
    'public-hotel-catalogue': string;
    'public-website': string;
    'public-business-registry': string;
  };
  privacyPurpose: string;
  privacyBasis: string;
  privacyExpiry: string;
  privacyRights: string;
  privacyLink: string;
  optOutLink: string;
}

const COPY = {
  fr: {
    documentTitle: 'Aperçu de votre diagnostic',
    lede:
      'Cet aperçu reprend les principaux résultats du diagnostic réalisé sur votre site. ' +
      'Le rapport complet détaille ensuite chaque constat, les priorités de correction et les éléments techniques utiles à votre prestataire.',
    resultsHeading: 'Principaux résultats',
    coverageSubheading: 'Périmètre analysé',
    coverageIntro:
      'Le diagnostic distingue les pages recensées, les pages analysées en détail et les pages mesurées pour la vitesse.',
    totalsSubheading: 'Constats relevés',
    categoryHeading: 'Répartition par catégorie',
    prioritiesHeading: 'À traiter en premier',
    prioritiesIntro:
      'Ces trois points suivent le même ordre de priorité que le rapport de diagnostic complet.',
    priorityPageSingular: 'page concernée',
    priorityPagesPlural: 'pages concernées',
    prioritySiteWide: 'portée générale',
    offerHeading: 'Le diagnostic complet',
    offerBody:
      'Le diagnostic technique complet, proposé à {price}, documente les constats, les pages et éléments concernés, leur ordre de priorité et les corrections recommandées. Pour le commander, répondez simplement à ce message.',
  },
  en: {
    documentTitle: 'Preview of your diagnostic',
    lede:
      'This preview reflects the main results of the diagnostic run on your website. ' +
      'The full report then documents each finding, the correction priorities and the technical detail your provider needs.',
    resultsHeading: 'Measured results',
    coverageSubheading: 'Analysed scope',
    coverageIntro:
      'The diagnostic distinguishes pages inventoried, pages analysed in detail and pages measured for speed.',
    totalsSubheading: 'Findings identified',
    categoryHeading: 'Breakdown by category',
    prioritiesHeading: 'What to address first',
    prioritiesIntro:
      'These three points follow the same priority order as the full diagnostic report.',
    priorityPageSingular: 'page affected',
    priorityPagesPlural: 'pages affected',
    prioritySiteWide: 'site-wide scope',
    offerHeading: 'The full diagnostic',
    offerBody:
      'The full technical diagnostic, priced at {price}, documents the findings, the pages and elements concerned, their priority order and the recommended corrections. To order it, simply reply to this message.',
  },
} as const;

export function outreachPreviewStringsV3(
  language: OutreachPreviewLanguage,
): OutreachPreviewStringsV3 {
  const base = outreachPreviewStringsV2(language);
  const copy = COPY[language];
  return {
    ...copy,
    coverage: base.coverage,
    performanceNote: base.performanceNote,
    distinctFindings: base.distinctFindings,
    affectedPages: base.affectedPages,
    severityHeading: base.severityHeading,
    severity: base.severity,
    category: base.category,
    scrollCueLabel: base.scrollCueLabel,
    offerReplyLabel: base.offerReplyLabel,
    offerLinkLabel: base.offerLinkLabel,
    privacyHeading: base.privacyHeading,
    privacyController: base.privacyController,
    privacyData: base.privacyData,
    privacyOriginsIntro: base.privacyOriginsIntro,
    dataOrigin: base.dataOrigin,
    privacyPurpose: base.privacyPurpose,
    privacyBasis: base.privacyBasis,
    privacyExpiry: base.privacyExpiry,
    privacyRights: base.privacyRights,
    privacyLink: base.privacyLink,
    optOutLink: base.optOutLink,
  };
}
