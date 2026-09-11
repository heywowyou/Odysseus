/**
 * Bilingual strings for the v2 full-scan scorecard preview (plan 037).
 * Same discipline as the v1 strings: one interface, two complete tables,
 * no English fallback, no em or en dashes.
 */

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
  documentTitle: 'Aperçu de votre site',
  heroLabel: 'Aperçu gratuit',
  lede:
    'Ce document résume ce qu’une analyse complète de votre site a relevé. ' +
    'Il ne montre que des totaux et quelques constats résumés, jamais de ' +
    'détail technique. L’audit complet, lui, nomme chaque constat, sa page ' +
    'et sa correction.',
  observedOn: 'Analyse réalisée le {date}.',
  coverageHeading: 'Ce qui a été mesuré',
  coverageIntro:
    'L’analyse parcourt l’ensemble du site. Trois compteurs distincts, parce ' +
    'qu’ils ne mesurent pas la même chose :',
  coverage: {
    inventoried: 'Pages inventoriées',
    contentChecked: 'Pages analysées en détail',
    performanceMeasured: 'Pages mesurées pour la vitesse',
  },
  performanceNote:
    'La vitesse de chargement est mesurée sur un échantillon représentatif de ' +
    'pages, jamais sur la totalité : c’est le seul compteur partiel, et il est ' +
    'annoncé comme tel.',
  totalsHeading: 'Ce qui a été relevé',
  distinctFindings: 'Constats distincts',
  affectedPages: 'Pages concernées',
  severityHeading: 'Répartition par gravité',
  severity: {
    critical: 'Critique',
    serious: 'Grave',
    moderate: 'Modérée',
    minor: 'Mineure',
  },
  category: {
    accessibility: 'Accessibilité',
    seo: 'Référencement',
    geo: 'Visibilité IA',
    performance: 'Performance',
    rendering: 'Rendu JavaScript',
    privacy: 'Confidentialité',
  },
  cardsHeading: 'Trois constats en exemple',
  cardsIntro:
    'Choisis parmi les plus graves et les plus répandus sur votre site. Le ' +
    'diagnostic complet les documente un par un, avec la page et l’élément ' +
    'concernés.',
  cardPagesLabel: 'pages concernées',
  offerHeading: 'L’audit complet',
  offerBody:
    'Un audit complet de votre site, établi à partir d’une nouvelle analyse, ' +
    'est proposé à {price}. Chaque constat y est documenté avec la page et ' +
    'l’élément concernés, une capture d’écran et une correction recommandée. ' +
    'Pour le recevoir, répondez simplement à ce message.',
  offerReplyLabel: 'Répondre pour demander l’audit',
  offerLinkLabel: 'Détails de l’offre',
  privacyHeading: 'Vos données et ce document',
  privacyController:
    'Ce document vous est adressé par Jules Fontaine (Odysseus), ' + 'contact@odysseusaudit.com.',
  privacyData:
    'Il repose sur une analyse de votre site réalisée par notre robot, ' +
    'identifiable dans vos journaux, et sur des données publiques.',
  privacyOriginsIntro: 'Origine des données vous concernant :',
  dataOrigin: {
    'public-hotel-catalogue':
      'Le fichier public des hébergements classés (Atout France, data.gouv.fr) : ' +
      'nom, adresse et site déclaré de votre établissement.',
    'public-website': 'Votre site internet, consulté publiquement comme le ferait un visiteur.',
    'public-business-registry':
      'La base Sirene (INSEE, données ouvertes) : dénomination, activité et ' +
      'effectif déclarés.',
  },
  privacyPurpose: 'Utilisation : vous proposer un audit de votre site, et rien d’autre.',
  privacyBasis:
    'Vous pouvez vous opposer à la prospection à tout moment, gratuitement, ' +
    'sans justification.',
  privacyExpiry: 'Ce lien cesse de fonctionner 30 jours après son envoi.',
  privacyRights:
    'Accès, rectification, effacement : écrivez à contact@odysseusaudit.com. ' +
    'La page prospection et données personnelles détaille tout cela.',
  privacyLink: 'Prospection et données personnelles',
  optOutLink: 'Ne plus être contacté',
};

const OUTREACH_PREVIEW_STRINGS_V2_EN: OutreachPreviewStringsV2 = {
  documentTitle: 'Preview of your website',
  heroLabel: 'Free preview',
  lede:
    'This document summarises what a full analysis of your site found. It ' +
    'shows totals and a few summarised findings only, never technical ' +
    'detail. The full audit names every finding, its page, and its fix.',
  observedOn: 'Analysis carried out on {date}.',
  coverageHeading: 'What was measured',
  coverageIntro:
    'The analysis walks the whole site. Three separate counters, because ' +
    'they do not measure the same thing:',
  coverage: {
    inventoried: 'Pages inventoried',
    contentChecked: 'Pages analysed in detail',
    performanceMeasured: 'Pages measured for speed',
  },
  performanceNote:
    'Loading speed is measured on a representative sample of pages, never on ' +
    'all of them: it is the only partial counter, and it is stated as one.',
  totalsHeading: 'What was found',
  distinctFindings: 'Distinct findings',
  affectedPages: 'Pages affected',
  severityHeading: 'Breakdown by severity',
  severity: {
    critical: 'Critical',
    serious: 'Serious',
    moderate: 'Moderate',
    minor: 'Minor',
  },
  category: {
    accessibility: 'Accessibility',
    seo: 'Search',
    geo: 'AI visibility',
    performance: 'Performance',
    rendering: 'JavaScript rendering',
    privacy: 'Privacy',
  },
  cardsHeading: 'Three example findings',
  cardsIntro:
    'Chosen from the most severe and the most widespread on your site. The ' +
    'full audit documents them one by one, with the page and the element ' +
    'concerned.',
  cardPagesLabel: 'pages affected',
  offerHeading: 'The full audit',
  offerBody:
    'A full audit of your site, built from a fresh analysis, is offered at ' +
    '{price}. Every finding is documented with the page and the element ' +
    'concerned, a screenshot, and a recommended fix. To receive it, simply ' +
    'reply to this message.',
  offerReplyLabel: 'Reply to request the audit',
  offerLinkLabel: 'Offer details',
  privacyHeading: 'Your data and this document',
  privacyController:
    'This document was sent to you by Jules Fontaine (Odysseus), ' + 'contact@odysseusaudit.com.',
  privacyData:
    'It rests on an analysis of your site carried out by our robot, ' +
    'identifiable in your server logs, and on public data.',
  privacyOriginsIntro: 'Where the data about you comes from:',
  dataOrigin: {
    'public-hotel-catalogue':
      'The public classified-accommodation file (Atout France, data.gouv.fr): ' +
      'your establishment’s name, address, and declared website.',
    'public-website': 'Your own website, viewed publicly as any visitor would.',
    'public-business-registry':
      'The Sirene register (INSEE, open data): declared name, activity, and ' + 'headcount.',
  },
  privacyPurpose: 'Use: to offer you an audit of your site, and nothing else.',
  privacyBasis:
    'You can object to prospecting at any time, free of charge, with no ' +
    'justification required.',
  privacyExpiry: 'This link stops working 30 days after it is sent.',
  privacyRights:
    'Access, rectification, erasure: write to contact@odysseusaudit.com. The ' +
    'prospecting and personal data page sets all of this out.',
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
