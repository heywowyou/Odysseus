import { describe, expect, it } from 'vitest';
import { normalizeAudit } from './normalize.js';
import {
  buildAxeNode,
  buildAxeResultsInput,
  buildAxeViolation,
  buildNormalizePageInput,
  buildRenderDiffResult,
} from './fixtures.js';

const STARTED_AT = new Date('2026-08-02T00:00:00.000Z');

describe('normalizeAudit', () => {
  it('merges the same exact selector across two pages into one finding', () => {
    const axe = buildAxeResultsInput([
      buildAxeViolation({ id: 'color-contrast', nodes: [buildAxeNode({ target: ['#footer a'] })] }),
    ]);

    const findings = normalizeAudit({
      auditId: 'audit-1',
      startedAt: STARTED_AT,
      pages: [
        buildNormalizePageInput({ url: 'https://example.com/', axe }),
        buildNormalizePageInput({ url: 'https://example.com/about', axe }),
      ],
    });

    expect(findings).toHaveLength(1);
    const finding = findings[0];
    expect(finding?.pageUrls).toEqual(['https://example.com/', 'https://example.com/about']);
    expect(finding?.occurrences).toBe(2);
    const perPage = (finding?.rawEvidence['perPage'] ?? {}) as Record<string, unknown>;
    expect(Object.keys(perPage).sort()).toEqual(
      ['https://example.com/', 'https://example.com/about'].sort(),
    );
  });

  it('does NOT merge the same rule with different selectors across pages', () => {
    const axeA = buildAxeResultsInput([
      buildAxeViolation({ id: 'image-alt', nodes: [buildAxeNode({ target: ['#hero-img'] })] }),
    ]);
    const axeB = buildAxeResultsInput([
      buildAxeViolation({ id: 'image-alt', nodes: [buildAxeNode({ target: ['#banner-img'] })] }),
    ]);

    const findings = normalizeAudit({
      auditId: 'audit-1',
      startedAt: STARTED_AT,
      pages: [
        buildNormalizePageInput({ url: 'https://example.com/', axe: axeA }),
        buildNormalizePageInput({ url: 'https://example.com/other', axe: axeB }),
      ],
    });

    expect(findings).toHaveLength(2);
    expect(new Set(findings.map((f) => f.dedupeKey)).size).toBe(2);
  });

  it('merges element-scoped candidates from multiple nodes on one page into one finding', () => {
    const axe = buildAxeResultsInput([
      buildAxeViolation({
        id: 'color-contrast',
        nodes: [buildAxeNode({ target: ['#a'] }), buildAxeNode({ target: ['#a'] })],
      }),
    ]);

    const findings = normalizeAudit({
      auditId: 'audit-1',
      startedAt: STARTED_AT,
      pages: [buildNormalizePageInput({ url: 'https://example.com/', axe })],
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.occurrences).toBe(2);
  });

  it('assigns sequential findingIds and stamps schemaVersion/auditId/dedupeKey/timestamps', () => {
    const renderDiff = buildRenderDiffResult({ missingPercent: 90 });
    const findings = normalizeAudit({
      auditId: 'audit-xyz',
      startedAt: STARTED_AT,
      pages: [buildNormalizePageInput({ url: renderDiff.pageUrl, renderDiff })],
    });

    expect(findings).toHaveLength(1);
    const finding = findings[0];
    expect(finding?.findingId).toBe('f001');
    expect(finding?.auditId).toBe('audit-xyz');
    expect(finding?.schemaVersion).toBe(1);
    expect(finding?.firstSeenAt).toEqual(STARTED_AT);
    expect(finding?.lastSeenAt).toEqual(STARTED_AT);
    expect(finding?.dedupeKey).toMatch(/^[0-9a-f]{16}$/);
  });

  it('produces an empty findings array when no page has any scanner output', () => {
    const findings = normalizeAudit({
      auditId: 'audit-1',
      startedAt: STARTED_AT,
      pages: [buildNormalizePageInput({ url: 'https://example.com/' })],
    });
    expect(findings).toEqual([]);
  });

  it('page-scoped render-diff findings never carry sentinel selectors', () => {
    const renderDiff = buildRenderDiffResult({ missingPercent: 90 });
    const findings = normalizeAudit({
      auditId: 'audit-1',
      startedAt: STARTED_AT,
      pages: [buildNormalizePageInput({ url: renderDiff.pageUrl, renderDiff })],
    });
    expect(findings[0]?.elements).toEqual([]);
  });
});
