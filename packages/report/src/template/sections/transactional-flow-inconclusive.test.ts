import { describe, expect, it } from 'vitest';
import { EAA_REGIME_ID, type AuditManifest, type ObligationAssessment } from '@odysseus/core';
import { getStrings } from '../strings/i18n.js';
import { renderLegalExposure } from './legal-exposure.js';

const fr = getStrings('fr');
const en = getStrings('en');

// Issue #42 (Villas Foch): booking controls the detector saw but could
// not resolve (no href attribute) used to resolve a clean out_of_scope,
// which withheld the general EAA reference entirely from a client who
// does take bookings. These tests pin the new inconclusive resolution:
// the status card, the fact sentence and the general EAA reference all
// follow the engine's 'transactional-flow-inconclusive' fact.
function villaFochAssessment(): ObligationAssessment {
  return {
    status: 'likely_in_scope',
    basis: [
      {
        regimeId: EAA_REGIME_ID,
        facts: [
          { kind: 'effectif-band', code: '22', label: '20 à 49 salariés' },
          { kind: 'transactional-flow-inconclusive' },
        ],
      },
    ],
  };
}

function cleanNegativeAssessment(): ObligationAssessment {
  return {
    status: 'out_of_scope',
    basis: [
      {
        regimeId: EAA_REGIME_ID,
        facts: [
          { kind: 'effectif-band', code: '22', label: '20 à 49 salariés' },
          { kind: 'no-transactional-flow' },
        ],
      },
    ],
  };
}

function villaFochManifest(): AuditManifest {
  return {
    auditId: 'ff95ff97-cb54-41c7-8a33-89c9116985aa',
    kind: 'audit',
    siteUrl: 'https://www.villasfoch.fr/',
    startedAt: '2026-09-03T20:44:46Z',
    finishedAt: '2026-09-03T21:30:00Z',
    pages: [],
    siteSignals: {
      hasTransactionalFlow: false,
      transactionalFlowEvidence: [],
      transactionalFlowAmbiguities: [
        {
          selector: 'a.item__booking-link',
          pageUrl: 'https://www.villasfoch.fr/fr/chambres-et-suites',
          matchedVia: ['class'],
          detail: 'Booking-intent control matched via class; no crawlable destination.',
        },
        {
          selector: 'a.item__booking-link',
          pageUrl: 'https://www.villasfoch.fr/en/rooms-and-suites',
          href: 'javascript:void(0)',
          matchedVia: ['class'],
          detail: 'Booking-intent control matched via class; no crawlable destination.',
        },
      ],
    },
  } as unknown as AuditManifest;
}

function haaitzaFormOnlyAssessment(): ObligationAssessment {
  return {
    status: 'likely_in_scope',
    basis: [
      {
        regimeId: EAA_REGIME_ID,
        facts: [
          { kind: 'effectif-band', code: '22', label: '20 à 49 salariés' },
          { kind: 'transactional-flow-form-only' },
        ],
      },
    ],
  };
}

function render(
  language: 'fr' | 'en',
  obligationAssessment: ObligationAssessment | undefined,
  manifest: AuditManifest = villaFochManifest(),
): string {
  return renderLegalExposure(
    language === 'fr' ? fr : en,
    3,
    language,
    obligationAssessment,
    new Date('2026-09-04'),
    manifest,
    [],
  );
}

describe('the inconclusive transactional-flow resolution in section 03 (issue #42)', () => {
  it('renders a note naming the example pages when the engine resolved inconclusive', () => {
    const html = render('fr', villaFochAssessment());
    expect(html).toContain('Des contrôles de réservation ont été relevés');
    expect(html).toContain('https://www.villasfoch.fr/en/rooms-and-suites');
  });

  it('renders the same note in English, with no French leaking in', () => {
    const html = render('en', villaFochAssessment());
    expect(html).toContain('Booking controls were found on the visited pages');
    expect(html).not.toContain('Des contrôles de réservation');
  });

  it('renders the general EAA reference, which a clean negative withholds', () => {
    // The delivered Villas Foch report stated "Seuil ou parcours non
    // observé" and carried no EAA reference at all; the inconclusive
    // resolution must not.
    const html = render('fr', villaFochAssessment());
    expect(html).toContain('Parcours à confirmer');
    expect(html).toContain('R451-4');
  });

  it('renders the inconclusive fact sentence in the legal-citation paragraph', () => {
    const html = render('fr', villaFochAssessment());
    expect(html).toContain('ni confirmé ni exclu');
    expect(html).not.toContain(
      "Aucun parcours de réservation, panier ou paiement en ligne n'a été trouvé",
    );
  });

  it('renders neither the note nor the EAA reference for a clean negative', () => {
    const html = render('fr', cleanNegativeAssessment());
    expect(html).not.toContain('Des contrôles de réservation ont été relevés');
    expect(html).not.toContain('R451-4');
    expect(html).toContain('Seuil ou parcours non observé');
  });

  it('never renders the note from manifest data alone - the engine fact governs', () => {
    const html = render('fr', cleanNegativeAssessment(), villaFochManifest());
    expect(html).not.toContain('Des contrôles de réservation ont été relevés');
  });

  it('falls back to the no-example sentence when the manifest carries no resolvable pages', () => {
    const manifest = villaFochManifest() as AuditManifest & {
      siteSignals: { transactionalFlowAmbiguities?: [] };
    };
    manifest.siteSignals = {
      hasTransactionalFlow: false,
      transactionalFlowEvidence: [],
      transactionalFlowAmbiguities: [],
    };
    const html = render('fr', villaFochAssessment(), manifest);
    expect(html).toContain('Des contrôles de réservation ont été relevés');
    expect(html).not.toContain('https://www.villasfoch.fr/en/rooms-and-suites');
  });
});

// Issue #294 (haaitza.com): the only flow evidence was checkout-form
// matches from Gravity Forms, a contact-form plugin, yet the report named
// it "moteur de réservation" and asserted "Effectif et parcours observés".
// A form alone is not a flow: the status is "Parcours à confirmer", the
// paragraph carries the form-only sentence, and no vendor scope note may
// render.
describe('the form-only transactional-flow resolution in section 03 (issue #294)', () => {
  it('resolves to the "Parcours à confirmer" status, never "Effectif et parcours observés"', () => {
    const html = render('fr', haaitzaFormOnlyAssessment());
    expect(html).toContain('Parcours à confirmer');
    expect(html).not.toContain('Effectif et parcours observés');
  });

  it('carries the form-only fact sentence, not the booking-controls one', () => {
    const html = render('fr', haaitzaFormOnlyAssessment());
    expect(html).toContain('un formulaire seul ne permet pas');
    expect(html).not.toContain('Des contrôles de réservation ont été relevés');
  });

  it('never names a plugin as a booking engine or states an on-site flow', () => {
    const html = render('fr', haaitzaFormOnlyAssessment());
    expect(html).not.toContain('moteur de réservation');
    expect(html).not.toContain('Gravity Forms');
  });

  it('renders the same resolution in English, with no French leaking in', () => {
    const html = render('en', haaitzaFormOnlyAssessment());
    expect(html).toContain('a form alone does not establish');
    expect(html).not.toContain('un formulaire seul ne permet pas');
  });
});
