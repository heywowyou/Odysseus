import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFindingsProvenance } from '@odysseus/core';

const auditDir = path.join(os.tmpdir(), 'odysseus-audit-evidence-test');

vi.mock('@odysseus/scanner', () => ({
  buildAuditDir: vi.fn(() => auditDir),
  getArtifactsRoot: vi.fn(() => os.tmpdir()),
}));
vi.mock('./renormalize-audit.js', () => ({ renormalizeAudit: vi.fn() }));
vi.mock('./backfill-audit-row.js', () => ({ backfillAuditRow: vi.fn() }));
vi.mock('../artifacts/sync-audit-artifacts.js', () => ({ syncAuditDirToBucket: vi.fn() }));

import { syncAuditDirToBucket } from '../artifacts/sync-audit-artifacts.js';
import { backfillAuditRow } from './backfill-audit-row.js';
import { findingsAreStale, refreshStaleAuditEvidence } from './audit-evidence.js';
import { renormalizeAudit } from './renormalize-audit.js';

const audit = {
  auditId: 'audit-evidence-test',
  siteUrl: 'https://example.com/',
  startedAt: new Date('2026-09-01T00:00:00.000Z'),
};

async function writeEvidence(findingsProvenance: unknown): Promise<void> {
  await fs.mkdir(auditDir, { recursive: true });
  await Promise.all([
    fs.writeFile(
      path.join(auditDir, 'manifest.json'),
      JSON.stringify({
        auditId: 'audit-evidence-test',
        siteUrl: 'https://example.com/',
        findingsProvenance,
      }),
    ),
    fs.writeFile(path.join(auditDir, 'findings.json'), JSON.stringify([])),
  ]);
}

beforeEach(async () => {
  vi.clearAllMocks();
  await fs.rm(auditDir, { recursive: true, force: true });
});

afterEach(async () => {
  await fs.rm(auditDir, { recursive: true, force: true });
});

describe('stale audit evidence refresh', () => {
  it('recognizes missing or old provenance without treating a changed digest as a pre-flight stale signal', () => {
    const current = buildFindingsProvenance([]);

    expect(findingsAreStale(undefined, [])).toBe(true);
    expect(findingsAreStale({ ...current, normalizationFingerprint: 'old' }, [])).toBe(true);
    expect(findingsAreStale({ ...current, findingsDigest: 'sha256:other' }, [])).toBe(false);
  });

  it('renormalizes, backfills, syncs, and rereads a stale manifest before analysis uses it', async () => {
    const current = buildFindingsProvenance([]);
    await writeEvidence({ ...current, normalizationFingerprint: 'old' });
    vi.mocked(renormalizeAudit).mockImplementation(async () => {
      await writeEvidence(current);
      return { auditId: audit.auditId, pageCount: 1, findingCount: 0, manifest: {} } as never;
    });

    const result = await refreshStaleAuditEvidence({} as never, audit as never, undefined);

    expect(renormalizeAudit).toHaveBeenCalledWith(auditDir, undefined);
    expect(backfillAuditRow).toHaveBeenCalledWith(auditDir, expect.anything());
    expect(syncAuditDirToBucket).toHaveBeenCalledWith(
      undefined,
      auditDir,
      'example.com',
      audit.startedAt,
    );
    expect(result.findingsWereRefreshed).toBe(true);
    expect(result.manifest.findingsProvenance).toEqual(current);
  });
});
