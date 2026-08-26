import { afterAll, describe, expect, it } from 'vitest';
import { FINDINGS_SCHEMA_VERSION, type AuditManifest, type Finding } from '@odysseus/core';
import { persistAudit } from './persist-audit.js';
import { createAuditModel } from './schemas/audit.schema.js';
import { createFindingModel } from './schemas/finding.schema.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) {
    await connection.dropDatabase();
    await connection.close();
  }
});

function buildManifest(overrides: Partial<AuditManifest> = {}): AuditManifest {
  return {
    auditId: 'persist-test',
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
      pageTimeoutMs: 30000,
      lighthouseTimeoutMs: 60000,
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
    ...overrides,
  };
}

function buildFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    findingId: 'f001',
    auditId: 'persist-test',
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
    dedupeKey: 'aaaaaaaaaaaaaaaa',
    firstSeenAt: new Date('2026-08-02T00:00:00.000Z'),
    lastSeenAt: new Date('2026-08-02T00:00:00.000Z'),
    ...overrides,
  };
}

describe.skipIf(!mongoAvailable)('persistAudit', () => {
  it('upserts the audit document and its findings, denormalizing siteUrl', async () => {
    const manifest = buildManifest({ auditId: 'persist-test-1' });
    const finding = buildFinding({ auditId: 'persist-test-1', dedupeKey: 'p1p1p1p1p1p1p1p1' });

    await persistAudit(connection!, manifest, [finding]);

    const AuditModel = createAuditModel(connection!);
    const FindingModel = createFindingModel(connection!);

    const storedAudit = await AuditModel.findOne({ auditId: 'persist-test-1' });
    expect(storedAudit).not.toBeNull();
    expect(storedAudit?.siteUrl).toBe(manifest.siteUrl);
    expect(storedAudit?.startedAt).toBeInstanceOf(Date);

    const storedFindings = await FindingModel.find({ auditId: 'persist-test-1' });
    expect(storedFindings).toHaveLength(1);
    expect(storedFindings[0]?.siteUrl).toBe(manifest.siteUrl);
    expect(storedFindings[0]?.dedupeKey).toBe('p1p1p1p1p1p1p1p1');
  });

  it('is idempotent: persisting the same auditId twice does not duplicate documents', async () => {
    const manifest = buildManifest({ auditId: 'persist-test-2' });
    const finding = buildFinding({ auditId: 'persist-test-2', dedupeKey: 'p2p2p2p2p2p2p2p2' });

    await persistAudit(connection!, manifest, [finding]);
    await persistAudit(connection!, manifest, [finding]);

    const AuditModel = createAuditModel(connection!);
    const FindingModel = createFindingModel(connection!);

    expect(await AuditModel.countDocuments({ auditId: 'persist-test-2' })).toBe(1);
    expect(await FindingModel.countDocuments({ auditId: 'persist-test-2' })).toBe(1);
  });

  it('removes findings that are absent when the same audit is persisted again', async () => {
    const manifest = buildManifest({ auditId: 'persist-test-retry' });
    const retained = buildFinding({
      auditId: 'persist-test-retry',
      dedupeKey: 'retry-retained01',
    });
    const obsolete = buildFinding({
      auditId: 'persist-test-retry',
      findingId: 'f002',
      dedupeKey: 'retry-obsolete01',
    });

    await persistAudit(connection!, manifest, [retained, obsolete]);
    await persistAudit(connection!, manifest, [retained]);

    const FindingModel = createFindingModel(connection!);
    const storedFindings = await FindingModel.find({ auditId: 'persist-test-retry' }).lean();
    expect(storedFindings.map((finding) => finding.dedupeKey)).toEqual(['retry-retained01']);
  });

  it('creates the required indexes', async () => {
    const AuditModel = createAuditModel(connection!);
    const FindingModel = createFindingModel(connection!);
    await AuditModel.ensureIndexes();
    await FindingModel.ensureIndexes();

    const auditIndexKeys = (await AuditModel.collection.indexes()).map((idx) => idx.key);
    const findingIndexKeys = (await FindingModel.collection.indexes()).map((idx) => idx.key);

    expect(auditIndexKeys).toContainEqual({ siteUrl: 1, startedAt: -1 });
    expect(findingIndexKeys).toContainEqual({ auditId: 1 });
    expect(findingIndexKeys).toContainEqual({ siteUrl: 1, dedupeKey: 1 });
    expect(findingIndexKeys).toContainEqual({ auditId: 1, severity: 1 });
  });

  it('removes every stored finding when a retry has zero findings', async () => {
    const manifest = buildManifest({ auditId: 'persist-test-3' });
    const finding = buildFinding({
      auditId: 'persist-test-3',
      dedupeKey: 'zero-retry-key01',
    });

    await persistAudit(connection!, manifest, [finding]);
    await persistAudit(connection!, manifest, []);

    const FindingModel = createFindingModel(connection!);
    expect(await FindingModel.countDocuments({ auditId: 'persist-test-3' })).toBe(0);
  });
});
