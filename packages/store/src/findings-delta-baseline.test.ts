import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildLegacyFindingsDeltaCoverage, type FindingsDeltaCoverage } from '@odysseus/core';
import { findAuditEvidenceCoverage, findDeltaBaseline } from './findings-delta-baseline.js';
import { probeMongoAvailability } from './test-support.js';

const { available, connection } = await probeMongoAvailability();
const siteUrl = 'https://delta-baseline.example/';
const otherSiteUrl = 'https://delta-other.example/';

afterAll(async () => {
  if (!connection) return;
  await clear();
  await connection.close();
});

async function clear(): Promise<void> {
  const db = connection!.db!;
  const auditIds = (
    await db
      .collection('audits')
      .find({ siteUrl: { $in: [siteUrl, otherSiteUrl] } })
      .toArray()
  ).map((audit) => audit['auditId']);
  await db.collection('audits').deleteMany({ auditId: { $in: auditIds } });
  await db.collection('findings').deleteMany({ auditId: { $in: auditIds } });
  await db.collection('reportApprovals').deleteMany({ auditId: { $in: auditIds } });
}

/** Raw driver inserts: the lookup reads a handful of fields, and a fully
 *  valid manifest fixture would only duplicate persist-audit.test.ts. */
async function audit(
  auditId: string,
  startedAt: string,
  options: { approved?: boolean; stamped?: boolean; site?: string; kind?: string } = {},
): Promise<void> {
  const db = connection!.db!;
  await db.collection('audits').insertOne({
    auditId,
    kind: options.kind ?? 'audit',
    siteUrl: options.site ?? siteUrl,
    startedAt: new Date(startedAt),
    finishedAt: new Date(startedAt),
    tool: { odysseusVersion: '1.0.0', axeCoreVersion: '4.10.0' },
    config: { maxPages: 100, maxDepth: 5, crawlDelayMs: 1000 },
    ...(options.stamped === false
      ? {}
      : {
          findingsProvenance: {
            findingsSchemaVersion: 1,
            normalizationFingerprint: 'abc',
            findingsDigest: `sha256:${auditId}`,
          },
        }),
  } as never);
  await db.collection('findings').insertOne({
    auditId,
    findingId: 'f001',
    ruleId: 'image-alt',
    category: 'accessibility',
    severity: 'serious',
    title: 'Images must have alternative text',
    pageUrls: [siteUrl],
    dedupeKey: `key-${auditId}`,
    rawEvidence: { large: true },
  } as never);
  if (options.approved ?? true) {
    await db
      .collection('reportApprovals')
      .insertOne({ approvalId: `approval-${auditId}`, auditId, approvedAt: new Date() } as never);
  }
}

