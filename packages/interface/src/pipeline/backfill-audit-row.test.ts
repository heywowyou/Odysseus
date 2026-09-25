import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/store', () => ({ persistAudit: vi.fn() }));

import { persistAudit } from '@odysseus/store';
import { buildFindingsProvenance, type AuditManifest } from '@odysseus/core';
import { backfillAuditRow } from './backfill-audit-row.js';

const fakeConnection = {} as never;

function fakeManifest(): AuditManifest {
  return {
    auditId: 'audit-1',
    kind: 'audit',
    siteUrl: 'https://example.com/',
    startedAt: '2026-08-02T00:00:00.000Z',
    finishedAt: '2026-08-02T00:05:00.000Z',
    findingsProvenance: buildFindingsProvenance([]),
    tool: {
      odysseusVersion: '0.1.0',
      findingsSchemaVersion: 1,
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

let auditDir: string;

async function writeArtifacts(manifest: unknown, findings: unknown): Promise<void> {
  await fs.writeFile(path.join(auditDir, 'manifest.json'), JSON.stringify(manifest));
  await fs.writeFile(path.join(auditDir, 'findings.json'), JSON.stringify(findings));
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(persistAudit).mockResolvedValue(undefined);
  auditDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-backfill-'));
});

afterEach(async () => {
  await fs.rm(auditDir, { recursive: true, force: true });
});

describe('backfillAuditRow', () => {
  it('re-persists the stored manifest and findings', async () => {
    const manifest = fakeManifest();
    await writeArtifacts(manifest, []);

    const result = await backfillAuditRow(auditDir, fakeConnection);

    expect(persistAudit).toHaveBeenCalledWith(fakeConnection, manifest, [], undefined, {
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
    });
    expect(result).toMatchObject({
      auditId: 'audit-1',
      siteUrl: 'https://example.com/',
      findingCount: 0,
      persisted: true,
    });
  });

  it('refuses a manifest carrying no provenance stamp', async () => {
    const { findingsProvenance: _omitted, ...unstamped } = fakeManifest();
    await writeArtifacts(unstamped, []);

    await expect(backfillAuditRow(auditDir, fakeConnection)).rejects.toThrow(
      /Backfill refused:[\s\S]*legacy manifest has no findings provenance/,
    );
    expect(persistAudit).not.toHaveBeenCalled();
  });

  it('refuses a stamp that does not describe the findings on disk', async () => {
    const manifest = fakeManifest();
    await writeArtifacts(manifest, [{ findingId: 'f1' }]);

    await expect(backfillAuditRow(auditDir, fakeConnection)).rejects.toThrow(
      /Backfill refused:[\s\S]*stale manifest findings digest/,
    );
    expect(persistAudit).not.toHaveBeenCalled();
  });

  it('verifies but writes nothing on a dry run', async () => {
    await writeArtifacts(fakeManifest(), []);

    const result = await backfillAuditRow(auditDir, fakeConnection, { dryRun: true });

    expect(persistAudit).not.toHaveBeenCalled();
    expect(result.persisted).toBe(false);
  });
});
