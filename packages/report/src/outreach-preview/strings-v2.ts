/**
 * Bilingual strings for the v2 full-scan scorecard preview (plan 037).
 * Same discipline as the v1 strings: one interface, two complete tables,
 * no English fallback, no em or en dashes.
 *
 * The controller's name and address come from `OUTREACH_CONTACT`, the same
 * constant the cold email interpolates, so the two documents a prospect
 * receives can never name different mailboxes.
 */

import { OUTREACH_CONTACT, OUTREACH_SENDER_DISPLAY_NAME } from '@odysseus/core';

export interface OutreachPreviewStringsV2 {
  documentTitle: string;
  heroLabel: string;
  lede: string;
  observedOn: string;
  coverageHeading: string;
  coverageIntro: string;
  coverage: {
    inventoried: string;
    contentChecked: string;
    performanceMeasured: string;
  };
  performanceNote: string;
  totalsHeading: string;
  distinctFindings: string;
  affectedPages: string;
  severityHeading: string;
  severity: { critical: string; serious: string; moderate: string; minor: string };
  /** Plan 041 Part A: the deterministic own-counts grade shown beside the
   *  severity tiles, never the benchmark-percentile grade (trade-off 42/16
   *  forbid a comparison to other sites in this document). */
  scorecardLabel: string;
  /** Mandatory sentence shown with every grade, never omitted: the
   *  operator's chosen mitigation for showing a grade at all without
   *  overstating legal exposure (non-negotiable rule 6). */
  scorecardDisclaimer: string;
  category: {
    accessibility: string;
    seo: string;
    geo: string;
    performance: string;
    rendering: string;
    privacy: string;
  };
  cardsHeading: string;
  cardsIntro: string;
  cardPagesLabel: string;
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

const OUTREACH_PREVIEW_STRINGS_V2_FR: OutreachPreviewStringsV2 = {
  documentTitle: 'Aperçu de votre diagnostic',
  heroLabel: 'Aperçu du diagnostic',
  lede:
    'Nous avons réalisé une analyse préalable de votre site afin d’identifier les points qui ' +
    'méritent votre attention en matière d’accessibilité, de visibilité et de performance. ' +
    'Cet aperçu présente les principaux résultats mesurés. Le diagnostic complet documente ' +
    'ensuite chaque constat, sa localisation et la correction recommandée.',
  observedOn: 'Analyse réalisée le {date}.',
  coverageHeading: 'Périmètre de l’analyse',
  coverageIntro:
    'Trois niveaux de couverture sont distingués : les pages recensées, les pages analysées ' +
    'en détail et les pages mesurées pour la vitesse.',
  coverage: {
    inventoried: 'Pages recensées',
    contentChecked: 'Pages analysées en détail',
    performanceMeasured: 'Pages mesurées pour la vitesse',
  },
  performanceNote:
    'La vitesse est mesurée sur une sélection de pages ; son périmètre est donc plus restreint ' +
    'que celui de l’analyse de contenu.',
  totalsHeading: 'Principaux résultats',
  distinctFindings: 'Constats distincts',
  affectedPages: 'Pages concernées',
  severityHeading: 'Répartition par gravité',
  severity: {
    critical: 'Critique',
    serious: 'Sérieux',
    moderate: 'Modéré',
    minor: 'Mineur',
  },
  scorecardLabel: 'Niveau global des constats',
  scorecardDisclaimer:
    'Cette note synthétise la gravité des constats mesurés ; elle ne constitue pas une ' +
    'évaluation juridique.',
  category: {
    accessibility: 'Accessibilité',
    seo: 'Référencement naturel',
    geo: 'Visibilité dans les assistants IA',
    performance: 'Performance',
    rendering: 'Rendu JavaScript',
    privacy: 'Confidentialité',
  },
  cardsHeading: 'Trois constats qui méritent votre attention',
  cardsIntro:
    'Cette sélection réunit des constats parmi les plus graves et les plus répandus relevés ' +
    'sur votre site. Le rapport de diagnostic complet précise pour chacun la page et l’élément ' +
    'concernés, ainsi que la correction recommandée.',
  cardPagesLabel: 'pages concernées',
  offerHeading: 'Commander le diagnostic technique complet',
  offerBody:
    'Le diagnostic technique complet, proposé à {price}, comprend une analyse complète du site ' +
    'et un rapport détaillé. Chaque constat y est documenté avec la page et l’élément concernés, ' +
    'une capture d’écran lorsqu’elle est disponible et une correction recommandée. Pour le ' +
    'commander, répondez simplement à ce message.',
  offerReplyLabel: 'Commander le diagnostic',
  offerLinkLabel: 'Voir le détail de l’offre',
  privacyHeading: 'À propos de vos données',
  privacyController:
    `Ce document vous est adressé par ${OUTREACH_SENDER_DISPLAY_NAME}, ` +
    `${OUTREACH_CONTACT.address}.`,
  privacyData:
    'Il repose sur une analyse automatisée de pages accessibles publiquement de votre site, ' +
    'ainsi que sur des données publiques. Nos requêtes peuvent apparaître dans les journaux ' +
    'techniques de votre site.',
  privacyOriginsIntro: 'Sources des données utilisées :',
  dataOrigin: {
    'public-hotel-catalogue':
      'Le fichier public des hébergements classés (Atout France, data.gouv.fr) : ' +
      'nom, adresse et site déclaré de votre établissement.',
    'public-website': 'Votre site internet, accessible publiquement.',
    'public-business-registry':
      'La base Sirene (INSEE, données ouvertes) : dénomination, activité et ' +
      'effectif déclarés.',
  },
  privacyPurpose: 'Ces données sont utilisées uniquement pour vous proposer ce diagnostic.',
  privacyBasis:
    'Vous pouvez vous opposer à cette prospection à tout moment, gratuitement et sans ' +
    'justification.',
  privacyExpiry: 'Le lien vers cet aperçu reste actif pendant 30 jours après son envoi.',
  privacyRights:
    `Pour exercer vos droits d’accès, de rectification ou d’effacement, écrivez à ` +
    `${OUTREACH_CONTACT.address}. La page prospection et données personnelles présente le ` +
    'détail de vos droits.',
  privacyLink: 'Prospection et données personnelles',
  optOutLink: 'Ne plus être contacté',
};

const OUTREACH_PREVIEW_STRINGS_V2_EN: OutreachPreviewStringsV2 = {
  documentTitle: 'Preview of your diagnostic',
  heroLabel: 'Diagnostic preview',
  lede:
    'We ran a preliminary analysis of your site to identify the points that deserve attention ' +
    'across accessibility, visibility, and performance. This preview shows the main measured ' +
    'results. The full diagnostic then documents every finding, where it occurs, and the ' +
    'recommended fix.',
  observedOn: 'Analysis carried out on {date}.',
  coverageHeading: 'Scope of the analysis',
  coverageIntro:
    'The document distinguishes three levels of coverage: pages inventoried, pages analysed in ' +
    'detail, and pages measured for speed.',
  coverage: {
    inventoried: 'Pages inventoried',
    contentChecked: 'Pages analysed in detail',
    performanceMeasured: 'Pages measured for speed',
  },
  performanceNote:
    'Loading speed is measured on a selection of pages, so its coverage is narrower than the ' +
    'content analysis.',
  totalsHeading: 'Key results',
  distinctFindings: 'Distinct findings',
  affectedPages: 'Pages affected',
  severityHeading: 'Breakdown by severity',
  severity: {
    critical: 'Critical',
    serious: 'Serious',
    moderate: 'Moderate',
    minor: 'Minor',
  },
  scorecardLabel: 'Overall findings level',
  scorecardDisclaimer:
    'This grade summarizes the severity of measured findings; it is not a legal assessment.',
  category: {
    accessibility: 'Accessibility',
    seo: 'Organic search',
    geo: 'Visibility in AI assistants',
    performance: 'Performance',
    rendering: 'JavaScript rendering',
    privacy: 'Privacy',
  },
  cardsHeading: 'Three findings that deserve your attention',
  cardsIntro:
    'This selection includes findings among the most severe and widespread on your site. The ' +
    'full diagnostic report identifies the page and element concerned for each one and gives ' +
    'the recommended fix.',
  cardPagesLabel: 'pages affected',
  offerHeading: 'Order the full technical diagnostic',
  offerBody:
    'The full technical diagnostic, offered at {price}, includes a complete site analysis and ' +
    'a detailed report. Every finding is documented with the page and element concerned, a ' +
    'screenshot where available, and a recommended fix. To order it, simply reply to this ' +
    'message.',
  offerReplyLabel: 'Order the diagnostic',
  offerLinkLabel: 'See the full offer',
  privacyHeading: 'About your data',
  privacyController:
    `This document was sent to you by ${OUTREACH_SENDER_DISPLAY_NAME}, ` +
    `${OUTREACH_CONTACT.address}.`,
  privacyData:
    'It is based on an automated analysis of publicly accessible pages on your website and on ' +
    'public data. Our requests may appear in your site’s technical logs.',
  privacyOriginsIntro: 'Sources of the data used:',
  dataOrigin: {
    'public-hotel-catalogue':
      'The public classified-accommodation file (Atout France, data.gouv.fr): ' +
      'your establishment’s name, address, and declared website.',
    'public-website': 'Your publicly accessible website.',
    'public-business-registry':
      'The Sirene register (INSEE, open data): declared name, activity, and headcount.',
  },
  privacyPurpose: 'This data is used only to offer you this diagnostic.',
  privacyBasis:
    'You can object to prospecting at any time, free of charge and without giving a reason.',
  privacyExpiry: 'The link to this preview remains active for 30 days after it is sent.',
  privacyRights:
    `To exercise your rights of access, rectification, or erasure, write to ` +
    `${OUTREACH_CONTACT.address}. The prospecting and personal data page explains your rights in ` +
    'full.',
  privacyLink: 'Prospecting and personal data',
  optOutLink: 'Stop being contacted',
};

const TABLES = {
  fr: OUTREACH_PREVIEW_STRINGS_V2_FR,
  en: OUTREACH_PREVIEW_STRINGS_V2_EN,
} as const;

export function outreachPreviewStringsV2(language: 'fr' | 'en'): OutreachPreviewStringsV2 {
  return TABLES[language];
}
