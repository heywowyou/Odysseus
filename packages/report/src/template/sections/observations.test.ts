import { describe, expect, it } from 'vitest';
import { renderObservations } from './observations.js';
import { getStrings } from '../strings/i18n.js';
import { loadSasFernandeFindings, loadSasFernandeManifest } from '../../test-fixtures.js';

describe('renderObservations against the real sas-fernande.fr scan', () => {
  it('renders the legal-page box for f009 (link-in-text-block, confined to /mentions-legales/), with no wrapper box', async () => {
    const findings = await loadSasFernandeFindings();
    const manifest = await loadSasFernandeManifest();

    const html = renderObservations(getStrings('fr'), findings, manifest);

    expect(html).toContain('Pages légales exclues de l&#39;indexation');
    // All 5 findings confined entirely to /mentions-legales/.
    expect(html).toContain('f009, f012, f027, f042, f060');
    // sas-fernande has no wrapper pages (render diff 0% everywhere).
    expect(html).not.toContain('Pages d&#39;intégration');
  });

  it('returns empty when nothing is diverted', () => {
    const html = renderObservations(getStrings('fr'), [], {
      auditId: 'a',
      kind: 'audit',
      siteUrl: 'https://example.com/',
      startedAt: '2026-08-02T00:00:00.000Z',
      finishedAt: '2026-08-02T00:05:00.000Z',
      tool: {
        odysseusVersion: '0.1.0',
        findingsSchemaVersion: 1,
        axeCoreVersion: null,
        lighthouseVersion: null,
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
      },
      crawl: {
        startUrl: 'https://example.com/',
        visitedCount: 0,
        maxPages: 20,
        maxDepth: 5,
        robotsTxtFound: true,
        effectiveDelayMs: 1000,
      },
      pages: [],
    });

    expect(html).toBe('');
  });
});
