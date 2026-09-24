/**
 * Plan 077: the retention executor against real Mongo, a temporary
 * artifacts root and an in-memory bucket. Docker-gated like every store
 * integration suite.
 */

import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildArtifactBucketKey, buildAuditDir } from '@odysseus/scanner';
import { getLatestRetentionRun } from '@odysseus/store';
import { probeMongoAvailability, scopedMongoTestUri } from '@odysseus/store/test-support.js';
import type { ArtifactStore } from '../artifacts/artifact-store.js';
import { RETENTION_RUN_CAP, runRetention, type RetentionRunOptions } from './apply-retention.js';

const { available, connection } = await probeMongoAvailability(
  scopedMongoTestUri('apply_retention'),
);

afterAll(async () => {
  if (!connection) return;
  await connection.dropDatabase();
  await connection.close();
});

const NOW = new Date('2026-10-01T00:00:00Z');
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const provenance = {
  findingsSchemaVersion: 1,
  normalizationFingerprint: 'fp',
  findingsDigest: 'sha256:abc',
};

interface MemoryStore extends ArtifactStore {
  objects: Map<string, Buffer>;
  deletes: number;
  failDeletes: boolean;
}

function memoryStore(): MemoryStore {
  const store: MemoryStore = {
    objects: new Map(),
    deletes: 0,
    failDeletes: false,
    get: async (key) => store.objects.get(key) ?? null,
    put: async (key, bytes) => {
      store.objects.set(key, bytes);
    },
    list: async (prefix) => [...store.objects.keys()].filter((key) => key.startsWith(prefix)),
    delete: async (key) => {
      if (store.failDeletes) throw new Error('bucket unavailable');
      store.deletes += 1;
      store.objects.delete(key);
    },
  };
  return store;
}

let root: string;
let store: MemoryStore;

beforeEach(async () => {
  if (!available) return;
  await connection!.dropDatabase();
  root = await fs.mkdtemp(path.join(tmpdir(), 'apply-retention-'));
  store = memoryStore();
});
afterEach(async () => {
  if (root !== undefined) await fs.rm(root, { recursive: true, force: true });
});

async function insert(collection: string, docs: Record<string, unknown>[]): Promise<void> {
  await connection!.db!.collection(collection).insertMany(docs as never[]);
}

async function count(collection: string, filter: Record<string, unknown>): Promise<number> {
  return connection!.db!.collection(collection).countDocuments(filter);
}

/** One audit row, plus files on disk and their bucket mirror. */
async function seedAudit(
  auditId: string,
  startedDaysAgo: number,
  files: Record<string, string> = {
    'manifest.json': '{}',
    'pages/home/scan.json': 'x'.repeat(100),
  },
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const startedAt = ago(startedDaysAgo);
  await insert('audits', [
    {
      auditId,
      siteUrl: 'https://hotel.example/',
      kind: 'audit',
      scanIntent: 'full-audit',
      startedAt,
      finishedAt: startedAt,
      findingsProvenance: provenance,
      ...overrides,
    },
  ]);
  await insert('findings', [{ auditId, findingId: `${auditId}-f1` }]);
  const auditDir = buildAuditDir(root, 'hotel.example', startedAt);
  for (const [relativePath, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(auditDir, relativePath)), { recursive: true });
    await fs.writeFile(path.join(auditDir, relativePath), content);
    store.objects.set(
      buildArtifactBucketKey('hotel.example', startedAt, relativePath),
      Buffer.from(content),
    );
  }
  return auditDir;
}

function options(overrides: Partial<RetentionRunOptions> = {}): RetentionRunOptions {
  return {
    connection: connection!,
    artifactsRoot: root,
    store,
    now: NOW,
    apply: true,
    allowLarge: false,
    trigger: 'cli',
    ...overrides,
  };
}

async function exists(target: string): Promise<boolean> {
  return fs.access(target).then(
    () => true,
    () => false,
  );
}

