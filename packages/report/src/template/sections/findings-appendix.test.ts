import { describe, expect, it } from 'vitest';
import type { AuditManifest, Finding } from '@odysseus/core';
import { selectReferenceStats } from '@odysseus/core';
import { renderFindingsAppendix } from './findings-appendix.js';
import { getStrings } from '../strings/i18n.js';
import { loadSmallSiteFindings, loadSmallSiteManifest } from '../../test-fixtures.js';

function buildManifest(): AuditManifest {
  return {
    auditId: 'audit-1',
    kind: 'audit',
    siteUrl: 'https://example.com/',
    startedAt: '2026-08-02T00:00:00.000Z',
    finishedAt: '2026-08-02T00:05:00.000Z',
    tool: {
      odysseusVersion: '0.1.0',
      findingsSchemaVersion: 1,
      axeCoreVersion: '4.12.1',
      lighthouseVersion: '12.8.2',
      playwrightVersion: '1.49.0',
      chromiumVersion: '131.0.0',
    },
    config: {
      maxPages: 20,
      maxDepth: 5,
      crawlDelayMs: 1000,
      pageTimeoutMs: 30_000,
      lighthouseTimeoutMs: 60_000,
      userAgent: 'OdysseusAuditBot/0.1',
      scanConcurrency: 3,
    },
    crawl: {
      startUrl: 'https://example.com/',
      visitedCount: 1,
      maxPages: 20,
      maxDepth: 5,
      robotsTxtFound: true,
      effectiveDelayMs: 1000,
    },
    pages: [{ url: 'https://example.com/', depth: 0, status: 'visited', errors: {} }],
  };
}

function buildManifestWithPages(count: number): AuditManifest {
  const base = buildManifest();
  return {
    ...base,
    crawl: { ...base.crawl, visitedCount: count },
    pages: Array.from({ length: count }, (_, i) => ({
      url: `https://example.com/page-${i}`,
      depth: 0,
      status: 'visited' as const,
      errors: {},
    })),
  };
}

