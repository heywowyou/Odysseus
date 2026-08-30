import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { FINDINGS_SCHEMA_VERSION, type AuditManifest, type Finding } from '@odysseus/core';
import { persistAudit } from './persist-audit.js';
import {
  getAudit,
  getAuditManualFields,
  getFindingsForAudit,
  prefillAuditManualFields,
  setAuditManualFields,
} from './audits.js';
import { createAuditModel } from './schemas/audit.schema.js';
import { createFindingModel } from './schemas/finding.schema.js';
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
  // These tests write fixed audit ids and assert on first-write behaviour, so
  // documents surviving a previous run make prefill find its field already set
  // and return nothing. Left uncleaned, the file passes once on a fresh
  // database and is red on every run after, which reads as a code regression.
  // Scoped to this file's own `audits-` id prefix rather than emptying the
  // collections, because other store test files share the database.
  const OWN_IDS = /^audits-/;

  beforeEach(async () => {
    if (!connection) return;
    await createAuditModel(connection).deleteMany({ auditId: OWN_IDS });
    await createFindingModel(connection).deleteMany({ auditId: OWN_IDS });
  });

  it('getAudit returns the stored audit, and null for an unknown auditId', async () => {
    await persistAudit(connection!, buildManifest('audits-read-1'), []);

    const found = await getAudit(connection!, 'audits-read-1');
    expect(found?.auditId).toBe('audits-read-1');

    const missing = await getAudit(connection!, 'audits-read-missing');
    expect(missing).toBeNull();
  });

  it('getFindingsForAudit returns every finding for that audit', async () => {
    const manifest = buildManifest('audits-read-2');
    const findings = [
      buildFinding('audits-read-2', 'ar2-a'),
      buildFinding('audits-read-2', 'ar2-b'),
    ];
    await persistAudit(connection!, manifest, findings);

    const found = await getFindingsForAudit(connection!, 'audits-read-2');
    expect(found).toHaveLength(2);
    expect(found.map((f) => f.dedupeKey).sort()).toEqual(['ar2-a', 'ar2-b']);
  });

  it('getAuditManualFields returns undefined before any field is saved', async () => {
    await persistAudit(connection!, buildManifest('audits-manual-1'), []);
    expect(await getAuditManualFields(connection!, 'audits-manual-1')).toBeUndefined();
  });

  it('setAuditManualFields merges rather than replaces, and rejects an invalid siren', async () => {
    await persistAudit(connection!, buildManifest('audits-manual-2'), []);

    await setAuditManualFields(connection!, 'audits-manual-2', {
      nomCommercial: { value: 'Acme', provenance: 'operator' },
    });
    const afterFirst = await getAuditManualFields(connection!, 'audits-manual-2');
    expect(afterFirst?.nomCommercial?.value).toBe('Acme');

    await setAuditManualFields(connection!, 'audits-manual-2', {
      recipientName: { value: 'Jane Doe', provenance: 'operator' },
    });
    const afterSecond = await getAuditManualFields(connection!, 'audits-manual-2');
    expect(afterSecond?.nomCommercial?.value).toBe('Acme');
    expect(afterSecond?.recipientName?.value).toBe('Jane Doe');

    await expect(
      setAuditManualFields(connection!, 'audits-manual-2', {
        siren: { value: '732829321', provenance: 'operator' },
      }),
    ).rejects.toThrow(/valid SIREN/);
  });

  // 2026-08-22, La Corniche report review: unlike setAuditManualFields
  // (always overwrites), prefillAuditManualFields must never clobber a
  // field an operator already entered - the whole reason it exists
  // separately, per its own doc comment in audits.ts.
  it('prefillAuditManualFields fills only absent fields, with provenance "detected", and never overwrites an operator value', async () => {
    await persistAudit(connection!, buildManifest('audits-prefill-1'), []);

    await setAuditManualFields(connection!, 'audits-prefill-1', {
      nomCommercial: { value: 'Operator-typed name', provenance: 'operator' },
    });

    const written = await prefillAuditManualFields(connection!, 'audits-prefill-1', {
      nomCommercial: 'Detected name (should be ignored)',
      raisonSociale: 'DETECTED RAISON SOCIALE',
    });

    expect(written).toEqual({ raisonSociale: 'DETECTED RAISON SOCIALE' });

    const after = await getAuditManualFields(connection!, 'audits-prefill-1');
    expect(after?.nomCommercial?.value).toBe('Operator-typed name');
    expect(after?.nomCommercial?.provenance).toBe('operator');
    expect(after?.raisonSociale?.value).toBe('DETECTED RAISON SOCIALE');
    expect(after?.raisonSociale?.provenance).toBe('detected');
  });

  it('prefillAuditManualFields writes nothing and returns an empty object when every candidate field is already set', async () => {
    await persistAudit(connection!, buildManifest('audits-prefill-2'), []);
    await setAuditManualFields(connection!, 'audits-prefill-2', {
      nomCommercial: { value: 'Already set', provenance: 'operator' },
    });

    const written = await prefillAuditManualFields(connection!, 'audits-prefill-2', {
      nomCommercial: 'Detected name',
    });

    expect(written).toEqual({});
  });
});
