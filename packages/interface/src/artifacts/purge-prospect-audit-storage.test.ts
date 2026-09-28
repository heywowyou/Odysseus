import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/store', () => ({
  deleteAuditCascade: vi.fn(),
  deleteFinishedScanJobsForAudit: vi.fn(),
  listProspectAudits: vi.fn(),
  loadRetentionSnapshot: vi.fn(),
}));
vi.mock('../retention/apply-retention.js', () => ({ slimAuditStorage: vi.fn() }));
vi.mock('./delete-audit-artifacts.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./delete-audit-artifacts.js')>()),
  deleteAuditArtifacts: vi.fn(),
}));

import {
  deleteAuditCascade,
  deleteFinishedScanJobsForAudit,
  listProspectAudits,
  loadRetentionSnapshot,
} from '@odysseus/store';
import { slimAuditStorage } from '../retention/apply-retention.js';
import { AuditArtifactDeletionError, deleteAuditArtifacts } from './delete-audit-artifacts.js';
import { purgeProspectAuditStorage } from './purge-prospect-audit-storage.js';

const connection = {} as never;
const options = { artifactsRoot: '/artifacts', store: undefined };
const audit = (auditId: string) => ({
  auditId,
  siteUrl: 'https://hotel.example/',
  startedAt: new Date('2026-09-16T10:00:00Z'),
});

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    audits: [],
    reports: [],
    analyses: [],
    approvals: [],
    bundles: [],
    activeBundles: [],
    qualityRuns: [],
    livePreviewAuditIds: [],
    archivedProspectIds: [],
    ...overrides,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(deleteAuditArtifacts).mockResolvedValue({ remoteObjectsDeleted: 3 });
  vi.mocked(loadRetentionSnapshot).mockResolvedValue(snapshot());
  vi.mocked(slimAuditStorage).mockResolvedValue({ remoteObjectsDeleted: 5 });
});

describe('purgeProspectAuditStorage (issue #381)', () => {
  it('removes each audit’s files, then its records and finished scan jobs', async () => {
    vi.mocked(listProspectAudits).mockResolvedValue([audit('a-1'), audit('a-2')] as never);
    const order: string[] = [];
    vi.mocked(deleteAuditArtifacts).mockImplementation(async (row) => {
      order.push(`files:${(row as unknown as { auditId: string }).auditId}`);
      return { remoteObjectsDeleted: 3 };
    });
    vi.mocked(deleteAuditCascade).mockImplementation(async (_c, id) => {
      order.push(`records:${id}`);
      return {} as never;
    });
    vi.mocked(deleteFinishedScanJobsForAudit).mockImplementation(async (_c, id) => {
      order.push(`jobs:${id}`);
      return 1;
    });

    await expect(purgeProspectAuditStorage(connection, 'p-1', options)).resolves.toEqual({
      audits: 2,
      auditsKept: 0,
      remoteObjectsDeleted: 6,
    });
    expect(order).toEqual([
      'files:a-1',
      'records:a-1',
      'jobs:a-1',
      'files:a-2',
      'records:a-2',
      'jobs:a-2',
    ]);
  });

  it('stops at a storage failure, keeping that audit’s records for a retry', async () => {
    vi.mocked(listProspectAudits).mockResolvedValue([audit('a-1'), audit('a-2')] as never);
    vi.mocked(deleteAuditArtifacts)
      .mockResolvedValueOnce({ remoteObjectsDeleted: 1 })
      .mockRejectedValueOnce(new AuditArtifactDeletionError('remote'));

    await expect(purgeProspectAuditStorage(connection, 'p-1', options)).rejects.toBeInstanceOf(
      AuditArtifactDeletionError,
    );
    expect(deleteAuditCascade).toHaveBeenCalledTimes(1);
    expect(deleteAuditCascade).toHaveBeenCalledWith(connection, 'a-1');
  });

  it('is a no-op once nothing is left', async () => {
    vi.mocked(listProspectAudits).mockResolvedValue([]);
    await expect(purgeProspectAuditStorage(connection, 'p-1', options)).resolves.toEqual({
      audits: 0,
      auditsKept: 0,
      remoteObjectsDeleted: 0,
    });
    expect(deleteAuditArtifacts).not.toHaveBeenCalled();
  });

  it('slims a delivered audit instead of deleting it (issue #560)', async () => {
    vi.mocked(listProspectAudits).mockResolvedValue([audit('a-1'), audit('a-2')] as never);
    vi.mocked(loadRetentionSnapshot).mockResolvedValue(
      snapshot({ approvals: [{ auditId: 'a-1', reportIds: ['r-1'] }] }),
    );

    await expect(purgeProspectAuditStorage(connection, 'p-1', options)).resolves.toEqual({
      audits: 1,
      auditsKept: 1,
      remoteObjectsDeleted: 8,
    });
    expect(slimAuditStorage).toHaveBeenCalledWith(
      connection,
      audit('a-1'),
      expect.objectContaining({ artifactsRoot: '/artifacts', now: expect.any(Date) }),
    );
    expect(deleteAuditCascade).toHaveBeenCalledTimes(1);
    expect(deleteAuditCascade).toHaveBeenCalledWith(connection, 'a-2');
  });

  it('keeps an already slimmed delivered audit without touching it again', async () => {
    vi.mocked(listProspectAudits).mockResolvedValue([audit('a-1')] as never);
    vi.mocked(loadRetentionSnapshot).mockResolvedValue(
      snapshot({
        audits: [{ ...audit('a-1'), slimmedAt: new Date('2026-09-20T00:00:00Z') }],
        reports: [{ auditId: 'a-1', origin: 'finalized' }],
      }),
    );

    await expect(purgeProspectAuditStorage(connection, 'p-1', options)).resolves.toEqual({
      audits: 0,
      auditsKept: 1,
      remoteObjectsDeleted: 0,
    });
    expect(slimAuditStorage).not.toHaveBeenCalled();
    expect(deleteAuditCascade).not.toHaveBeenCalled();
  });
});
