import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/store', () => ({
  countActiveProspectDeletionJobs: vi.fn(async () => 0),
  deleteProspectPermanently: vi.fn(async () => ({ prospects: 1 })),
  getProspectHub: vi.fn(async () => ({ prospectId: 'prospect-1' })),
  listProspectAudits: vi.fn(async () => []),
  listProspectScopeJobRuns: vi.fn(async () => []),
}));
vi.mock('../outreach/withdraw-prospect-outreach.js', () => ({
  withdrawOutreachForProspect: vi.fn(async () => ({ mailboxDraftsNotRemoved: 0 })),
}));

import type { Connection } from 'mongoose';
import {
  deleteProspectPermanently,
  listProspectAudits,
  listProspectScopeJobRuns,
} from '@odysseus/store';
import type { ArtifactStore } from './artifact-store.js';
import { deleteProspectWithStorage } from './delete-prospect-with-storage.js';

const connection = {} as Connection;

function recordingStore(failList = false): ArtifactStore & { listed: string[] } {
  const listed: string[] = [];
  return {
    listed,
    get: async () => null,
    put: async () => undefined,
    list: async (prefix) => {
      if (failList) throw new Error('provider down');
      listed.push(prefix);
      return [];
    },
    delete: async () => undefined,
  };
}

const deps = (store: ArtifactStore) => ({
  artifactsRoot: '/nonexistent-artifacts-root',
  store,
  publisher: () => ({}) as never,
  mailbox: null,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('deleteProspectWithStorage', () => {
  it('removes the run directory of every job, including runs that persisted no audit', async () => {
    vi.mocked(listProspectAudits).mockResolvedValueOnce([
      {
        auditId: 'audit-1',
        siteUrl: 'https://hotel.example/',
        startedAt: new Date('2026-09-22T06:48:32Z'),
      },
    ] as never);
    vi.mocked(listProspectScopeJobRuns).mockResolvedValueOnce([
      {
        siteUrl: 'https://hotel.example/',
        runIdentity: { startedAt: new Date('2026-09-29T11:34:35Z'), auditId: 'run-2' },
      },
    ]);
    const store = recordingStore();

    const outcome = await deleteProspectWithStorage(connection, 'prospect-1', deps(store));

    expect(outcome).toEqual({ deleted: { prospects: 1 } });
    expect(store.listed).toContain('hotel.example/2026-09-22T06-48-32Z/');
    expect(store.listed).toContain('hotel.example/2026-09-29T11-34-35Z/');
  });

  it('keeps the prospect when a run directory cannot be removed', async () => {
    vi.mocked(listProspectScopeJobRuns).mockResolvedValueOnce([
      {
        siteUrl: 'https://hotel.example/',
        runIdentity: { startedAt: new Date('2026-09-29T11:34:35Z'), auditId: 'run-2' },
      },
    ]);

    const outcome = await deleteProspectWithStorage(
      connection,
      'prospect-1',
      deps(recordingStore(true)),
    );

    expect(outcome).toMatchObject({ refusal: 'artifact-deletion-failed' });
    expect(deleteProspectPermanently).not.toHaveBeenCalled();
  });
});
