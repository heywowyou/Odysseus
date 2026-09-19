import { describe, expect, it } from 'vitest';
import { outreachPreviewSummaryV3Schema, type OutreachPreviewSummaryV3 } from '@odysseus/core';
import { formatFullAuditPrice } from '@odysseus/core';
import { generateOutreachPreviewHtmlV3 } from './render-html-v3.js';
import { lintOutreachPreviewHtml } from './preview-lint.js';

function summary(overrides: Partial<OutreachPreviewSummaryV3> = {}): OutreachPreviewSummaryV3 {
  return {
    contentVersion: 'v3',
    observedAt: new Date('2026-09-19T08:00:00.000Z'),
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
    dataQuality: { status: 'complete', limitations: [] },
    facts: { state: 'omitted' },
    ...overrides,
  };
}

describe('generateOutreachPreviewHtmlV3', () => {
  it('renders the report-aligned hierarchy and no independent grade or risk hero', () => {
    const html = generateOutreachPreviewHtmlV3(summary());
    const headings = [
      'Principaux résultats',
      'À traiter en premier',
      'Qualité des données de l’analyse',
      'Le diagnostic complet',
      'À propos de vos données',
    ].map((text) => html.indexOf(text));
    expect(headings.every((position) => position > 0)).toBe(true);
    expect([...headings].sort((a, b) => a - b)).toEqual(headings);
    // v3 reuses the v2 stylesheet, whose unused scorecard rules are not
    // rendered markup; only the page body must be free of the hero.
    const markup = html.replace(/<style>[\s\S]*?<\/style>/, '');
    expect(markup).not.toContain('preview-scorecard');
    expect(markup).not.toContain('preview-risk');
    expect(markup).not.toContain('data-grade=');
  });

  it('renders priority ranks and bounded reviewed copy only', () => {
    const html = generateOutreachPreviewHtmlV3(summary());
    expect(html).toContain('class="priority-rank" aria-label="1">1</div>');
    expect(html).toContain('class="priority-rank" aria-label="2">2</div>');
    expect(html).toContain('class="priority-rank" aria-label="3">3</div>');
    expect(html).toContain('6 pages concernées');
  });

  it('renders limited diagnostics but has no surface for operational warnings', () => {
    const html = generateOutreachPreviewHtmlV3(
      summary({
        dataQuality: {
          status: 'limited',
          limitations: [
            {
              code: 'temporal-drift',
              summary: {
                fr: 'Le site a changé pendant le scan.',
                en: 'The site changed during the scan.',
              },
            },
          ],
        },
      }),
    );
    expect(html).toContain('Exploitable avec limites');
    expect(html).toContain('Le site a changé pendant le scan.');
    expect(html).not.toContain('Diagnostics d’exploitation');
  });

  it('renders the unavailable diagnostic as a disclosure, not a refusal', () => {
    const html = generateOutreachPreviewHtmlV3(
      summary({ dataQuality: { status: 'unavailable', limitations: [] } }),
    );
    expect(html).toContain('Diagnostic détaillé indisponible');
    expect(html).toContain('Les résultats restent limités aux mesures effectivement enregistrées.');
  });

  it('keeps the price code-owned and the document self-contained', () => {
    const html = generateOutreachPreviewHtmlV3(summary());
    expect(html).toContain(formatFullAuditPrice('fr'));
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('http://');
    for (const url of html.match(/https?:\/\/[^"]+/gu) ?? []) {
      expect(url).toContain('odysseusaudit.com');
    }
  });

  it('passes the strict v3 schema and current editorial lint', () => {
    expect(outreachPreviewSummaryV3Schema.parse(summary())).toBeTruthy();
    expect(
      lintOutreachPreviewHtml(generateOutreachPreviewHtmlV3(summary()), {
        editorialCurrent: true,
      }),
    ).toBeNull();
  });

  it('rejects contradictory data-quality state', () => {
    expect(() =>
      generateOutreachPreviewHtmlV3(
        summary({
          dataQuality: {
            status: 'complete',
            limitations: [
              {
                code: 'temporal-drift',
                summary: { fr: 'Limite.', en: 'Limitation.' },
              },
            ],
          },
        }),
      ),
    ).toThrow();
  });

  it('switches the whole current surface to English', () => {
    const html = generateOutreachPreviewHtmlV3(summary({ language: 'en' }));
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('Measured results');
    expect(html).toContain('What to address first');
    expect(html).toContain('Scan data quality');
    expect(html).not.toContain('Principaux résultats');
  });
});
