import { describe, expect, it } from 'vitest';
import { outreachPreviewSummaryV3Schema, type OutreachPreviewSummaryV3 } from '@odysseus/core';
import { formatFullAuditPrice } from '@odysseus/core';
import { generateOutreachPreviewHtmlV3 } from './render-html-v3.js';
import { lintOutreachPreviewHtml } from './preview-lint.js';

function summary(overrides: Partial<OutreachPreviewSummaryV3> = {}): OutreachPreviewSummaryV3 {
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

describe('generateOutreachPreviewHtmlV3', () => {
  it('renders the report-aligned hierarchy and no independent grade or risk hero', () => {
    const html = generateOutreachPreviewHtmlV3(summary());
    const headings = [
      'Principaux résultats',
      'À traiter en premier',
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

  it('breaks the findings down by category, largest first, without empty categories', () => {
    const html = generateOutreachPreviewHtmlV3(summary());
    const section = html.slice(html.indexOf('Répartition par catégorie'));
    const tiles = [...section.matchAll(/<div class="stat-label">([^<]+)<\/div>/gu)]
      .map((match) => match[1])
      .slice(0, 3);
    expect(tiles).toEqual(['Accessibilité', 'Performance', 'Référencement naturel']);
    expect(section).not.toContain('Rendu JavaScript');
    expect(section).not.toContain('Confidentialité</div>');
  });

  it('renders priority ranks and bounded reviewed copy only', () => {
    const html = generateOutreachPreviewHtmlV3(summary());
    expect(html).toContain('class="priority-rank" aria-label="1">1</div>');
    expect(html).toContain('class="priority-rank" aria-label="2">2</div>');
    expect(html).toContain('class="priority-rank" aria-label="3">3</div>');
    expect(html).toContain('6 pages concernées');
  });

  it('shows neither a scan date nor a data-quality section', () => {
    const html = generateOutreachPreviewHtmlV3(summary());
    expect(html).toContain(
      '<div class="cover-signature" style="font-size:13px;opacity:0.5">Odysseus</div>',
    );
    expect(html).not.toMatch(
      /\d{1,2} (?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre) 20\d\d/u,
    );
    expect(html).not.toContain('Qualité des données');
    expect(html).not.toContain('Limites à connaître');
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

  it('switches the whole current surface to English', () => {
    const html = generateOutreachPreviewHtmlV3(summary({ language: 'en' }));
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('Measured results');
    expect(html).toContain('What to address first');
    expect(html).not.toContain('Principaux résultats');
  });
});
