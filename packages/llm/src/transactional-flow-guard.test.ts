import { describe, expect, it } from 'vitest';
import { findTransactionalFlowViolations } from './transactional-flow-guard.js';
import type { WritingPassOutput } from './writing-schema.js';

function output(text: string): WritingPassOutput {
  return {
    executiveSummary: text,
    notes: '',
    themes: [
      {
        themeKey: 't1',
        title: 'Titre',
        businessImpact: 'Impact mesuré.',
        recommendedActions: ['Action mesurée.'],
      },
    ],
  };
}

describe('findTransactionalFlowViolations', () => {
  it('rejects an explicit absence claim when deterministic evidence confirms a flow', () => {
    expect(
      findTransactionalFlowViolations(
        output("Aucun parcours de réservation, panier ou paiement n'a été trouvé."),
        'fr',
        'present',
      ),
    ).toMatchObject([{ field: 'executiveSummary' }]);
  });

  it('rejects an explicit direct-booking claim when deterministic evidence confirms absence', () => {
    expect(
      findTransactionalFlowViolations(
        output('Le site est un canal direct de réservation.'),
        'fr',
        'absent',
      ),
    ).toMatchObject([{ field: 'executiveSummary' }]);
  });

  it('covers the equivalent English report claims', () => {
    expect(
      findTransactionalFlowViolations(
        output('No booking flow was found on the visited pages.'),
        'en',
        'present',
      ),
    ).toHaveLength(1);
    expect(
      findTransactionalFlowViolations(
        output('This site is a direct booking channel.'),
        'en',
        'absent',
      ),
    ).toHaveLength(1);
  });

  it('does not reject an inconclusive or unknown signal', () => {
    expect(
      findTransactionalFlowViolations(
        output('Le site est un canal direct de réservation.'),
        'fr',
        'inconclusive',
      ),
    ).toEqual([]);
    expect(
      findTransactionalFlowViolations(
        output("Aucun parcours de réservation n'a été trouvé."),
        'fr',
        'unknown',
      ),
    ).toEqual([]);
  });
});
