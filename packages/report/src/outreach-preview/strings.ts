/**
 * Every word the preview can say, in both languages, with no English fallback.
 *
 * Same discipline as `template/strings/`: one shape, two complete
 * implementations, and a parity test that fails when a key is added to one and
 * forgotten in the other. A cold outreach document that silently renders an
 * English sentence to a French hotel is worse than one that fails to build.
 *
 * These strings are also subject to `containsProhibitedPreviewContent`, which
 * the renderer runs over its own finished output. That is deliberate: the guard
 * and the copy check each other, so a sentence added here that states a legal
 * conclusion cannot ship just because it was written by hand rather than
 * assembled.
 */

import type { OutreachPreviewLanguage } from '@odysseus/core';

export interface OutreachPreviewStrings {
  documentTitle: string;
  heading: string;
  /** Says, in the first sentence a stranger reads, how we came to be looking
   *  at their site at all. */
  lede: string;
  observedOn: string;
  observationsHeading: string;
  observationsIntro: string;
  evidenceHeading: string;
  evidenceIntro: string;
  evidenceCaption: Record<'render-comparison' | 'specific-failure', string>;
  severity: Record<'critical' | 'serious' | 'moderate' | 'minor', string>;
  pageRole: Record<'homepage' | 'booking' | 'content', string>;
  wcagLabel: string;
  offerHeading: string;
  /** `{price}` is filled from the one code-owned constant. */
  offerBody: string;
  offerLink: string;
  /** The RGPD article 14 block: who is processing, what, from where, why, on
   *  what basis, and how to stop it. Every element is required, and the render
   *  test asserts each one is present rather than trusting the template. */
  privacyHeading: string;
  privacyController: string;
  privacyData: string;
  privacyOriginsIntro: string;
  dataOrigin: Record<
    'public-hotel-catalogue' | 'public-website' | 'public-business-registry',
    string
  >;
  privacyPurpose: string;
  privacyBasis: string;
  privacyRights: string;
  privacyLink: string;
  optOutLink: string;
}

const FR: OutreachPreviewStrings = {
  documentTitle: 'Aperçu public - Odysseus Audit',
  heading: 'Ce que nous avons observé sur votre site',
  lede:
    "Nous auditons l'accessibilité et la qualité technique des sites d'hébergement. " +
    "Nous avons consulté le vôtre comme n'importe quel visiteur le ferait, sans compte, " +
    'sans formulaire rempli et sans réservation.',
  observedOn: 'Observations relevées le {date}.',
  observationsHeading: 'Ce que nous avons mesuré',
  observationsIntro:
    'Chaque constat ci-dessous a été mesuré automatiquement. Nous décrivons ce qui a été ' +
    "observé, pas ce qu'il faudrait en conclure.",
  evidenceHeading: 'La preuve en image',
  evidenceIntro:
    "Ces captures viennent de votre propre site, telles qu'elles s'affichent pour un visiteur.",
  evidenceCaption: {
    'render-comparison':
      'À gauche, la page telle que le serveur la renvoie. À droite, la même page une fois ' +
      'le JavaScript exécuté.',
    'specific-failure': 'Le point précis où la mesure a échoué, entouré sur la capture.',
  },
  severity: {
    critical: 'Bloquant',
    serious: 'Important',
    moderate: 'Modéré',
    minor: 'Mineur',
  },
  pageRole: {
    homepage: "Page d'accueil",
    booking: 'Parcours de réservation',
    content: 'Page de contenu',
  },
  wcagLabel: 'Critère WCAG',
  offerHeading: 'Ce que nous proposons',
  offerBody:
    'Un audit complet du site, livré en rapport PDF bilingue, avec le détail de chaque ' +
    'constat, sa localisation et la marche à suivre pour le corriger. Tarif unique et ' +
    'publié : {price}.',
  offerLink: "Voir l'offre complète",
  privacyHeading: "D'où viennent ces informations",
  privacyController:
    'Le responsable de traitement est Odysseus Audit, Jules Fontaine, ' +
    'contact@odysseusaudit.com.',
  privacyData:
    "Nous traitons le nom de votre établissement, l'adresse de votre site et les mesures " +
    'techniques reproduites ci-dessus. Nous ne détenons aucune donnée de vos clients.',
  privacyOriginsIntro: 'Ces informations proviennent de :',
  dataOrigin: {
    'public-hotel-catalogue': 'le classement public des hébergements touristiques',
    'public-website': 'votre site web accessible publiquement',
    'public-business-registry': 'le registre public des entreprises',
  },
  privacyPurpose:
    "La finalité est de vous proposer une prestation d'audit, une fois, et de vous laisser " +
    'y mettre fin.',
  privacyBasis:
    "La base légale est l'intérêt légitime à proposer une prestation professionnelle à une " +
    'entreprise.',
  privacyRights:
    "Vous pouvez demander l'accès, la rectification, l'effacement ou l'opposition à tout " +
    'moment, et introduire une réclamation auprès de la CNIL.',
  privacyLink: 'Notre politique de confidentialité',
  optOutLink: 'Ne plus être contacté',
};

const EN: OutreachPreviewStrings = {
  documentTitle: 'Public preview - Odysseus Audit',
  heading: 'What we observed on your website',
  lede:
    'We audit the accessibility and technical quality of accommodation websites. We looked at ' +
    'yours the way any visitor would, with no account, no form filled in and no booking made.',
  observedOn: 'Observed on {date}.',
  observationsHeading: 'What we measured',
  observationsIntro:
    'Each observation below was measured automatically. We describe what was observed, not ' +
    'what should be concluded from it.',
  evidenceHeading: 'The evidence',
  evidenceIntro: 'These captures come from your own site, as a visitor sees it.',
  evidenceCaption: {
    'render-comparison':
      'On the left, the page as the server returns it. On the right, the same page once ' +
      'JavaScript has run.',
    'specific-failure': 'The exact point where the measurement failed, outlined on the capture.',
  },
  severity: {
    critical: 'Blocking',
    serious: 'Major',
    moderate: 'Moderate',
    minor: 'Minor',
  },
  pageRole: {
    homepage: 'Homepage',
    booking: 'Booking flow',
    content: 'Content page',
  },
  wcagLabel: 'WCAG criterion',
  offerHeading: 'What we offer',
  offerBody:
    'A full audit of the site, delivered as a bilingual PDF report, with each observation, ' +
    'where it occurs, and what to do about it. One published price: {price}.',
  offerLink: 'See the full offer',
  privacyHeading: 'Where this information comes from',
  privacyController:
    'The data controller is Odysseus Audit, Jules Fontaine, contact@odysseusaudit.com.',
  privacyData:
    'We process your establishment name, your website address, and the technical measurements ' +
    'reproduced above. We hold no data about your own customers.',
  privacyOriginsIntro: 'This information came from:',
  dataOrigin: {
    'public-hotel-catalogue': 'the public tourist accommodation classification',
    'public-website': 'your publicly available website',
    'public-business-registry': 'the public business registry',
  },
  privacyPurpose: 'The purpose is to offer you an audit, once, and to let you stop it.',
  privacyBasis:
    'The legal basis is the legitimate interest in offering a professional service to a ' +
    'business.',
  privacyRights:
    'You may request access, correction, erasure or objection at any time, and lodge a ' +
    'complaint with the CNIL.',
  privacyLink: 'Our privacy policy',
  optOutLink: 'Stop hearing from us',
};

export function outreachPreviewStrings(language: OutreachPreviewLanguage): OutreachPreviewStrings {
  return language === 'fr' ? FR : EN;
}
