import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { diskLevel } from '../retention/storage-status.js';
import { readDiskStatus, summarizeRetentionRun } from './storage-status.js';

describe('diskLevel', () => {
  it.each([
    [74.9, 'ok'],
    [75, 'warning'],
    [89.9, 'warning'],
    [90, 'danger'],
    [100, 'danger'],
  ] as const)('%s %% -> %s', (usedPercent, level) => {
    expect(diskLevel(usedPercent)).toBe(level);
  });
});

describe('readDiskStatus', () => {
  it('measures a real directory', async () => {
    const status = await readDiskStatus(os.tmpdir());

    expect(status?.totalBytes).toBeGreaterThan(0);
    expect(status?.usedPercent).toBeGreaterThanOrEqual(0);
    expect(status?.usedPercent).toBeLessThanOrEqual(100);
    expect(status?.level).toBe(diskLevel(status!.usedPercent));
  });

  it('answers null for a root that does not exist', async () => {
    expect(await readDiskStatus('/definitely/not/an/artifacts/root')).toBeNull();
  });
});

describe('summarizeRetentionRun', () => {
  it('adds up the versions removed inside audits and flags a refusal', () => {
    const summary = summarizeRetentionRun({
      runId: 'r',
      trigger: 'cli',
      startedAt: new Date('2026-09-30T03:00:00Z'),
      finishedAt: new Date('2026-09-30T03:15:00Z'),
      counts: {
        auditsDeleted: 1,
        auditsSlimmed: 2,
        reportsDeleted: 3,
        analysesDeleted: 4,
        structureFilesDeleted: 5,
        qualityCandidateSetsDeleted: 6,
        reportBundlesDeleted: 7,
        auditsHeld: 8,
      },
      bytesReclaimed: { local: 10, remote: 9 },
      remoteObjectsDeleted: 4,
      refusal: { reason: 'cap-exceeded', auditsToDelete: 30, auditsToSlim: 0 },
      failures: [{ auditId: 'a', step: 'report', message: 'x' }],
      expiresAt: new Date('2026-12-29T03:15:00Z'),
    });

    expect(summary).toEqual({
      trigger: 'cli',
      finishedAt: '2026-09-30T03:15:00.000Z',
      auditsDeleted: 1,
      auditsSlimmed: 2,
      versionsDeleted: 25,
      auditsHeld: 8,
      bytesReclaimedLocal: 10,
      failureCount: 1,
      refused: true,
    });
  });
});
