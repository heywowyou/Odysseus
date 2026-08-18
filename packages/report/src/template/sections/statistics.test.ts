import { describe, expect, it } from 'vitest';
import type { AuditManifest, Finding, FindingCategory } from '@odysseus/core';
import { renderStatistics } from './statistics.js';
import { getStrings } from '../strings/i18n.js';
import { loadSasFernandeFindings, loadSasFernandeManifest } from '../../test-fixtures.js';

function buildCategoryFinding(category: FindingCategory, index: number): Finding {
  return {
    findingId: `f-${category}-${index}`,
    auditId: 'audit-1',
    schemaVersion: 1,
    source: 'axe',
    ruleId: `rule-${category}`,
    category,
    severity: 'minor',
    wcagCriteria: [],
    title: 'Title',
    description: 'desc',
    pageUrls: ['https://example.com/'],
    occurrences: 1,
    elements: [{ pageUrl: 'https://example.com/', selector: '.x', snippet: '' }],
    rawEvidence: {},
    dedupeKey: `d-${category}-${index}`,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
  };
}

/** Only manifest.pages (filtered by status) is read by computeStatistics,
 *  so every other field is a minimal placeholder, cast rather than fully
 *  typed out. */
function buildMinimalManifest(): AuditManifest {
  return {
    auditId: 'audit-1',
    kind: 'audit',
    siteUrl: 'https://example.com',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    tool: {} as AuditManifest['tool'],
    config: {} as AuditManifest['config'],
    crawl: {
      startUrl: 'https://example.com/',
      visitedCount: 1,
      maxPages: 20,
      maxDepth: 3,
      robotsTxtFound: false,
      effectiveDelayMs: 500,
    },
    pages: [{ url: 'https://example.com/', depth: 0, status: 'visited', errors: {} }],
  };
}

describe('renderStatistics against the real sas-fernande.fr scan', () => {
  it('renders the real page count, finding count, and severity breakdown', async () => {
    const findings = await loadSasFernandeFindings();
    const manifest = await loadSasFernandeManifest();

    const html = renderStatistics(getStrings('fr'), 3, 'fr', findings, manifest);

    // 11 pages, 78 findings, 61 minor (docs/normalization-rules.md section 7).
    expect(html).toContain('>11</div>');
    expect(html).toContain('>78</div>');
    expect(html).toContain('>61</div>');
    expect(html).toContain('Mineur'); // severity label, doc §3 canonical map
  });

  it('renders the wide WCAG-fail-count paragraph with the real pages-affected count filled in', async () => {
    const findings = await loadSasFernandeFindings();
    const manifest = await loadSasFernandeManifest();

    const html = renderStatistics(getStrings('en'), 3, 'en', findings, manifest);

    expect(html).not.toContain('{pages}');
    expect(html).toMatch(/WCAG 2\.2 AA criteria failing across \d+ pages/);
  });

  it('renders exactly 4 number tiles, 4 severity tiles, and 5 category tiles (doc §3 section 03 cap, plus geo added milestone 8.5c)', async () => {
    const findings = await loadSasFernandeFindings();
    const manifest = await loadSasFernandeManifest();

    const html = renderStatistics(getStrings('fr'), 3, 'fr', findings, manifest);

    expect((html.match(/font-size:28px/g) ?? []).length).toBe(4);
    expect((html.match(/font-size:24px/g) ?? []).length).toBe(4);
    expect((html.match(/font-size:22px/g) ?? []).length).toBe(5);
  });

  it('B9: category tiles render in descending order by count, not the fixed CATEGORY_ORDER', () => {
    // CATEGORY_ORDER is accessibility/seo/rendering/performance/geo - give
    // 'performance' the most findings (the real haaitza symptom: the
    // largest bucket rendered fourth regardless of size) and confirm it
    // now renders first.
    const findings: Finding[] = [
      buildCategoryFinding('accessibility', 1),
      buildCategoryFinding('seo', 1),
      buildCategoryFinding('performance', 1),
      buildCategoryFinding('performance', 2),
      buildCategoryFinding('performance', 3),
    ];
    const manifest = buildMinimalManifest();

    const html = renderStatistics(getStrings('fr'), 3, 'fr', findings, manifest);
    const labels = ['Performance', 'Accessibilité', 'Référencement (SEO)', 'Rendu', 'Visibilité dans les moteurs d&#39;IA (GEO)'];
    const positions = labels.map((label) => html.indexOf(`>${label}<`));

    expect(positions.every((p) => p !== -1)).toBe(true);
    expect(positions[0]).toBeLessThan(Math.min(...positions.slice(1)));
  });

  it('B9: the WCAG fail-count line carries a heading, not sitting unlabelled', async () => {
    const findings = await loadSasFernandeFindings();
    const manifest = await loadSasFernandeManifest();

    const html = renderStatistics(getStrings('fr'), 3, 'fr', findings, manifest);

    expect(html).toContain('<h5>Conformité WCAG</h5>');
  });

  // item 10: "pages avec au moins un constat critique" is already computed
  // live from Finding[] (computeStatistics), so once item 9's severity cap
  // ships, a performance finding whose raw metric only rates "à améliorer"
  // (mid) can no longer inflate this count by contributing a spurious
  // "critical" on every page it appears on.
  it('item 10: a performance finding capped below critical by item 9 does not inflate pagesWithCritical', () => {
    const cappedPerfFinding = buildCategoryFinding('performance', 1);
    const cappedFinding: Finding = { ...cappedPerfFinding, severity: 'serious', pageUrls: ['https://example.com/'] };
    const genuineAccessibilityCritical: Finding = {
      ...buildCategoryFinding('accessibility', 1),
      severity: 'critical',
      pageUrls: ['https://example.com/'],
    };
    const manifest = buildMinimalManifest();

    const html = renderStatistics(getStrings('en'), 3, 'en', [cappedFinding, genuineAccessibilityCritical], manifest);

    // Exactly 1 page has an (uncapped) critical finding, out of 1 scanned.
    expect(html).toContain('>1/1</div>');
  });
});
