/**
 * A valid v3 preview summary, for the renderer's tests.
 *
 * Kept beside the renderer rather than in `src/test-fixtures.ts`: that file
 * builds paid-report inputs, and putting the two in one module is the first
 * step towards someone spreading one into the other. Issue #530 removed the
 * v1 and v2 renderers, and their input fixtures with them.
 */

import type { OutreachPreviewSummaryV3 } from '@odysseus/core';

export function previewSummaryV3(
  overrides: Partial<OutreachPreviewSummaryV3> = {},
): OutreachPreviewSummaryV3 {
  return {
    contentVersion: 'v3',
    language: 'fr',
    recipient: {
      businessName: 'Hôtel de la Plage',
      dataOrigins: ['public-hotel-catalogue', 'public-website'],
    },
    links: {
      offer: 'https://odysseusaudit.com/offre',
      privacy: 'https://odysseusaudit.com/confidentialite-prospection',
      optOut: 'https://odysseusaudit.com/desinscription',
    },
    coverage: {
      inventoriedPageCount: 23,
      contentCheckedPageCount: 23,
      performanceMeasuredPageCount: 9,
    },
    distinctFindingCount: 5,
    affectedPageCount: 11,
    severityTotals: { critical: 1, serious: 1, moderate: 1, minor: 2 },
    categoryTotals: {
      accessibility: 2,
      seo: 1,
      geo: 0,
      performance: 2,
      rendering: 0,
      privacy: 0,
    },
    priorityCards: [
      {
        rank: 1,
        title: {
          fr: 'Certains liens ne sont pas clairement nommés.',
          en: 'Some links are not clearly named.',
        },
        category: 'accessibility',
        severity: 'serious',
        affectedPageCount: 6,
      },
      {
        rank: 2,
        title: {
          fr: 'Certaines images ne sont pas décrites.',
          en: 'Some images are not described.',
        },
        category: 'accessibility',
        severity: 'moderate',
        affectedPageCount: 4,
      },
      {
        rank: 3,
        title: {
          fr: 'Certaines pages sont difficiles à indexer.',
          en: 'Some pages are difficult to index.',
        },
        category: 'seo',
        severity: 'minor',
        affectedPageCount: 2,
      },
    ],
    facts: { state: 'omitted' },
    ...overrides,
  };
}