describe.skipIf(!available)('findDeltaBaseline', () => {
  beforeEach(clear);

  it('picks the most recent earlier approved and stamped audit of the same site', async () => {
    await audit('delta-old', '2026-06-01T00:00:00.000Z');
    await audit('delta-delivered', '2026-07-01T00:00:00.000Z');
    await audit('delta-undelivered', '2026-07-15T00:00:00.000Z', { approved: false });
    await audit('delta-unstamped', '2026-07-20T00:00:00.000Z', { stamped: false });
    await audit('delta-render-diff', '2026-07-25T00:00:00.000Z', { kind: 'render-diff' });
    await audit('delta-other-site', '2026-07-28T00:00:00.000Z', { site: otherSiteUrl });
    await audit('delta-current', '2026-08-01T00:00:00.000Z');
    await audit('delta-later', '2026-09-01T00:00:00.000Z');

    const baseline = await findDeltaBaseline(connection!, {
      siteUrl,
      startedAt: new Date('2026-08-01T00:00:00.000Z'),
    });

    expect(baseline).toEqual({
      auditId: 'delta-delivered',
      siteUrl,
      startedAt: '2026-07-01T00:00:00.000Z',
      tool: { odysseusVersion: '1.0.0', axeCoreVersion: '4.10.0' },
      config: { maxPages: 100, maxDepth: 5 },
      findingsProvenance: {
        findingsSchemaVersion: 1,
        normalizationFingerprint: 'abc',
        findingsDigest: 'sha256:delta-delivered',
      },
      findings: [
        {
          findingId: 'f001',
          ruleId: 'image-alt',
          category: 'accessibility',
          severity: 'serious',
          title: 'Images must have alternative text',
          pageUrls: [siteUrl],
          dedupeKey: 'key-delta-delivered',
        },
      ],
      /* An audit whose record carries no coverage signature is pre-059:
       * the baseline claims only the surfaces it is known to have scanned. */
      coverage: buildLegacyFindingsDeltaCoverage(),
    });
  });

  it('carries a stored coverage signature and degrades an unknown version to legacy', async () => {
    const stored: FindingsDeltaCoverage = {
      version: 'findings-delta-coverage-v1',
      scopeSignature: 'scope-1',
      inventorySignature: 'inventory-1',
      capabilityRegistryVersion: 'cap-v1',
      checks: [
        {
          checkId: 'axe',
          version: '1',
          surfaces: ['baseline-desktop'],
          frameCapability: 'document-only',
          semanticallyConditional: false,
        },
      ],
      surfaces: ['baseline-desktop'],
      observations: { 'key-delta-delivered': { checkId: 'axe', surfaceId: 'baseline-desktop' } },
    };
    const db = connection!.db!;
    await db.collection('audits').insertOne({
      auditId: 'delta-canonical',
      kind: 'audit',
      siteUrl,
      startedAt: new Date('2026-07-15T00:00:00.000Z'),
      finishedAt: new Date('2026-07-01T00:05:00.000Z'),
      tool: { odysseusVersion: '1.0.0', axeCoreVersion: '4.10.0' },
      config: { maxPages: 100, maxDepth: 5, crawlDelayMs: 1000 },
      findingsProvenance: {
        findingsSchemaVersion: 1,
        normalizationFingerprint: 'abc',
        findingsDigest: 'sha256:delta-canonical',
      },
      evidenceCoverage: stored,
    } as never);
    await db.collection('audits').insertOne({
      auditId: 'delta-future-coverage',
      kind: 'audit',
      siteUrl,
      startedAt: new Date('2026-07-01T00:00:00.000Z'),
      finishedAt: new Date('2026-07-10T00:05:00.000Z'),
      tool: { odysseusVersion: '9.0.0', axeCoreVersion: '4.10.0' },
      config: { maxPages: 100, maxDepth: 5, crawlDelayMs: 1000 },
      findingsProvenance: {
        findingsSchemaVersion: 1,
        normalizationFingerprint: 'abc',
        findingsDigest: 'sha256:delta-future-coverage',
      },
      evidenceCoverage: { ...stored, version: 'findings-delta-coverage-v999' },
    } as never);
    for (const auditId of ['delta-canonical', 'delta-future-coverage']) {
      await db.collection('reportApprovals').insertOne({
        approvalId: `approval-${auditId}`,
        auditId,
        approvedAt: new Date(),
      } as never);
    }

    const current = { siteUrl, startedAt: new Date('2026-08-01T00:00:00.000Z') };
    expect((await findDeltaBaseline(connection!, current))?.coverage).toEqual(stored);

    await db.collection('audits').deleteOne({ auditId: 'delta-canonical' });
    expect((await findDeltaBaseline(connection!, current))?.coverage).toEqual(
      buildLegacyFindingsDeltaCoverage(),
    );
    /* The current run's own lookup refuses an unusable signature entirely
     * rather than degrading it silently: the caller passes no coverage and
     * the delta degrades as a whole. */
    expect(await findAuditEvidenceCoverage(connection!, 'delta-future-coverage')).toBeUndefined();
    expect(await findAuditEvidenceCoverage(connection!, 'delta-canonical')).toBeUndefined();
    expect(await findAuditEvidenceCoverage(connection!, 'missing')).toBeUndefined();
  });

  it('returns null when no earlier audit was delivered', async () => {
    await audit('delta-undelivered', '2026-07-15T00:00:00.000Z', { approved: false });
    await audit('delta-current', '2026-08-01T00:00:00.000Z');
    expect(
      await findDeltaBaseline(connection!, {
        siteUrl,
        startedAt: new Date('2026-08-01T00:00:00.000Z'),
      }),
    ).toBeNull();
  });
});
