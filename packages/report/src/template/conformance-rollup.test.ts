import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Finding } from '@odysseus/core';
import { buildConformanceRollup, buildHeuristicRollup, pagesWithWcagFailures } from './conformance-rollup.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** Real scan behind docs/report-v2-refactor.md itself. The doc's own
 *  Part 1 prose cites "7 criteria failing on 18 of 20 pages", but that
 *  figure came from a hand-transcription of the v1 PDF, not from
 *  recomputing against findings.json - recomputed here, the real data
 *  shows all 20 pages carry at least one WCAG-tagged accessibility
 *  finding. Trust the recomputed number over the doc's prose. */
function loadHaaitzaFindings(): Finding[] {
  const findingsPath = path.join(
    moduleDir,
    '../../../../artifacts/haaitza.com/2026-08-06T20-30-06Z/findings.json',
  );
  return JSON.parse(readFileSync(findingsPath, 'utf-8')) as Finding[];
}

describe('buildConformanceRollup', () => {
  it('produces exactly the 7 criteria the doc itself verified against the real haaitza scan', () => {
    const findings = loadHaaitzaFindings();
    const rows = buildConformanceRollup(findings);

    expect(rows.map((r) => r.criterion)).toEqual(['1.1.1', '1.4.1', '1.4.3', '1.4.4', '2.4.4', '2.5.8', '4.1.2']);
  });

  it('sorts numerically, not lexicographically (1.4.10 would misorder before 1.4.2 under plain string sort)', () => {
    const base = {
      auditId: 'a1',
      schemaVersion: 1 as const,
      source: 'axe' as const,
      category: 'accessibility' as const,
      severity: 'serious' as const,
      title: 't',
      description: 'd',
      pageUrls: ['https://example.com/'],
      occurrences: 1,
      elements: [],
      rawEvidence: {},
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    };
    const findings: Finding[] = [
      { ...base, findingId: 'f1', ruleId: 'r1', wcagCriteria: ['1.4.10'], dedupeKey: 'd1' },
      { ...base, findingId: 'f2', ruleId: 'r2', wcagCriteria: ['1.4.2'], dedupeKey: 'd2' },
    ];

    expect(buildConformanceRollup(findings).map((r) => r.criterion)).toEqual(['1.4.2', '1.4.10']);
  });

  it('counts a finding under every criterion it carries', () => {
    const base = {
      findingId: 'f1',
      auditId: 'a1',
      schemaVersion: 1 as const,
      source: 'axe' as const,
      ruleId: 'link-name',
      category: 'accessibility' as const,
      severity: 'serious' as const,
      title: 't',
      description: 'd',
      pageUrls: ['https://example.com/'],
      occurrences: 5,
      elements: [],
      rawEvidence: {},
      dedupeKey: 'd1',
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    };
    const findings: Finding[] = [{ ...base, wcagCriteria: ['2.4.4', '4.1.2'] }];

    const rows = buildConformanceRollup(findings);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.findingCount === 1 && r.totalOccurrences === 5)).toBe(true);
  });

  it('excludes non-accessibility findings and accessibility findings with no WCAG criterion', () => {
    const base = {
      auditId: 'a1',
      schemaVersion: 1 as const,
      source: 'lighthouse' as const,
      severity: 'serious' as const,
      title: 't',
      description: 'd',
      pageUrls: ['https://example.com/'],
      occurrences: 1,
      elements: [],
      rawEvidence: {},
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    };
    const findings: Finding[] = [
      { ...base, findingId: 'f1', ruleId: 'r1', category: 'seo', wcagCriteria: [], dedupeKey: 'd1' },
      { ...base, findingId: 'f2', ruleId: 'r2', category: 'accessibility', wcagCriteria: [], dedupeKey: 'd2' },
    ];

    expect(buildConformanceRollup(findings)).toEqual([]);
  });
});

describe('pagesWithWcagFailures', () => {
  it('counts all 20 real haaitza pages, not the 18 the doc cited from a hand-transcription', () => {
    const findings = loadHaaitzaFindings();
    expect(pagesWithWcagFailures(findings)).toBe(20);
  });
});

