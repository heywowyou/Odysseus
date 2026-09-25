import { describe, expect, it } from 'vitest';
import { outreachPreviewSummaryV3Schema } from '@odysseus/core';
import { formatFullAuditPrice } from '@odysseus/core';
import { generateOutreachPreviewHtmlV3 } from './render-html-v3.js';
import { lintOutreachPreviewHtml } from './preview-lint.js';
import { previewSummaryV3 as summary } from './test-fixtures.js';

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
