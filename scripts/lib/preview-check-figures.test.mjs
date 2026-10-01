import { describe, expect, it } from 'vitest';
import {
  expectedPreviewFigures,
  previewFigureMismatches,
  printedResultNumbers,
} from './preview-check-figures.mjs';

const coverageSummary = {
  inventoriedUrlCount: 39,
  content: { completed: 37, partial: 1 },
  passes: { lighthouse: { completed: 7 } },
};

function finding(severity, category, pageUrls) {
  return { severity, category, pageUrls };
}

const primaryFindings = [
  finding('serious', 'accessibility', ['https://example.com/', 'https://example.com/a']),
  finding('serious', 'seo', ['https://example.com/a']),
  finding('moderate', 'accessibility', ['https://example.com/b']),
  finding('minor', 'performance', ['https://example.com/']),
];

// The shape pdftotext -layout gives for the results section.
const previewText = `Principaux résultats
    Périmètre analysé
   39                                     38                                      7
   Pages recensées                         Pages analysées en détail       Pages mesurées pour la
    Constats relevés
   4                                                                              3
   Constats distincts                                                              Pages concernées
    Répartition par gravité
    Sérieux                         Modéré                      Mineur
 2                              1                           1
    Répartition par catégorie
   2                                       1                                       1
   Accessibilité                           Référencement naturel                   Performance
À traiter en premier`;

describe('preview figure reconciliation', () => {
  it('computes the figures over the primary population, partial content checks included', () => {
    expect(expectedPreviewFigures({ coverageSummary, primaryFindings })).toEqual({
      inventoried: 39,
      contentChecked: 38,
      performanceMeasured: 7,
      findings: 4,
      affectedPages: 3,
      severity: { critical: 0, serious: 2, moderate: 1, minor: 1 },
      categories: { accessibility: 2, seo: 1, performance: 1 },
    });
  });

  it('reads the printed numbers in order', () => {
    expect(printedResultNumbers(previewText)).toEqual([39, 38, 7, 4, 3, 2, 1, 1, 2, 1, 1]);
  });

  it('finds nothing to report when every printed figure matches, skipping zero severities', () => {
    const expected = expectedPreviewFigures({ coverageSummary, primaryFindings });
    expect(previewFigureMismatches(expected, previewText)).toEqual([]);
  });

  it('names a printed figure that disagrees with its source', () => {
    const expected = expectedPreviewFigures({ coverageSummary, primaryFindings });
    const wrong = previewText.replace('   4      ', '   5      ');
    expect(previewFigureMismatches(expected, wrong)).toEqual([
      'distinct findings: printed 5, source 4',
    ]);
  });

  it('says so when the results section is missing', () => {
    const expected = expectedPreviewFigures({ coverageSummary, primaryFindings });
    expect(previewFigureMismatches(expected, 'nothing here')).toEqual([
      'the results section was not found in the preview text',
    ]);
  });
});