describe.skipIf(!available)('runRetention', () => {
  it('makes no delete call and writes no record on a dry run', async () => {
    const oldDir = await seedAudit('old', 30);
    await seedAudit('new', 20);
    const objectsBefore = store.objects.size;

    const result = await runRetention(options({ apply: false }));

    expect(result.deleteAudits.map((audit) => audit.auditId)).toEqual(['old']);
    expect(result.bytesReclaimed.local).toBeGreaterThan(0);
    expect(store.deletes).toBe(0);
    expect(store.objects.size).toBe(objectsBefore);
    expect(await exists(oldDir)).toBe(true);
    expect(await count('audits', {})).toBe(2);
    expect(await getLatestRetentionRun(connection!)).toBeNull();
  });

  it('deletes a replaced audit from disk, the bucket and Mongo, and records the run', async () => {
    const oldDir = await seedAudit('old', 30);
    const newDir = await seedAudit('new', 20);
    store.objects.set('report-quality/candidates/old/q1/fr-abc.pdf', Buffer.from('pdf'));

    const result = await runRetention(options());

    expect(result.failures).toEqual([]);
    expect(await exists(oldDir)).toBe(false);
    expect(await exists(newDir)).toBe(true);
    expect([...store.objects.keys()].some((key) => key.includes('/old/'))).toBe(false);
    expect([...store.objects.keys()].filter((key) => key.startsWith('hotel.example/')).length).toBe(
      2,
    );
    expect(await count('audits', { auditId: 'old' })).toBe(0);
    expect(await count('findings', { auditId: 'old' })).toBe(0);
    expect(await count('audits', { auditId: 'new' })).toBe(1);
    expect(await getLatestRetentionRun(connection!)).toMatchObject({
      trigger: 'cli',
      counts: { auditsDeleted: 1 },
      remoteObjectsDeleted: 3,
      failures: [],
    });
  });

  it('slims a delivered audit: raw evidence goes, what its report and the delta read stays', async () => {
    const oldDir = await seedAudit('old', 30, {
      'manifest.json': '{}',
      'findings.json': '[]',
      'crawl-state.json': '{}',
      'pages/home/scan.json': 'x',
      'reports/r1-fr.pdf': 'pdf',
    });
    await seedAudit('new', 20);
    await insert('reportApprovals', [{ approvalId: 'ap', auditId: 'old', fr: { reportId: 'r1' } }]);
    await insert('reports', [
      {
        reportId: 'r1',
        auditId: 'old',
        language: 'fr',
        generatedAt: ago(29),
        fileRef: 'reports/r1-fr.pdf',
      },
    ]);

    const result = await runRetention(options());

    expect(result.failures).toEqual([]);
    expect(result.counts).toMatchObject({ auditsSlimmed: 1, auditsDeleted: 0 });
    expect(await exists(path.join(oldDir, 'pages'))).toBe(false);
    expect(await exists(path.join(oldDir, 'crawl-state.json'))).toBe(false);
    for (const kept of ['manifest.json', 'findings.json', 'reports/r1-fr.pdf']) {
      expect(await exists(path.join(oldDir, kept)), kept).toBe(true);
    }
    const oldPrefix = buildArtifactBucketKey('hotel.example', ago(30), '');
    expect([...store.objects.keys()].filter((key) => key.startsWith(oldPrefix)).sort()).toEqual([
      `${oldPrefix}findings.json`,
      `${oldPrefix}manifest.json`,
      `${oldPrefix}reports/r1-fr.pdf`,
    ]);
    const row = await connection!.db!.collection('audits').findOne({ auditId: 'old' });
    expect(row?.['retention']).toEqual({ slimmedAt: expect.any(Date) });
    expect(await count('findings', { auditId: 'old' })).toBe(1);
  });

  it('removes superseded versions inside an audit with their files, keeping what is named', async () => {
    const dir = await seedAudit('only', 60, {
      'manifest.json': '{}',
      'analyses/2026-09-01T00-00-00Z-fr.json': JSON.stringify({ analysisId: 'an-old' }),
      'analyses/2026-09-01T00-00-00Z-fr-critic.json': '{}',
      'analyses/2026-09-20T00-00-00Z-fr.json': JSON.stringify({ analysisId: 'an-new' }),
      'analyses/2026-09-01T00-00-00Z-structure.json': JSON.stringify({
        generatedAt: ago(30).toISOString(),
      }),
      'analyses/2026-09-20T00-00-00Z-structure.json': JSON.stringify({
        generatedAt: ago(11).toISOString(),
      }),
      'reports/old-fr.pdf': 'pdf',
      'reports/old-fr.pdf.provenance.json': '{}',
      'reports/old-fr-clair.pdf': 'pdf',
      'reports/new-fr.pdf': 'pdf',
    });
    await insert('analyses', [
      { analysisId: 'an-old', auditId: 'only', language: 'fr', generatedAt: ago(30) },
      { analysisId: 'an-new', auditId: 'only', language: 'fr', generatedAt: ago(11) },
    ]);
    await insert('reports', [
      {
        reportId: 'old',
        auditId: 'only',
        analysisId: 'an-old',
        language: 'fr',
        generatedAt: ago(30),
        fileRef: 'reports/old-fr.pdf',
        variants: { light: { fileRef: 'reports/old-fr-clair.pdf' } },
      },
      {
        reportId: 'new',
        auditId: 'only',
        analysisId: 'an-new',
        language: 'fr',
        generatedAt: ago(11),
        fileRef: 'reports/new-fr.pdf',
      },
    ]);

    const result = await runRetention(options());

    expect(result.failures).toEqual([]);
    expect(result.counts).toMatchObject({
      reportsDeleted: 1,
      analysesDeleted: 1,
      structureFilesDeleted: 1,
    });
    expect((await fs.readdir(path.join(dir, 'analyses'))).sort()).toEqual([
      '2026-09-20T00-00-00Z-fr.json',
      '2026-09-20T00-00-00Z-structure.json',
    ]);
    expect(await fs.readdir(path.join(dir, 'reports'))).toEqual(['new-fr.pdf']);
    expect(await count('reports', {})).toBe(1);
    expect(await count('analyses', {})).toBe(1);
    const keys = [...store.objects.keys()];
    expect(keys.some((key) => key.includes('old-fr'))).toBe(false);
    expect(keys.some((key) => key.includes('2026-09-01T00-00-00Z'))).toBe(false);
  });

  it('keeps the rows when the bucket fails, and a retry finishes the deletion', async () => {
    await seedAudit('old', 30);
    await seedAudit('new', 20);
    store.failDeletes = true;

    const failed = await runRetention(options());

    expect(failed.failures).toEqual([
      expect.objectContaining({ auditId: 'old', step: 'audit-storage' }),
    ]);
    expect(await count('audits', { auditId: 'old' })).toBe(1);
    expect(await getLatestRetentionRun(connection!)).toMatchObject({
      counts: { auditsDeleted: 0 },
      failures: [{ auditId: 'old', step: 'audit-storage' }],
    });

    store.failDeletes = false;
    const retried = await runRetention(options());

    expect(retried.failures).toEqual([]);
    expect(retried.counts.auditsDeleted).toBe(1);
    expect(await count('audits', { auditId: 'old' })).toBe(0);
  });

  it(`refuses a run that would delete more than ${RETENTION_RUN_CAP} audits unless allowed`, async () => {
    for (let index = 0; index <= RETENTION_RUN_CAP; index += 1) {
      await seedAudit(`old-${index}`, 60 - index, { 'manifest.json': '{}' });
    }
    await seedAudit('new', 20);

    const refused = await runRetention(options());

    expect(refused.refusal).toEqual({
      reason: 'cap-exceeded',
      auditsToDelete: RETENTION_RUN_CAP + 1,
      auditsToSlim: 0,
    });
    expect(store.deletes).toBe(0);
    expect(await count('audits', {})).toBe(RETENTION_RUN_CAP + 2);
    expect(await getLatestRetentionRun(connection!)).toMatchObject({
      refusal: { reason: 'cap-exceeded', auditsToDelete: RETENTION_RUN_CAP + 1 },
    });

    const allowed = await runRetention(options({ allowLarge: true }));

    expect(allowed.refusal).toBeUndefined();
    expect(allowed.counts.auditsDeleted).toBe(RETENTION_RUN_CAP + 1);
  });

  it('holds an audit a queued or running job still names, and one the server says is running', async () => {
    await seedAudit('queued', 40);
    await seedAudit('producing', 30);
    await seedAudit('new', 20);
    await insert('jobs', [{ jobId: 'j1', status: 'queued', auditId: 'queued' }]);

    const result = await runRetention(
      options({
        inProcess: {
          inFlightJobIds: () => [],
          isReportProductionInFlight: (auditId) => auditId === 'producing',
        },
      }),
    );

    expect(result.plan.holds).toEqual([
      { auditId: 'queued', reason: 'job-in-flight' },
      { auditId: 'producing', reason: 'report-production' },
    ]);
    expect(await count('audits', {})).toBe(3);
  });

  it('reports an audit whose files are nowhere on this machine as not local', async () => {
    await insert('audits', [
      {
        auditId: 'elsewhere',
        siteUrl: 'https://hotel.example/',
        kind: 'audit',
        scanIntent: 'full-audit',
        startedAt: ago(40),
        finishedAt: ago(40),
        findingsProvenance: provenance,
      },
    ]);
    await seedAudit('new', 20);

    const result = await runRetention(options());

    expect(result.plan.holds).toEqual([{ auditId: 'elsewhere', reason: 'not-local' }]);
    expect(await count('audits', { auditId: 'elsewhere' })).toBe(1);
  });
});
