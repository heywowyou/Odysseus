import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { removePrescanArtifacts, sweepExpiredPrescanArtifacts } from './retention.js';

let scratchDir = '';

afterEach(async () => {
  if (scratchDir !== '') await fs.rm(scratchDir, { recursive: true, force: true });
});

async function createRun(name: string, expiresAt: string): Promise<string> {
  const runDir = path.join(scratchDir, 'hotel.example', name);
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(
    path.join(runDir, 'expiry-manifest.json'),
    JSON.stringify({ schemaVersion: 1, expiresAt, assets: [] }),
  );
  return runDir;
}

describe('prescan artifact retention', () => {
  it('lists expired manifests in dry-run mode and deletes only when applied', async () => {
    scratchDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-retention-'));
    const old = await createRun('old', '2026-01-01T00:00:00.000Z');
    const fresh = await createRun('fresh', '2027-01-01T00:00:00.000Z');
    const options = { dryRun: true, limit: 10, now: new Date('2026-08-27T00:00:00.000Z') };
    const preview = await sweepExpiredPrescanArtifacts(scratchDir, options);
    expect(preview).toMatchObject({ inspected: 2, expired: 1, removed: 0, capped: false });
    await expect(fs.stat(old)).resolves.toBeDefined();

    const applied = await sweepExpiredPrescanArtifacts(scratchDir, { ...options, dryRun: false });
    expect(applied.removed).toBe(1);
    await expect(fs.stat(old)).rejects.toThrow();
    await expect(fs.stat(fresh)).resolves.toBeDefined();
  });

  it('bounds manifest inspection and rejects deletion outside the configured root', async () => {
    scratchDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-retention-'));
    await createRun('a', '2026-01-01T00:00:00.000Z');
    await createRun('b', '2026-01-01T00:00:00.000Z');
    const report = await sweepExpiredPrescanArtifacts(scratchDir, {
      dryRun: true,
      limit: 1,
      now: new Date('2026-08-27T00:00:00.000Z'),
    });
    expect(report).toMatchObject({ inspected: 1, capped: true });
    await expect(removePrescanArtifacts(scratchDir, '../outside')).rejects.toThrow(
      'outside the prescans root',
    );
    await expect(removePrescanArtifacts(scratchDir, '/absolute')).rejects.toThrow(
      'must be relative',
    );
  });

  it('warns about an unreadable manifest but silently skips a missing one', async () => {
    scratchDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-retention-'));
    const corruptRun = await createRun('corrupt', '2026-01-01T00:00:00.000Z');
    await fs.writeFile(path.join(corruptRun, 'expiry-manifest.json'), '{not-json');
    await fs.mkdir(path.join(scratchDir, 'hotel.example', 'missing'), { recursive: true });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const report = await sweepExpiredPrescanArtifacts(scratchDir, {
      dryRun: true,
      limit: 10,
      now: new Date('2026-08-27T00:00:00.000Z'),
    });

    expect(report).toMatchObject({ inspected: 2, expired: 0, removed: 0 });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(path.join('hotel.example', 'corrupt', 'expiry-manifest.json')),
      expect.any(SyntaxError),
    );
  });
});
