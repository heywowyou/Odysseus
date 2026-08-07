import { describe, expect, it } from 'vitest';
import type { AuditManifest, Finding } from '@odysseus/core';
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

    const html = renderFindingsAppendix(getStrings('en'), 'en', findings, manifest);
    const minorFinding = findings.find((f) => f.severity === 'minor');
    expect(html).toContain(minorFinding?.ruleId ?? '__missing__');
  });

  it('groups findings under their category heading', async () => {
    const findings = await loadSasFernandeFindings();
    const manifest = await loadSasFernandeManifest();
    const html = renderFindingsAppendix(getStrings('en'), 'en', findings, manifest);

    expect(html).toContain('Accessibility');
    expect(html).toContain('Performance');
  });

  it('tags a rule group as diverted only when every one of its findings is confined to diverted pages', async () => {
    const findings = await loadSasFernandeFindings();
    const manifest = await loadSasFernandeManifest();
    const html = renderFindingsAppendix(getStrings('fr'), 'fr', findings, manifest);

    // f009 (link-in-text-block) is confined entirely to /mentions-legales/,
    // which matches the legal-page pattern - real diversion, not a
    // contrived fixture. Its single-finding rule-group must be tagged.
    const linkInTextBlockGroup = html.split('mono rule-code">link-in-text-block')[1] ?? '';
    expect(linkInTextBlockGroup.slice(0, 200)).toContain('class="obs-tag"');

    // color-contrast's group mixes f012 (legal-confined) with f010/f011/f015
    // (ordinary pages), so the group as a whole must not be tagged - only
    // a fully-diverted group is.
    const colorContrastGroup = html.split('mono rule-code">color-contrast')[1] ?? '';
    expect(colorContrastGroup.slice(0, 200)).not.toContain('class="obs-tag"');
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

    const html = renderFindingsAppendix(getStrings('en'), 'en', findings, buildManifest());
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

    const html = renderFindingsAppendix(getStrings('en'), 'en', findings, buildManifest());
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
