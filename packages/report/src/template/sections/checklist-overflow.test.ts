/**
 * A4 / overflow audit (2026-08-24 three-site review).
 *
 * Three separate sections have now shipped the same defect: a fixed-width
 * grid cell holding an unbounded list, inside a fragment CSS forbids from
 * breaking (`.appendix-group`, then `.row-atomic` on the checklist, then
 * the priority card's own metadata row). Paged.js given an atomic
 * fragment taller than a page has no valid break point and degrades into
 * one or two characters per line - real La Corniche and Haaitza reports
 * shipped 19 and 9 pages of that.
 *
 * Every previous fix was keyed to the one list that had actually blown
 * up. This test is not: it renders a deliberately extreme theme through
 * the real section and asserts that *every* cell stays bounded, so the
 * next unbounded list added to this grid fails here rather than in a
 * client's PDF.
 */
import { describe, expect, it } from 'vitest';
import type { AuditManifest, Finding } from '@odysseus/core';
import { renderChecklist } from './checklist.js';
import { getStrings } from '../strings/i18n.js';
import type { StoredAnalysis } from '../../types.js';

/** Well beyond anything observed: Haaitza's worst real theme carried 265
 *  finding ids across 66 pages with 2 criteria. */
const EXTREME_FINDING_COUNT = 400;

const findings: Finding[] = Array.from(
  { length: EXTREME_FINDING_COUNT },
  (_, i) =>
    ({
      findingId: `f${String(i + 1).padStart(3, '0')}`,
      ruleId: 'link-name',
      category: 'accessibility',
      severity: 'serious',
      wcagCriteria: ['1.1.1', '1.3.1', '1.4.3', '1.4.4', '2.1.1', '2.4.4', '2.5.8', '4.1.2'],
      pageUrls: Array.from({ length: 40 }, (_, p) => `https://example.com/page-${p}`),
      occurrences: 3,
      elements: [{ pageUrl: 'https://example.com/page-0', selector: 'a', snippet: '<a></a>' }],
    }) as unknown as Finding,
);

const analysis = {
  language: 'fr',
  themes: [
    {
      priorityRank: 1,
      title:
        'Liens sans texte identifiable, dans un intitulé volontairement très long pour tester la mise en page',
      category: 'accessibility',
      businessImpact: 'x',
      recommendedActions: ['a'],
      effort: 'medium',
      impact: 'high',
      findingIds: findings.map((f) => f.findingId),
    },
  ],
  executiveSummary: 'x',
  quickWins: [],
  notes: '',
} as unknown as StoredAnalysis;

const manifest = {
  startedAt: '2026-08-24T00:00:00.000Z',
  siteUrl: 'https://example.com/',
  crawl: { startUrl: 'https://example.com/' },
  pages: Array.from({ length: 40 }, (_, p) => ({
    url: `https://example.com/page-${p}`,
    status: 'visited',
  })),
} as unknown as AuditManifest;

/** Text content of every `${cell(...)}` div in the rendered grid. */
function cellTexts(html: string): string[] {
  return [
    ...html.matchAll(
      /<div style="padding:var\(--space-2\);border-bottom[^"]*">([\s\S]*?)<\/div>\s*(?=<div|<\/div>)/gu,
    ),
  ].map((m) =>
    m[1]!
      .replace(/<[^>]+>/gu, '')
      .replace(/\s+/gu, ' ')
      .trim(),
  );
}

/** A 110px column at 11px monospace fits roughly 15 characters per line;
 *  an A4 sheet's content box is about 55 such lines. 600 characters is
 *  comfortably inside one page in the narrowest column in the grid, and
 *  far below the ~4000 a real 265-id list produced. */
const CELL_CHARACTER_BUDGET = 600;

describe('the printable checklist never renders an unbounded cell', () => {
  const html = renderChecklist(getStrings('fr'), 6, 'fr', analysis, findings, manifest);

  it('renders the extreme theme at all', () => {
    expect(html).toContain('f001');
  });

  it('keeps every cell within a single page of content', () => {
    const oversized = cellTexts(html).filter((text) => text.length > CELL_CHARACTER_BUDGET);
    expect(oversized.map((t) => `${t.length} chars: ${t.slice(0, 80)}...`)).toEqual([]);
  });

  it('caps the finding-id list rather than listing all 400', () => {
    expect(html).not.toContain('f400');
    expect(html).toContain('autres');
  });

  it('caps the WCAG criteria list', () => {
    expect(html).not.toContain('4.1.2');
  });
});
