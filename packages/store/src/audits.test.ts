import { afterAll, describe, expect, it } from 'vitest';
import { FINDINGS_SCHEMA_VERSION, type AuditManifest, type Finding } from '@odysseus/core';
import { persistAudit } from './persist-audit.js';
import { getAudit, getFindingsForAudit } from './audits.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) await connection.close();
});

function buildManifest(auditId: string): AuditManifest {
  return {
    auditId,
    kind: 'audit',
    siteUrl: 'https://example.com/',
    startedAt: '2026-08-02T00:00:00.000Z',
    finishedAt: '2026-08-02T00:05:00.000Z',
    tool: {
      odysseusVersion: '0.1.0',
      findingsSchemaVersion: FINDINGS_SCHEMA_VERSION,
      axeCoreVersion: '4.12.1',
      lighthouseVersion: '12.8.2',
      playwrightVersion: '1.49.0',
      chromiumVersion: '130.0.0.0',
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
      visitedCount: 1,
      maxPages: 20,
      maxDepth: 5,
      robotsTxtFound: true,
      effectiveDelayMs: 1000,
    },
    pages: [],
  };
}

function buildFinding(auditId: string, dedupeKey: string): Finding {
  return {
    findingId: `f-${dedupeKey}`,
    auditId,
    schemaVersion: FINDINGS_SCHEMA_VERSION,
    source: 'axe',
    ruleId: 'color-contrast',
    category: 'accessibility',
    severity: 'serious',
    wcagCriteria: ['1.4.3'],
    title: 'Color contrast',
    description: 'Insufficient color contrast',
    pageUrls: ['https://example.com/'],
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    dedupeKey,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
  };
}

describe.skipIf(!mongoAvailable)('audits read helpers', () => {
  it('getAudit returns the stored audit, and null for an unknown auditId', async () => {
    await persistAudit(connection!, buildManifest('audits-read-1'), []);

    const found = await getAudit(connection!, 'audits-read-1');
    expect(found?.auditId).toBe('audits-read-1');

    const missing = await getAudit(connection!, 'audits-read-missing');
    expect(missing).toBeNull();
  });

  it('getFindingsForAudit returns every finding for that audit', async () => {
    const manifest = buildManifest('audits-read-2');
    const findings = [buildFinding('audits-read-2', 'ar2-a'), buildFinding('audits-read-2', 'ar2-b')];
    await persistAudit(connection!, manifest, findings);

    const found = await getFindingsForAudit(connection!, 'audits-read-2');
    expect(found).toHaveLength(2);
    expect(found.map((f) => f.dedupeKey).sort()).toEqual(['ar2-a', 'ar2-b']);
  });
});
