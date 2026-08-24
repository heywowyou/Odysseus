/**
 * B4 (2026-08-24). A real haaitza.com audit reported "Serve images in
 * next-gen formats" 65 times and "Efficiently encode images" 49 times: 102
 * of 305 findings, a third of the annex, all restating one instruction. The
 * cause was the fine dedupe pass keying on a DOM selector for a defect that
 * is not about a place in a page, made worse by sliders that generate their
 * wrapper id at runtime, so the same image on the same page keyed
 * differently on every scan.
 *
 * These tests pin both halves: the collapse itself, and that collapsing does
 * not throw away the file list, which is the only reason the collapse is
 * honest rather than merely shorter.
 */
import { describe, expect, it } from 'vitest';
import { extractLighthouseCandidates } from './normalize-lighthouse.js';
import { RESOURCE_IDENTIFIED_LIGHTHOUSE_AUDITS } from './normalize-lighthouse.js';
import { normalizeAudit } from './normalize.js';
import type { NormalizePageInput } from './normalize.js';

function lighthouseReport(auditId: string, items: Array<{ url: string; selector: string }>): unknown {
  return {
    categories: {
      performance: { auditRefs: [{ id: auditId, weight: 3, group: 'diagnostics' }] },
    },
    audits: {
      [auditId]: {
        id: auditId,
        title: 'Serve images in next-gen formats',
        description: 'Image formats like WebP often provide better compression.',
        score: 0,
        scoreDisplayMode: 'metricSavings',
        numericValue: 1350,
        details: {
          items: items.map((item, index) => ({
            url: item.url,
            totalBytes: 1000,
            wastedBytes: 500,
            node: {
              type: 'node',
              lhId: `1-${index}-DIV`,
              selector: item.selector,
              snippet: '<div class="bg-image">',
            },
          })),
        },
      },
    },
  };
}

function page(url: string, report: unknown): NormalizePageInput {
  return { url, lighthouse: report } as unknown as NormalizePageInput;
}

const AUDIT = 'modern-image-formats';

function normalize(pages: NormalizePageInput[]) {
  return normalizeAudit({
    auditId: 'audit-1',
    startedAt: new Date('2026-08-24T00:00:00Z'),
    pages,
  } as Parameters<typeof normalizeAudit>[0]);
}

describe('site-wide collapse of resource-identified Lighthouse audits', () => {
  it('reports one finding for the same image seen on many pages under unstable selectors', () => {
    // The real shape: one slider component, one image, a wrapper id that
    // differs per page load.
    const pages = [1, 2, 3, 4, 5].map((n) =>
      page(
        `https://example.com/room/${n}`,
        lighthouseReport(AUDIT, [
          { url: 'https://example.com/img/suite.jpg', selector: `div#swiper-wrapper-${n}abc123def456 > div.bg-image` },
        ]),
      ),
    );

    const findings = normalize(pages).filter((f) => f.ruleId === AUDIT);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.pageUrls).toHaveLength(5);
    expect(findings[0]?.occurrences).toBe(5);
  });

  it('reports one finding, not one per file, when several files fail the same audit', () => {
    const findings = normalize([
      page(
        'https://example.com/',
        lighthouseReport(AUDIT, [
          { url: 'https://example.com/img/a.jpg', selector: 'div.a' },
          { url: 'https://example.com/img/b.jpg', selector: 'div.b' },
          { url: 'https://example.com/img/c.jpg', selector: 'div.c' },
        ]),
      ),
    ]).filter((f) => f.ruleId === AUDIT);

    expect(findings).toHaveLength(1);
  });

  it('keeps every affected file in the evidence, deduped and sorted', () => {
    const findings = normalize([
      page(
        'https://example.com/',
        lighthouseReport(AUDIT, [
          { url: 'https://example.com/img/b.jpg', selector: 'div.b' },
          { url: 'https://example.com/img/a.jpg', selector: 'div.a' },
        ]),
      ),
      page(
        'https://example.com/about',
        lighthouseReport(AUDIT, [
          // Same file again from another page: one thing to fix, listed once.
          { url: 'https://example.com/img/a.jpg', selector: 'div.other' },
          { url: 'https://example.com/img/c.jpg', selector: 'div.c' },
        ]),
      ),
    ]).filter((f) => f.ruleId === AUDIT);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.rawEvidence).toMatchObject({
      resourceUrls: [
        'https://example.com/img/a.jpg',
        'https://example.com/img/b.jpg',
        'https://example.com/img/c.jpg',
      ],
    });
  });

  it('leaves an element-scoped audit alone: distinct selectors stay distinct findings', () => {
    // dom-size is not in the allowlist, so it keeps selector identity. Two
    // pages rather than one, because aggregateSamePageOccurrences (trade-off
    // 3's second pass) deliberately collapses distinct selectors confined to
    // a single page - that is pre-existing behaviour this change must not be
    // credited or blamed for, so the assertion is set up to avoid it.
    const findings = normalize([
      page('https://example.com/', lighthouseReport('dom-size', [{ url: '', selector: 'div.a' }])),
      page('https://example.com/about', lighthouseReport('dom-size', [{ url: '', selector: 'div.b' }])),
    ]).filter((f) => f.ruleId === 'dom-size');

    expect(findings).toHaveLength(2);
    expect(findings[0]?.rawEvidence).not.toHaveProperty('resourceUrls');
  });

  it('collapses a resource audit across pages where an element-scoped one would not', () => {
    // The same two-page setup as above, differing only in the audit id, so
    // the collapse is attributable to the allowlist and nothing else.
    const findings = normalize([
      page('https://example.com/', lighthouseReport(AUDIT, [{ url: 'https://example.com/a.jpg', selector: 'div.a' }])),
      page('https://example.com/about', lighthouseReport(AUDIT, [{ url: 'https://example.com/b.jpg', selector: 'div.b' }])),
    ]).filter((f) => f.ruleId === AUDIT);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.pageUrls).toHaveLength(2);
  });

  it('falls back to selector identity when a listed audit has no url on its items', () => {
    const report = lighthouseReport(AUDIT, [
      { url: '', selector: 'div.a' },
      { url: '', selector: 'div.b' },
    ]);
    // A missing url must not collapse everything onto the identity '' by
    // accident; that would merge findings on the strength of absent data.
    const findings = normalize([page('https://example.com/', report)]).filter((f) => f.ruleId === AUDIT);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.rawEvidence).not.toHaveProperty('resourceUrls');
  });

  it('every allowlisted audit id is a real string, and the set is not accidentally empty', () => {
    expect(RESOURCE_IDENTIFIED_LIGHTHOUSE_AUDITS.size).toBeGreaterThan(0);
    for (const id of RESOURCE_IDENTIFIED_LIGHTHOUSE_AUDITS) expect(id).toMatch(/^[a-z0-9-]+$/);
  });
});

describe('extractLighthouseCandidates sets dedupeIdentity only where intended', () => {
  it('sets an empty dedupeIdentity for a resource audit and none for others', () => {
    const resource = extractLighthouseCandidates(
      lighthouseReport(AUDIT, [{ url: 'https://example.com/a.jpg', selector: 'div.a' }]) as never,
      'https://example.com/',
    );
    expect(resource[0]?.dedupeIdentity).toBe('');

    const other = extractLighthouseCandidates(
      lighthouseReport('dom-size', [{ url: 'https://example.com/a.jpg', selector: 'div.a' }]) as never,
      'https://example.com/',
    );
    expect(other[0]?.dedupeIdentity).toBeUndefined();
  });
});
