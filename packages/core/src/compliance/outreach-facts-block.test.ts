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
        "heading": "Le cadre applicable, et ce que nous pouvons en dire",
        "paragraphs": [
          "Obligation d'accessibilité numérique (loi n° 2023-171, transposant l'European Accessibility Act). S'applique aux entreprises de 10 salariés ou plus, ou dont le chiffre d'affaires ou le total de bilan annuel dépasse 2 000 000 €, lorsque le site propose un parcours transactionnel B2C de premier niveau (réservation, panier, paiement). Référence : Loi n° 2023-171 du 9 mars 2023, articles 16 à 19.",
          "Nous n'avons pas retrouvé de données de registre publiques permettant de situer votre entreprise par rapport à ces critères. Le critère ci-dessus est reproduit pour lui-même.",
          "Nous constatons, nous ne concluons pas : déterminer si ces critères visent votre entreprise relève d'un avocat, et nous vous recommandons de lui poser la question.",
        ],
        "state": "rendered",
      }
    `);
  });

  it('quotes the published headcount band without drawing a conclusion from it', () => {
    const block = buildOutreachFactsBlock({
      assessment: assessment({ registrySnapshot: snapshot('10 à 19 salariés') }),
      language: 'fr',
      capabilities: CAPABLE,
    });
    expect(block).toMatchInlineSnapshot(`
      {
        "heading": "Le cadre applicable, et ce que nous pouvons en dire",
        "paragraphs": [
          "Obligation d'accessibilité numérique (loi n° 2023-171, transposant l'European Accessibility Act). S'applique aux entreprises de 10 salariés ou plus, ou dont le chiffre d'affaires ou le total de bilan annuel dépasse 2 000 000 €, lorsque le site propose un parcours transactionnel B2C de premier niveau (réservation, panier, paiement). Référence : Loi n° 2023-171 du 9 mars 2023, articles 16 à 19.",
          "Les données publiques du registre pour HOTEL EXEMPLE SAS indiquent un effectif de 10 à 19 salariés. Nous reproduisons cette donnée telle qu'elle est publiée, sans en tirer de conclusion.",
          "Nous constatons, nous ne concluons pas : déterminer si ces critères visent votre entreprise relève d'un avocat, et nous vous recommandons de lui poser la question.",
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
        "heading": "The applicable framework, and what we can say about it",
        "paragraphs": [
          "Digital accessibility obligation (loi n° 2023-171, transposing the European Accessibility Act). Applies to companies with 10 or more employees, or with annual turnover or balance sheet total above EUR 2,000,000, when the site offers a first party B2C transactional flow (booking, cart, checkout). Reference: Loi n° 2023-171 du 9 mars 2023, articles 16 à 19.",
          "The public registry identifies HOTEL EXEMPLE SAS, but publishes no usable headcount band. We do not fill in data that is absent.",
          "We report, we do not conclude: whether these criteria reach your business is a question for a lawyer, and we recommend putting it to one.",
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
        "heading": "The applicable framework, and what we can say about it",
        "paragraphs": [
          "Digital accessibility obligation (loi n° 2023-171, transposing the European Accessibility Act). Applies to companies with 10 or more employees, or with annual turnover or balance sheet total above EUR 2,000,000, when the site offers a first party B2C transactional flow (booking, cart, checkout). Reference: Loi n° 2023-171 du 9 mars 2023, articles 16 à 19.",
          "We did not find public registry data that would place your business against these criteria. The criterion above is reproduced for its own sake.",
          "We report, we do not conclude: whether these criteria reach your business is a question for a lawyer, and we recommend putting it to one.",
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
        expect(text).toContain(language === 'fr' ? 'nous ne concluons pas' : 'we do not conclude');
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
