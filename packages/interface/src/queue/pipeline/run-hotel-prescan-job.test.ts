import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RecordPrescanInput } from '@odysseus/store';
import { persistPrescanWithArtifactCleanup } from './run-hotel-prescan-job.js';

let scratchDir = '';

afterEach(async () => {
  if (scratchDir !== '') await fs.rm(scratchDir, { recursive: true, force: true });
});

function input(artifactsDir: string): RecordPrescanInput {
  return {
    candidateId: 'candidate-1',
    resolutionVersion: 'v1',
    qualificationVersion: 'v1',
    prescanVersion: 'v2',
    scanJobId: 'job-1',
    domain: 'hotel.example',
    startUrl: 'https://hotel.example/',
    status: 'complete',
    pages: [],
    absentRoles: [],
    offsiteBookingLinks: [],
    robotsTxtFound: true,
    effectiveDelayMs: 1000,
    artifactsDir,
    browserVersion: 'test',
    startedAt: new Date(),
    durationMs: 1,
    evidence: {
      schemaVersion: 1,
      status: 'incomplete',
      renderComparison: { state: 'omitted', reason: 'no-material-render-gap' },
      specificFailure: { state: 'omitted', reason: 'no-eligible-failure' },
      summaries: [],
    },
  };
}

describe('prescan persistence artifact cleanup', () => {
  it('removes an unreferenced prescan directory when insertion fails', async () => {
    scratchDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-persist-cleanup-'));
    const relative = 'hotel.example/run-1';
    const runDir = path.join(scratchDir, relative);
    await fs.mkdir(runDir, { recursive: true });
    await expect(
      persistPrescanWithArtifactCleanup(scratchDir, input(relative), async () => {
        throw new Error('database insertion failed');
      }),
    ).rejects.toThrow('database insertion failed');
    await expect(fs.stat(runDir)).rejects.toThrow();
  });

  it('retains artifacts when insertion succeeds but the candidate pointer is missed', async () => {
    scratchDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-persist-cleanup-'));
    const relative = 'hotel.example/run-1';
    const runDir = path.join(scratchDir, relative);
    await fs.mkdir(runDir, { recursive: true });
    const result = await persistPrescanWithArtifactCleanup(
      scratchDir,
      input(relative),
      async () => ({ prescanId: 'prescan-1', pointerWritten: false }),
    );
    expect(result.pointerWritten).toBe(false);
    await expect(fs.stat(runDir)).resolves.toBeDefined();
  });
});
