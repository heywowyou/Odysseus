import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Finding } from '@odysseus/core';
import { buildConformanceRollup, pagesWithWcagFailures } from './conformance-rollup.js';

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
