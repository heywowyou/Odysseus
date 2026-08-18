import { describe, expect, it } from 'vitest';
import type { AuditManifest, Finding } from '@odysseus/core';
import { selectReferenceStats } from '@odysseus/core';
import { renderFindingsAppendix } from './findings-appendix.js';
import { getStrings } from '../strings/i18n.js';
import { loadSasFernandeFindings, loadSasFernandeManifest } from '../../test-fixtures.js';

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

describe('renderFindingsAppendix against the real sas-fernande.fr findings', () => {
  it('includes minor findings, which never reach the LLM layer', async () => {
    const findings = await loadSasFernandeFindings();
    const manifest = await loadSasFernandeManifest();
    expect(findings.some((f) => f.severity === 'minor')).toBe(true);

    const html = renderFindingsAppendix(getStrings('en'), 12, 'en', findings, manifest, 'general');
    const minorFinding = findings.find((f) => f.severity === 'minor');
    expect(html).toContain(minorFinding?.ruleId ?? '__missing__');
  });

  it('groups findings under their category heading', async () => {
    const findings = await loadSasFernandeFindings();
    const manifest = await loadSasFernandeManifest();
    const html = renderFindingsAppendix(getStrings('en'), 12, 'en', findings, manifest, 'general');

    expect(html).toContain('Accessibility');
    expect(html).toContain('Performance');
  });

  it('tags a rule group as diverted only when every one of its findings is confined to diverted pages', async () => {
    const findings = await loadSasFernandeFindings();
    const manifest = await loadSasFernandeManifest();
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

    const withoutDedupe = renderFindingsAppendix(getStrings('fr'), 12, 'fr', [geoFinding], buildManifest(), 'general');
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

    const html = renderFindingsAppendix(getStrings('en'), 12, 'en', findings, buildManifest(), 'general');
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

    const html = renderFindingsAppendix(getStrings('en'), 12, 'en', findings, buildManifest(), 'general');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

// item 38 [REGRESSION]: rule titles and codes rendered in English inside
// a French report.
describe('item 38: rule titles and codes render in French with a gloss', () => {
  it('renders the French translation, not the English title, for a known rule', async () => {
    const findings = await loadSasFernandeFindings();
    const manifest = await loadSasFernandeManifest();
    const html = renderFindingsAppendix(getStrings('fr'), 12, 'fr', findings, manifest, 'general');

    expect(html).toContain('Le contraste des couleurs est insuffisant');
    expect(html).not.toContain('Elements must meet minimum color contrast ratio thresholds');
  });

  it('renders a plain-language gloss under the machine rule code', async () => {
    const findings = await loadSasFernandeFindings();
    const manifest = await loadSasFernandeManifest();
    const html = renderFindingsAppendix(getStrings('fr'), 12, 'fr', findings, manifest, 'general');

    expect(html).toContain('color-contrast');
    expect(html).toContain('en dessous du seuil minimal requis');
  });

  it('leaves the English title untranslated for an English report', async () => {
    const findings = await loadSasFernandeFindings();
    const manifest = await loadSasFernandeManifest();
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

    const html = renderFindingsAppendix(getStrings('en'), 12, 'en', findings, buildManifest(), 'general');
    expect(html).toContain('https://example.com/a');
    expect(html).toContain('https://example.com/b');
    expect(html).toContain('https://example.com/c');
  });
});

// item 29: the client had no way to verify the crawl scope they paid for
// beyond a bare count on the cover.
describe('item 29: the list of crawled URLs is printed', () => {
  it('lists every visited page URL from the real sas-fernande.fr manifest', async () => {
    const findings = await loadSasFernandeFindings();
    const manifest = await loadSasFernandeManifest();
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

    const html = renderFindingsAppendix(getStrings('fr'), 12, 'fr', [geoFinding], buildManifest(), 'general');

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
    const findings = await loadSasFernandeFindings();
    const manifest = await loadSasFernandeManifest();
    const html = renderFindingsAppendix(getStrings('fr'), 12, 'fr', findings, manifest, 'general');
    expect(html).not.toContain('disponible sur demande');
  });

  it('a minor finding renders its own findingId and page URLs, not a condensed per-rule summary', async () => {
    const findings = await loadSasFernandeFindings();
    const manifest = await loadSasFernandeManifest();
    const minorFinding = findings.find((f) => f.severity === 'minor');
    expect(minorFinding).toBeDefined();

    const html = renderFindingsAppendix(getStrings('fr'), 12, 'fr', findings, manifest, 'general');
    expect(html).toContain(minorFinding!.findingId);
    expect(html).toContain(minorFinding!.pageUrls[0]!);
  });
});