describe('renderFindingsAppendix against the real small-site.test findings', () => {
  it('includes minor findings, which never reach the LLM layer', async () => {
    const findings = await loadSmallSiteFindings();
    const manifest = await loadSmallSiteManifest();
    expect(findings.some((f) => f.severity === 'minor')).toBe(true);

    const html = renderFindingsAppendix(getStrings('en'), 12, 'en', findings, manifest, 'general');
    const minorFinding = findings.find((f) => f.severity === 'minor');
    expect(html).toContain(minorFinding?.ruleId ?? '__missing__');
  });

  it('groups findings under their category heading', async () => {
    const findings = await loadSmallSiteFindings();
    const manifest = await loadSmallSiteManifest();
    const html = renderFindingsAppendix(getStrings('en'), 12, 'en', findings, manifest, 'general');

    expect(html).toContain('Accessibility');
    expect(html).toContain('Performance');
  });

  it('tags a rule group as diverted only when every one of its findings is confined to diverted pages', async () => {
    const findings = await loadSmallSiteFindings();
    const manifest = await loadSmallSiteManifest();
    const html = renderFindingsAppendix(getStrings('fr'), 12, 'fr', findings, manifest, 'general');

    // f009 (link-in-text-block) is confined entirely to /mentions-legales/,
    // which matches the legal-page pattern - real diversion, not a
    // contrived fixture. Its single-finding rule-group must be tagged.
    const linkInTextBlockGroup = html.split('>link-in-text-block</span>')[1] ?? '';
    expect(linkInTextBlockGroup.slice(0, 200)).toContain('class="obs-tag"');

    // color-contrast's group mixes f012 (legal-confined) with f010/f011/f015
    // (ordinary pages), so the group as a whole must not be tagged - only
    // a fully-diverted group is.
    const colorContrastGroup = html.split('>color-contrast</span>')[1] ?? '';
    expect(colorContrastGroup.slice(0, 200)).not.toContain('class="obs-tag"');
  });

  it('B1: suppresses the geo citation when its statistic id is already in the shared citedStatIds Set', () => {
    const geoFinding: Finding = {
      findingId: 'f001',
      auditId: 'a',
      schemaVersion: 1,
      source: 'custom',
      ruleId: 'llms-txt-missing',
      category: 'geo',
      severity: 'moderate',
      wcagCriteria: [],
      title: 'No llms.txt found',
      description: 'desc',
      pageUrls: ['https://example.com/'],
      occurrences: 1,
      elements: [],
      rawEvidence: {},
      dedupeKey: 'k',
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    };

    const withoutDedupe = renderFindingsAppendix(
      getStrings('fr'),
      12,
      'fr',
      [geoFinding],
      buildManifest(),
      'general',
    );
    expect(withoutDedupe).toContain('Repère chiffré');

    const allGeoStatIds = new Set(selectReferenceStats('geo', 'general').map((stat) => stat.id));
    const withDedupe = renderFindingsAppendix(
      getStrings('fr'),
      12,
      'fr',
      [geoFinding],
      buildManifest(),
      'general',
      allGeoStatIds,
    );
    expect(withDedupe).not.toContain('Repère chiffré');
  });

  it('escapes finding titles so injected markup cannot execute', () => {
    const findings: Finding[] = [
      {
        findingId: 'f001',
        auditId: 'a',
        schemaVersion: 1,
        source: 'axe',
        ruleId: 'color-contrast',
        category: 'accessibility',
        severity: 'serious',
        wcagCriteria: ['1.4.3'],
        title: '<img src=x onerror=alert(1)>',
        description: 'desc',
        pageUrls: ['https://example.com/'],
        occurrences: 1,
        elements: [],
        rawEvidence: {},
        dedupeKey: 'k',
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
    ];

    const html = renderFindingsAppendix(
      getStrings('en'),
      12,
      'en',
      findings,
      buildManifest(),
      'general',
    );
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img');
  });

  it('escapes a malicious selector so injected markup cannot execute', () => {
    const findings: Finding[] = [
      {
        findingId: 'f001',
        auditId: 'a',
        schemaVersion: 1,
        source: 'axe',
        ruleId: 'color-contrast',
        category: 'accessibility',
        severity: 'serious',
        wcagCriteria: ['1.4.3'],
        title: 'Insufficient color contrast',
        description: 'desc',
        pageUrls: ['https://example.com/'],
        occurrences: 1,
        elements: [
          {
            pageUrl: 'https://example.com/',
            selector: '<script>alert(1)</script>',
            snippet: '',
          },
        ],
        rawEvidence: {},
        dedupeKey: 'k',
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
    ];

    const html = renderFindingsAppendix(
      getStrings('en'),
      12,
      'en',
      findings,
      buildManifest(),
      'general',
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

// item 38 [REGRESSION]: rule titles and codes rendered in English inside
// a French report.
describe('item 38: rule titles and codes render in French with a gloss', () => {
  it('renders the French translation, not the English title, for a known rule', async () => {
    const findings = await loadSmallSiteFindings();
    const manifest = await loadSmallSiteManifest();
    const html = renderFindingsAppendix(getStrings('fr'), 12, 'fr', findings, manifest, 'general');

    expect(html).toContain('Le contraste des couleurs est insuffisant');
    expect(html).not.toContain('Elements must meet minimum color contrast ratio thresholds');
  });

  it('renders a plain-language gloss under the machine rule code', async () => {
    const findings = await loadSmallSiteFindings();
    const manifest = await loadSmallSiteManifest();
    const html = renderFindingsAppendix(getStrings('fr'), 12, 'fr', findings, manifest, 'general');

    expect(html).toContain('color-contrast');
    expect(html).toContain('en dessous du seuil minimal requis');
  });

  it('leaves the English title untranslated for an English report', async () => {
    const findings = await loadSmallSiteFindings();
    const manifest = await loadSmallSiteManifest();
    const html = renderFindingsAppendix(getStrings('en'), 12, 'en', findings, manifest, 'general');

    expect(html).toContain('Elements must meet minimum color contrast ratio thresholds');
  });
});

// item 25: every finding stated a page count ("9 pages") and never the
// actual URLs - the largest gap between the paid full-audit spec ("Full
// page and selector detail for every finding") and what the appendix
// delivered.
describe('item 25: every finding lists its actual page URLs, not just a count', () => {
  it('lists all page URLs for a finding present on multiple pages', () => {
    const findings: Finding[] = [
      {
        findingId: 'f001',
        auditId: 'a',
        schemaVersion: 1,
        source: 'axe',
        ruleId: 'color-contrast',
        category: 'accessibility',
        severity: 'serious',
        wcagCriteria: ['1.4.3'],
        title: 'Insufficient contrast',
        description: 'desc',
        pageUrls: ['https://example.com/a', 'https://example.com/b', 'https://example.com/c'],
        occurrences: 3,
        elements: [],
        rawEvidence: {},
        dedupeKey: 'd1',
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
    ];

    const html = renderFindingsAppendix(
      getStrings('en'),
      12,
      'en',
      findings,
      buildManifest(),
      'general',
    );
    expect(html).toContain('https://example.com/a');
    expect(html).toContain('https://example.com/b');
    expect(html).toContain('https://example.com/c');
  });
});

// item 3.1: roughly 18 of 37 pages in a real report were the same 20-URL
// list reprinted verbatim, once per finding that hit every crawled page.
describe('item 3.1: repeated URL lists collapse instead of reprinting every page', () => {
  function buildFinding(overrides: Partial<Finding>): Finding {
    return {
      findingId: 'f001',
      auditId: 'a',
      schemaVersion: 1,
      source: 'axe',
      ruleId: 'color-contrast',
      category: 'accessibility',
      severity: 'serious',
      wcagCriteria: ['1.4.3'],
      title: 'Insufficient contrast',
      description: 'desc',
      pageUrls: [],
      occurrences: 1,
      elements: [],
      rawEvidence: {},
      dedupeKey: 'd1',
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      ...overrides,
    };
  }

  it('collapses to "toutes les pages analysées" when a finding hits every crawled page', () => {
    const manifest = buildManifestWithPages(8);
    const finding = buildFinding({
      pageUrls: manifest.pages.map((p) => p.url),
      occurrences: 8,
    });

    const html = renderFindingsAppendix(getStrings('fr'), 12, 'fr', [finding], manifest, 'general');
    // Scoped to "Pages : ..." (the per-finding url-cell prefix), not the
    // separate "Pages explorées (N)" crawled-pages block above it, which
    // legitimately lists every page-N URL regardless of this collapse.
    expect(html).toContain('Pages : Toutes les pages analysées (8)');
    expect(html).not.toContain('Pages : https://example.com/page-0');
  });

  it('caps the list and names the remainder when a finding hits many, but not all, pages', () => {
    const manifest = buildManifestWithPages(10);
    const finding = buildFinding({
      pageUrls: manifest.pages.slice(0, 9).map((p) => p.url),
      occurrences: 9,
    });

    const html = renderFindingsAppendix(getStrings('fr'), 12, 'fr', [finding], manifest, 'general');
    // The finding's own url-cell line, isolated from the separate crawled-
    // pages block (which legitimately lists every page-N URL regardless).
    const urlCellLine = html
      .split('\n')
      .find((line) => line.includes('class="url-cell"') && line.includes('Pages :'));
    expect(urlCellLine).toBeDefined();
    expect(urlCellLine).toContain('et 4 autres');
    // Capped at 5: shown pages present, the 6th-9th are not spelled out.
    expect(urlCellLine).toContain('page-0');
    expect(urlCellLine).toContain('page-4');
    expect(urlCellLine).not.toContain('page-5');
  });

  it('lists every URL plainly, no collapse or cap, for a small finding well under the total', () => {
    const manifest = buildManifestWithPages(20);
    const finding = buildFinding({
      pageUrls: [manifest.pages[0]!.url, manifest.pages[1]!.url],
      occurrences: 2,
    });

    const html = renderFindingsAppendix(getStrings('fr'), 12, 'fr', [finding], manifest, 'general');
    expect(html).toContain('page-0');
    expect(html).toContain('page-1');
    expect(html).not.toContain('Toutes les pages analysées');
    expect(html).not.toContain('autres');
  });
});

// 2026-08-22, Large Rule Families report review: a real report repeated the
// identical 5-URL-plus-"et 21 autres" list under nearly every finding in
// a rule group whose findings shared the same underlying page set (e.g.
// a booking widget missing an alt attribute, present on the same pages
// every time it appears) - the bulk of the annex's length for no new
// information.
describe('2026-08-22: findings sharing an identical page-URL set within one rule group reference the first one instead of repeating the list', () => {
  function buildFinding(overrides: Partial<Finding> & Pick<Finding, 'findingId'>): Finding {
    return {
      auditId: 'a',
      schemaVersion: 1,
      source: 'axe',
      ruleId: 'image-alt',
      category: 'accessibility',
      severity: 'critical',
      wcagCriteria: ['1.1.1'],
      title: 'Missing alt text',
      description: 'desc',
      pageUrls: [],
      occurrences: 1,
      elements: [],
      rawEvidence: {},
      dedupeKey: overrides.findingId,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      ...overrides,
    };
  }

  it('prints the URL list once and refers every later finding with the identical set back to the first', () => {
    const manifest = buildManifestWithPages(10);
    const sharedUrls = manifest.pages.slice(0, 3).map((p) => p.url);
    const findings = [
      buildFinding({ findingId: 'f001', pageUrls: sharedUrls }),
      buildFinding({ findingId: 'f002', pageUrls: sharedUrls, dedupeKey: 'd2' }),
      buildFinding({ findingId: 'f003', pageUrls: sharedUrls, dedupeKey: 'd3' }),
    ];

    const html = renderFindingsAppendix(getStrings('fr'), 12, 'fr', findings, manifest, 'general');

    // f001 (the first in id order) prints the real list.
    expect(html).toContain(`Pages : ${sharedUrls.join(', ')}`);
    // f002 and f003 reference f001 instead of repeating it.
    const referenceCount = html.split('Mêmes pages que f001').length - 1;
    expect(referenceCount).toBe(2);
    // Scoped to the url-cell rows (each finding's own "Pages : ..." line),
    // not the whole document - the separate "Pages analysées (N)" crawled-
    // pages block above the appendix legitimately lists every page URL
    // too, and sharedUrls is a subset of that longer joined string.
    const urlCellLines = html
      .split('\n')
      .filter((line) => line.includes('class="url-cell"') && line.includes('Pages :'));
    const linesWithFullList = urlCellLines.filter((line) => line.includes(sharedUrls.join(', ')));
    expect(linesWithFullList.length).toBe(1);
  });

  it("keeps every finding's own page count in the compact numeric column, even when its URL list is deduped away", () => {
    const manifest = buildManifestWithPages(10);
    const sharedUrls = manifest.pages.slice(0, 3).map((p) => p.url);
    const findings = [
      buildFinding({ findingId: 'f001', pageUrls: sharedUrls, occurrences: 3 }),
      buildFinding({ findingId: 'f002', pageUrls: sharedUrls, occurrences: 5, dedupeKey: 'd2' }),
    ];

    const html = renderFindingsAppendix(getStrings('fr'), 12, 'fr', findings, manifest, 'general');
    // Both rows still show their own real occurrence count.
    expect(html).toContain('>3</td>');
    expect(html).toContain('>5</td>');
  });

  it('does not dedupe across different rule groups, only within the same one', () => {
    const manifest = buildManifestWithPages(10);
    const sharedUrls = manifest.pages.slice(0, 3).map((p) => p.url);
    const findings = [
      buildFinding({ findingId: 'f001', ruleId: 'image-alt', pageUrls: sharedUrls }),
      buildFinding({
        findingId: 'f002',
        ruleId: 'link-name',
        category: 'accessibility',
        pageUrls: sharedUrls,
        dedupeKey: 'd2',
      }),
    ];

    const html = renderFindingsAppendix(getStrings('fr'), 12, 'fr', findings, manifest, 'general');
    expect(html).not.toContain('Mêmes pages que f001');
    const urlCellLines = html
      .split('\n')
      .filter((line) => line.includes('class="url-cell"') && line.includes('Pages :'));
    const linesWithFullList = urlCellLines.filter((line) => line.includes(sharedUrls.join(', ')));
    expect(linesWithFullList.length).toBe(2);
  });

  it('never dedupes a single-page finding, since there is nothing to save', () => {
    const manifest = buildManifestWithPages(10);
    const onePage = [manifest.pages[0]!.url];
    const findings = [
      buildFinding({ findingId: 'f001', pageUrls: onePage }),
      buildFinding({ findingId: 'f002', pageUrls: onePage, dedupeKey: 'd2' }),
    ];

    const html = renderFindingsAppendix(getStrings('fr'), 12, 'fr', findings, manifest, 'general');
    expect(html).not.toContain('Mêmes pages que f001');
    expect(html.split(`Pages : ${onePage[0]}`).length - 1).toBe(2);
  });
});

// item 29: the client had no way to verify the crawl scope they paid for
// beyond a bare count on the cover.
describe('item 29: the list of crawled URLs is printed', () => {
  it('lists every visited page URL from the real small-site.test manifest', async () => {
    const findings = await loadSmallSiteFindings();
    const manifest = await loadSmallSiteManifest();
    const html = renderFindingsAppendix(getStrings('fr'), 12, 'fr', findings, manifest, 'general');

    const visitedUrls = manifest.pages.filter((p) => p.status === 'visited').map((p) => p.url);
    expect(visitedUrls.length).toBeGreaterThan(0);
    for (const url of visitedUrls) {
      expect(html).toContain(url);
    }
  });
});

// item 40: the GEO citation (Phocuswright, 56%) visually outweighed the
// single minor finding it was attached to - it rendered right under the
// section heading, ahead of every finding row, reading as a headline stat
// rather than context for one finding.
describe('item 40: the GEO citation renders after the finding rows, not as a section lead-in', () => {
  it('the geo finding row appears before the citation note in the rendered HTML', () => {
    const geoFinding: Finding = {
      findingId: 'f001',
      auditId: 'a',
      schemaVersion: 1,
      source: 'custom',
      ruleId: 'entity-data-incomplete',
      category: 'geo',
      severity: 'minor',
      wcagCriteria: [],
      title: 'Incomplete entity data',
      description: 'desc',
      pageUrls: ['https://example.com/'],
      occurrences: 1,
      elements: [],
      rawEvidence: {},
      dedupeKey: 'k',
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    };

    const html = renderFindingsAppendix(
      getStrings('fr'),
      12,
      'fr',
      [geoFinding],
      buildManifest(),
      'general',
    );

    const findingIndex = html.indexOf('entity-data-incomplete');
    const citationIndex = html.indexOf('Repère chiffré');
    expect(findingIndex).toBeGreaterThan(-1);
    expect(citationIndex).toBeGreaterThan(-1);
    expect(findingIndex).toBeLessThan(citationIndex);
  });
});

// item 26: the appendix used to gate minor-finding detail behind
// "available on request in the technical export," a mechanism that never
// existed anywhere in the codebase, inside a section titled "complete
// list of findings" for the single paid tier this product now has.
describe('item 26: minor findings get the same full page/selector detail as every other severity', () => {
  it('never renders the old "on request" gating copy', async () => {
    const findings = await loadSmallSiteFindings();
    const manifest = await loadSmallSiteManifest();
    const html = renderFindingsAppendix(getStrings('fr'), 12, 'fr', findings, manifest, 'general');
    expect(html).not.toContain('disponible sur demande');
  });

  it('a minor finding renders its own findingId and page URLs, not a condensed per-rule summary', async () => {
    const findings = await loadSmallSiteFindings();
    const manifest = await loadSmallSiteManifest();
    const minorFinding = findings.find((f) => f.severity === 'minor');
    expect(minorFinding).toBeDefined();

    const html = renderFindingsAppendix(getStrings('fr'), 12, 'fr', findings, manifest, 'general');
    expect(html).toContain(minorFinding!.findingId);
    expect(html).toContain(minorFinding!.pageUrls[0]!);
  });
});

// item 2.6 (Large Rule Families pass): a shadow-piercing selector
// (iframe >>> iframe >>> .captcha__header__logo) wrapped across 3 lines
// and visually dominated its row. A line-clamp/ellipsis truncation was
// tried first and reverted - it removed the clamped text from the PDF's
// own text layer, breaking pdf-text-integrity.test.ts's item 0.4
// invariant that the PDF text layer never drops characters. Renders at a
// smaller font size instead: full text always present, never truncated.
describe('item 2.6: a long selector renders smaller instead of being truncated', () => {
  function buildFinding(
    overrides: Partial<Finding> & Pick<Finding, 'findingId' | 'ruleId' | 'category' | 'severity'>,
  ): Finding {
    const pageUrl = 'https://example.com/';
    return {
      auditId: 'a1',
      schemaVersion: 1,
      source: 'axe',
      wcagCriteria: [],
      title: 't',
      description: 'd',
      pageUrls: [pageUrl],
      occurrences: 1,
      elements: [{ pageUrl, selector: '.default', snippet: '' }],
      rawEvidence: {},
      dedupeKey: `dk-${overrides.findingId}`,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      ...overrides,
    };
  }

  it('renders a long shadow-piercing selector at a smaller font size, in full, never truncated', async () => {
    const manifest = buildManifest();
    const longSelector =
      'iframe >>> iframe >>> .captcha__header__logo.some-long-descendant-chain-class-name';
    const finding = buildFinding({
      findingId: 'f001',
      ruleId: 'color-contrast',
      category: 'accessibility',
      severity: 'serious',
      elements: [{ pageUrl: 'https://example.com/', selector: longSelector, snippet: '' }],
    });

    const html = renderFindingsAppendix(getStrings('fr'), 12, 'fr', [finding], manifest, 'general');

    // escapeHtml turns ">" into "&gt;" - the selector's own ">>>"
    // combinators are still fully present, just HTML-escaped.
    expect(html).toContain(
      'iframe &gt;&gt;&gt; iframe &gt;&gt;&gt; .captcha__header__logo.some-long-descendant-chain-class-name',
    );
    expect(html).toContain('font-size:10px');
    expect(html).not.toContain('-webkit-line-clamp');
  });

  it('renders a short selector at the normal font size', async () => {
    const manifest = buildManifest();
    const finding = buildFinding({
      findingId: 'f002',
      ruleId: 'color-contrast',
      category: 'accessibility',
      severity: 'serious',
      elements: [{ pageUrl: 'https://example.com/', selector: '.short', snippet: '' }],
    });

    const html = renderFindingsAppendix(getStrings('fr'), 12, 'fr', [finding], manifest, 'general');

    expect(html).toContain('.short');
    expect(html).toContain('font-size:12.5px');
  });
});

// report-feedback-large-rule-families.md item 1.4: a real report presented
// findings on Popup Maker, Gravity Forms, a preview widget, and a
// booking engine's own nested-iframe captcha as if they were the
// client's own defects. The client's agency cannot edit any of that
// code, and treating it identically to a first-party defect invites the
// objection that the whole report doesn't understand how the site is
// built.
describe('item 1.4: third-party embed findings render in their own attributed block', () => {
  function buildFinding(
    overrides: Partial<Finding> & Pick<Finding, 'findingId' | 'ruleId' | 'category' | 'severity'>,
  ): Finding {
    const pageUrl = 'https://example.com/';
    return {
      auditId: 'a1',
      schemaVersion: 1,
      source: 'axe',
      wcagCriteria: [],
      title: 't',
      description: 'd',
      pageUrls: [pageUrl],
      occurrences: 1,
      elements: [{ pageUrl, selector: '.default', snippet: '' }],
      rawEvidence: {},
      dedupeKey: `dk-${overrides.findingId}`,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      ...overrides,
    };
  }

  it('groups a Popup Maker / Gravity Forms finding under the third-party heading, named by vendor, not under its own category', async () => {
    const manifest = buildManifest();
    const popupFinding = buildFinding({
      findingId: 'f001',
      ruleId: 'nested-interactive',
      category: 'accessibility',
      severity: 'serious',
      elements: [
        {
          pageUrl: 'https://example.com/',
          selector: '#popmake-1398 > .pum-content.popmake-content > iframe',
          snippet: '',
        },
      ],
    });

    const html = renderFindingsAppendix(
      getStrings('fr'),
      12,
      'fr',
      [popupFinding],
      manifest,
      'general',
    );

    expect(html).toContain('À traiter avec vos prestataires tiers');
    expect(html).toContain('Popup Maker');
    expect(html).toContain('id="annexref-f001"');
  });

  it('attributes a nested-iframe (shadow-piercing selector) finding to the unidentified-vendor label when no known prefix matches', async () => {
    const manifest = buildManifest();
    const iframeFinding = buildFinding({
      findingId: 'f002',
      ruleId: 'color-contrast',
      category: 'accessibility',
      severity: 'moderate',
      elements: [
        {
          pageUrl: 'https://example.com/',
          selector: '.bloc-resa[align="center"] > iframe >>> iframe >>> .captcha__header__logo',
          snippet: '',
        },
      ],
    });

    const html = renderFindingsAppendix(
      getStrings('fr'),
      12,
      'fr',
      [iframeFinding],
      manifest,
      'general',
    );

    expect(html).toContain('À traiter avec vos prestataires tiers');
    // P2.6 (2026-08-21 Large Rule Families feedback pass): "Prestataire tiers non
    // identifié" read as the tool not knowing something, reframed as a
    // finding about the component itself.
    expect(html).toContain('Composant tiers, éditeur non identifié');
  });

  it('does not put an ordinary first-party finding in the third-party block', async () => {
    const manifest = buildManifest();
    const ordinaryFinding = buildFinding({
      findingId: 'f003',
      ruleId: 'image-alt',
      category: 'accessibility',
      severity: 'critical',
    });

    const html = renderFindingsAppendix(
      getStrings('fr'),
      12,
      'fr',
      [ordinaryFinding],
      manifest,
      'general',
    );

    expect(html).not.toContain('À traiter avec vos prestataires tiers');
    expect(html).toContain('id="annexref-f003"');
  });

  it('still counts every third-party finding toward the annex row total (item 0.7 invariant, unaffected)', async () => {
    const manifest = buildManifest();
    const findings = [
      buildFinding({
        findingId: 'f001',
        ruleId: 'nested-interactive',
        category: 'accessibility',
        severity: 'serious',
        elements: [
          { pageUrl: 'https://example.com/', selector: '#gform_submit_button_1', snippet: '' },
        ],
      }),
      buildFinding({
        findingId: 'f003',
        ruleId: 'image-alt',
        category: 'accessibility',
        severity: 'critical',
      }),
    ];

    const html = renderFindingsAppendix(getStrings('fr'), 12, 'fr', findings, manifest, 'general');

    expect((html.match(/id="annexref-/g) ?? []).length).toBe(2);
  });

  it('fix #6 (2026-08-25 report review): a first-party rule group with a same-rule third-party occurrence gets a pointer to the third-party section', async () => {
    const manifest = buildManifest();
    const findings = [
      buildFinding({
        findingId: 'f001',
        ruleId: 'color-contrast',
        category: 'accessibility',
        severity: 'moderate',
        elements: [{ pageUrl: 'https://example.com/', selector: 'footer p', snippet: '' }],
      }),
      buildFinding({
        findingId: 'f002',
        ruleId: 'color-contrast',
        category: 'accessibility',
        severity: 'moderate',
        elements: [
          { pageUrl: 'https://example.com/', selector: '#gform_submit_button_1', snippet: '' },
        ],
      }),
    ];

    const html = renderFindingsAppendix(getStrings('fr'), 12, 'fr', findings, manifest, 'general');

    expect(html).toContain('id="annexref-f001"');
    expect(html).toContain('occurrences de cette règle concernent un composant tiers');
  });

  it('fix #6: renders no pointer when a rule has no matching third-party occurrence', async () => {
    const manifest = buildManifest();
    const ordinaryFinding = buildFinding({
      findingId: 'f003',
      ruleId: 'image-alt',
      category: 'accessibility',
      severity: 'critical',
    });

    const html = renderFindingsAppendix(
      getStrings('fr'),
      12,
      'fr',
      [ordinaryFinding],
      manifest,
      'general',
    );

    expect(html).not.toContain('occurrences de cette règle concernent un composant tiers');
  });
});

describe('fix #4 (2026-08-25 report review): credential-looking query params are stripped from appendix resource URLs', () => {
  function lcpResourceFinding(): Finding {
    const pageUrl = 'https://example.com/';
    return {
      auditId: 'a1',
      schemaVersion: 1,
      source: 'lighthouse',
      ruleId: 'uses-optimized-images',
      category: 'performance',
      severity: 'moderate',
      wcagCriteria: [],
      title: 't',
      description: 'd',
      pageUrls: [pageUrl],
      occurrences: 1,
      findingId: 'f084',
      elements: [],
      rawEvidence: {
        resourceUrls: [
          'https://maps.googleapis.com/maps/api/staticmap?center=1,1&key=SECRET123&token=abc&size=640x400',
        ],
      },
      dedupeKey: 'dk-f084',
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    };
  }

  it('drops key and token params but keeps the rest of the query string', async () => {
    const manifest = buildManifest();
    const html = renderFindingsAppendix(
      getStrings('fr'),
      12,
      'fr',
      [lcpResourceFinding()],
      manifest,
      'general',
    );

    expect(html).not.toContain('SECRET123');
    expect(html).not.toContain('token=abc');
    expect(html).toContain('center=1');
    expect(html).toContain('size=640x400');
  });
});

/** 2026-08-25 Lagnonu review, D11. Trade-off 30 added the collapsed
 *  resource row's file-count column and its "et N autres" tail, but not a
 *  singular form for either. A real report printed "1 fichiers concernes"
 *  twice, and "et 1 autres" - both simply wrong in French, on a row whose
 *  whole purpose is to look authoritative to a developer. */
describe('D11: file counts and overflow tails agree in number', () => {
  function resourceFinding(resourceUrls: readonly string[]): Finding {
    return {
      findingId: 'f001',
      auditId: 'a',
      schemaVersion: 1,
      source: 'lighthouse',
      ruleId: 'modern-image-formats',
      category: 'performance',
      severity: 'minor',
      wcagCriteria: [],
      title: 'Serve images in modern formats',
      description: 'desc',
      pageUrls: ['https://example.com/'],
      occurrences: resourceUrls.length,
      elements: [],
      rawEvidence: { resourceUrls: [...resourceUrls] },
      dedupeKey: 'k',
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    };
  }

  it('uses the singular for exactly one affected file', () => {
    const html = renderFindingsAppendix(
      getStrings('fr'),
      12,
      'fr',
      [resourceFinding(['https://example.com/img/logo.png'])],
      buildManifest(),
      'general',
    );

    expect(html).toContain('1 fichier concerné');
    expect(html).not.toContain('1 fichiers concernés');
  });

  it('uses the plural for more than one', () => {
    const html = renderFindingsAppendix(
      getStrings('fr'),
      12,
      'fr',
      [resourceFinding(['https://example.com/a.png', 'https://example.com/b.png'])],
      buildManifest(),
      'general',
    );

    expect(html).toContain('2 fichiers concernés');
  });

  it('does the same in English', () => {
    const html = renderFindingsAppendix(
      getStrings('en'),
      12,
      'en',
      [resourceFinding(['https://example.com/img/logo.png'])],
      buildManifest(),
      'general',
    );

    expect(html).toContain('1 file affected');
    expect(html).not.toContain('1 files affected');
  });

  /** Guards the whole family rather than the one row that was reported:
   *  the "and N more" tail is shared by the annex, the themes section and
   *  the checklist, and every one of them could print "et 1 autres". */
  it('never prints a plural overflow tail for a remainder of one', async () => {
    const findings = await loadSmallSiteFindings();
    const manifest = await loadSmallSiteManifest();
    const html = renderFindingsAppendix(getStrings('fr'), 12, 'fr', findings, manifest, 'general');

    expect(html).not.toContain('et 1 autres');
  });
});
