import { describe, expect, it } from 'vitest';
import { findExecutiveSummaryDigitViolations } from './executive-summary-digit-guard.js';
import type { WritingPassOutput } from './writing-schema.js';

function buildOutput(overrides: Partial<WritingPassOutput> = {}): WritingPassOutput {
  return {
    themes: [
      {
        themeKey: 't1',
        title: 'Contraste des couleurs insuffisant',
        businessImpact:
          'Vos visiteurs les plus âgés risquent de ne pas lire votre contenu correctement.',
        recommendedActions: [
          'Augmenter le contraste des couleurs sur les boutons et le texte, sur 18 pages.',
        ],
      },
    ],
    executiveSummary:
      'Votre site présente plusieurs problèmes qui affectent son efficacité commerciale.',
    notes: '',
    ...overrides,
  };
}

describe('findExecutiveSummaryDigitViolations', () => {
  it('flags a digit in executiveSummary (report-feedback-la-corniche.md item 0.4)', () => {
    // Verbatim shape from the La Corniche report: the writing pass used
    // to be asked to cite exact counts, and those drifted from the
    // report's actual bound counts (94 here vs 93 everywhere else in the
    // same document) once render-time finding resolution ran.
    const output = buildOutput({
      executiveSummary:
        "L'audit a identifié 66 problèmes prioritaires sur un total de 94 constats.",
    });

    const violations = findExecutiveSummaryDigitViolations(output);

    expect(violations).toEqual([{ field: 'executiveSummary', text: output.executiveSummary }]);
  });

  it('finds no violation when executiveSummary is purely qualitative prose', () => {
    const output = buildOutput({
      executiveSummary:
        'Les problèmes les plus urgents concernent les images sans texte alternatif et les liens non identifiables.',
    });

    expect(findExecutiveSummaryDigitViolations(output)).toEqual([]);
  });

  it('does not flag a digit in recommendedActions, which is explicitly allowed to state a page count', () => {
    const output = buildOutput();

    expect(findExecutiveSummaryDigitViolations(output)).toEqual([]);
  });
});