// item 8: alt-text-quality-heuristic is an explicitly heuristic red-flag
// check (normalize-alt-text.ts), never a genuine axe-core conformance
// failure, so it must never contribute a row to buildConformanceRollup -
// the table a client can hand directly to a lawyer or agency - no matter
// how many occurrences it has. It belongs in buildHeuristicRollup's
// separate table instead.
describe('item 8: heuristic findings never contribute to the conformance rollup', () => {
  const heuristicFinding: Finding = {
    findingId: 'f1',
    auditId: 'a1',
    schemaVersion: 1,
    source: 'custom',
    ruleId: 'alt-text-quality-heuristic',
    category: 'accessibility',
    severity: 'minor',
    wcagCriteria: ['1.1.1'],
    title: 'Alt text looks like a raw filename',
    description: 'd',
    pageUrls: Array.from({ length: 20 }, (_, i) => `https://example.com/${i}`),
    occurrences: 157,
    elements: [],
    rawEvidence: {},
    dedupeKey: 'd1',
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
  };
  const genuineAxeFinding: Finding = {
    ...heuristicFinding,
    findingId: 'f2',
    source: 'axe',
    ruleId: 'image-alt',
    dedupeKey: 'd2',
    pageUrls: ['https://example.com/0'],
    occurrences: 1,
  };

  it('buildConformanceRollup excludes it entirely, even when it is the only accessibility finding', () => {
    expect(buildConformanceRollup([heuristicFinding])).toEqual([]);
  });

  it('buildConformanceRollup still includes a genuine axe finding for the same criterion', () => {
    const rows = buildConformanceRollup([heuristicFinding, genuineAxeFinding]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ criterion: '1.1.1', findingCount: 1, totalOccurrences: 1, pages: 1 });
  });

  it('buildHeuristicRollup carries the heuristic finding, not the genuine axe one', () => {
    const rows = buildHeuristicRollup([heuristicFinding, genuineAxeFinding]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ criterion: '1.1.1', findingCount: 1, totalOccurrences: 157, pages: 20 });
  });

  it('pagesWithWcagFailures does not count pages only reached via the heuristic finding', () => {
    expect(pagesWithWcagFailures([heuristicFinding])).toBe(0);
    expect(pagesWithWcagFailures([heuristicFinding, genuineAxeFinding])).toBe(1);
  });

  it('the real haaitza fixture (no heuristic findings in this particular scan) still recomputes the same 7-criteria rollup as before, confirming the exclusion is a no-op when there is nothing to exclude', () => {
    const findings = loadHaaitzaFindings();
    expect(findings.some((f) => f.ruleId === 'alt-text-quality-heuristic')).toBe(false);
    expect(buildConformanceRollup(findings).map((r) => r.criterion)).toEqual([
      '1.1.1',
      '1.4.1',
      '1.4.3',
      '1.4.4',
      '2.4.4',
      '2.5.8',
      '4.1.2',
    ]);
    expect(buildHeuristicRollup(findings)).toEqual([]);
  });
});

describe('item 1.11: the pages count is the true union across findings sharing a criterion, not one finding\'s own max', () => {
  const base = {
    auditId: 'a1',
    schemaVersion: 1 as const,
    source: 'axe' as const,
    category: 'accessibility' as const,
    severity: 'serious' as const,
    title: 't',
    description: 'd',
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
  };

  it('a real report showed this exact split: two findings on 1.3.1, overlapping but not identical page sets - the union (10) must not equal either finding\'s own count (9 and 2)', () => {
    const findingA: Finding = {
      ...base,
      findingId: 'f1',
      ruleId: 'aria-required-children',
      wcagCriteria: ['1.3.1'],
      dedupeKey: 'd1',
      pageUrls: Array.from({ length: 9 }, (_, i) => `https://example.com/page-${i}`),
    };
    const findingB: Finding = {
      ...base,
      findingId: 'f2',
      ruleId: 'list',
      wcagCriteria: ['1.3.1'],
      dedupeKey: 'd2',
      // Overlaps page-0 and page-1 with findingA, adds one new page.
      pageUrls: ['https://example.com/page-0', 'https://example.com/page-1', 'https://example.com/page-new'],
    };

    const rows = buildConformanceRollup([findingA, findingB]);
    expect(rows).toHaveLength(1);
    // Union of {page-0..8} and {page-0, page-1, page-new} = 10 distinct URLs,
    // not 9 (findingA's own count) and not 3 (findingB's own count).
    expect(rows[0]).toMatchObject({ criterion: '1.3.1', findingCount: 2, pages: 10 });
  });
});
