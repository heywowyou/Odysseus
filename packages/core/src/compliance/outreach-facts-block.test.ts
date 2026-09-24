import { describe, expect, it } from 'vitest';
import type { ObligationAssessment } from '../types/compliance.js';
import { EAA_REGIME_ID } from './regimes.js';
import { buildOutreachFactsBlock } from './outreach-facts-block.js';

const CAPABLE = { argumentB: true };

function assessment(overrides: Partial<ObligationAssessment> = {}): ObligationAssessment {
  return {
    status: 'likely_in_scope',
    basis: [{ regimeId: EAA_REGIME_ID, facts: [{ kind: 'transactional-flow-unknown' }] }],
    ...overrides,
  } as ObligationAssessment;
}

function snapshot(effectifBandLabel: string | null) {
  return {
    denomination: 'HOTEL EXEMPLE SAS',
    effectifBandLabel,
    retrievedAt: new Date('2026-08-01T00:00:00Z'),
    source: 'sirene-stock',
  };
}

describe('buildOutreachFactsBlock', () => {
  it('omits the block entirely when the source material does not support it', () => {
    const block = buildOutreachFactsBlock({
      assessment: assessment(),
      language: 'fr',
      capabilities: { argumentB: false },
    });
    // Not an empty rendered block: there must be no heading to sit over nothing.
    expect(block).toEqual({ state: 'omitted' });
  });

  it('renders the criterion and says plainly that no registry data was found', () => {
    const block = buildOutreachFactsBlock({
      assessment: undefined,
      language: 'fr',
      capabilities: CAPABLE,
    });
    expect(block).toMatchInlineSnapshot(`
      {
        "heading": "Cadre réglementaire à vérifier",
        "paragraphs": [
          "Obligation d'accessibilité numérique issue de l'European Accessibility Act. S'applique aux entreprises de 10 salariés ou plus, ainsi qu'à celles dont le chiffre d'affaires annuel et le total de bilan annuel dépassent tous deux 2 000 000 €, lorsque le site propose un parcours transactionnel B2C de premier niveau (réservation, panier, paiement). Référence : loi n° 2023-171 du 9 mars 2023, articles 16 à 19.",
          "Nous n'avons pas trouvé de donnée de registre publique suffisante pour rapprocher votre entreprise de ces critères.",
          "L'applicabilité de ces critères dépend de la situation de l'entreprise. Faites confirmer votre situation par votre conseil juridique.",
        ],
        "state": "rendered",
      }
    `);
  });

  it('leaves the no-registry sentence out when the caller asks for it', () => {
    const block = buildOutreachFactsBlock({
      assessment: undefined,
      language: 'fr',
      capabilities: CAPABLE,
      omitAbsentRegistry: true,
    });
    expect(block.state === 'rendered' ? block.paragraphs : []).toEqual([
      expect.stringMatching(/^Obligation d'accessibilité numérique/u),
      "L'applicabilité de ces critères dépend de la situation de l'entreprise. Faites confirmer votre situation par votre conseil juridique.",
    ]);
  });

  it('keeps registry data that exists even when absent data would be omitted', () => {
    const block = buildOutreachFactsBlock({
      assessment: assessment({ registrySnapshot: snapshot('10 à 19 salariés') }),
      language: 'fr',
      capabilities: CAPABLE,
      omitAbsentRegistry: true,
    });
    expect(block.state === 'rendered' ? block.paragraphs : []).toHaveLength(3);
  });

  it('quotes the published headcount band without drawing a conclusion from it', () => {
    const block = buildOutreachFactsBlock({
      assessment: assessment({ registrySnapshot: snapshot('10 à 19 salariés') }),
      language: 'fr',
      capabilities: CAPABLE,
    });
    expect(block).toMatchInlineSnapshot(`
      {
        "heading": "Cadre réglementaire à vérifier",
        "paragraphs": [
          "Obligation d'accessibilité numérique issue de l'European Accessibility Act. S'applique aux entreprises de 10 salariés ou plus, ainsi qu'à celles dont le chiffre d'affaires annuel et le total de bilan annuel dépassent tous deux 2 000 000 €, lorsque le site propose un parcours transactionnel B2C de premier niveau (réservation, panier, paiement). Référence : loi n° 2023-171 du 9 mars 2023, articles 16 à 19.",
          "Les données publiques du registre pour HOTEL EXEMPLE SAS indiquent un effectif de 10 à 19 salariés. Cette information est reprise telle qu'elle figure dans le registre public.",
          "L'applicabilité de ces critères dépend de la situation de l'entreprise. Faites confirmer votre situation par votre conseil juridique.",
        ],
        "state": "rendered",
      }
    `);
  });

  it('says the band is absent rather than filling it in', () => {
    const block = buildOutreachFactsBlock({
      assessment: assessment({ registrySnapshot: snapshot(null) }),
      language: 'en',
      capabilities: CAPABLE,
    });
    expect(block).toMatchInlineSnapshot(`
      {
        "heading": "Regulatory framework to verify",
        "paragraphs": [
          "Digital accessibility obligation under the European Accessibility Act. Applies to companies with 10 or more employees, and to those whose annual turnover and annual balance sheet total both exceed EUR 2,000,000, when the site offers a first party B2C transactional flow (booking, cart, checkout). Reference: French Law No. 2023-171 of 9 March 2023, articles 16 to 19.",
          "The public register identifies HOTEL EXEMPLE SAS, but does not publish a usable headcount band for this analysis.",
          "Whether these criteria apply depends on the circumstances of the organization. Confirm your position with your legal adviser.",
        ],
        "state": "rendered",
      }
    `);
  });

  it('renders the English criterion with no registry data', () => {
    const block = buildOutreachFactsBlock({
      assessment: undefined,
      language: 'en',
      capabilities: CAPABLE,
    });
    expect(block).toMatchInlineSnapshot(`
      {
        "heading": "Regulatory framework to verify",
        "paragraphs": [
          "Digital accessibility obligation under the European Accessibility Act. Applies to companies with 10 or more employees, and to those whose annual turnover and annual balance sheet total both exceed EUR 2,000,000, when the site offers a first party B2C transactional flow (booking, cart, checkout). Reference: French Law No. 2023-171 of 9 March 2023, articles 16 to 19.",
          "We did not find enough public registry data to compare your organization with these criteria.",
          "Whether these criteria apply depends on the circumstances of the organization. Confirm your position with your legal adviser.",
        ],
        "state": "rendered",
      }
    `);
  });

  it.each(['in_scope', 'likely_in_scope', 'out_of_scope', 'undetermined'] as const)(
    'never states a verdict, whatever %s the assessment reached',
    (status) => {
      for (const language of ['fr', 'en'] as const) {
        const block = buildOutreachFactsBlock({
          assessment: assessment({ status }),
          language,
          capabilities: CAPABLE,
        });
        if (block.state !== 'rendered') throw new Error('expected a rendered block');
        const text = block.paragraphs.join(' ');
        // The status must not change what the reader is told about themselves.
        // Only the registry facts vary, and this assessment carries none.
        expect(text).toContain(
          language === 'fr'
            ? "L'applicabilité de ces critères dépend de la situation de l'entreprise"
            : 'Whether these criteria apply depends on the circumstances of the organization',
        );
        expect(text).not.toMatch(/vous devez|you must|obligatoire pour vous|applies to you/iu);
      }
    },
  );

  it('never reads the regime sanction ceiling', () => {
    for (const language of ['fr', 'en'] as const) {
      const block = buildOutreachFactsBlock({
        assessment: assessment({ registrySnapshot: snapshot('10 à 19 salariés') }),
        language,
        capabilities: CAPABLE,
      });
      if (block.state !== 'rendered') throw new Error('expected a rendered block');
      const text = block.paragraphs.join(' ');
      expect(text).not.toMatch(/amende|sanction|fine|50 000|50,000/iu);
    }
  });

  it('never leaks an undefined into the prose', () => {
    for (const language of ['fr', 'en'] as const) {
      const block = buildOutreachFactsBlock({
        assessment: undefined,
        language,
        capabilities: CAPABLE,
      });
      if (block.state !== 'rendered') throw new Error('expected a rendered block');
      expect(block.paragraphs.join(' ')).not.toMatch(/undefined|null|\[object/u);
    }
  });

  it('is deterministic', () => {
    const build = () =>
      buildOutreachFactsBlock({
        assessment: assessment({ registrySnapshot: snapshot('10 à 19 salariés') }),
        language: 'fr',
        capabilities: CAPABLE,
      });
    expect(build()).toEqual(build());
  });
});
