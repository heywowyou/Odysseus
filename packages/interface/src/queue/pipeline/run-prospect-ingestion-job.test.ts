import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, rm } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/store', () => ({
  completeJob: vi.fn(),
  createProspect: vi.fn(),
  getCheckpoint: vi.fn(),
  isSuppressed: vi.fn(),
  updateJobProgress: vi.fn(),
  upsertCheckpoint: vi.fn(),
}));

import {
  completeJob,
  createProspect,
  getCheckpoint,
  isSuppressed,
  updateJobProgress,
  upsertCheckpoint,
  type JobDocument,
} from '@odysseus/store';
import { OriginLock } from '@odysseus/scanner';
import { runProspectIngestionJob } from './run-prospect-ingestion-job.js';
import type { PipelineContext } from '../job-queue.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.join(moduleDir, '..', '..', '..', '..', '..');
const afnicFixture = path.join(workspaceRoot, 'fixtures', 'prospecting', 'afnic-sample.csv');
const sireneFixture = path.join(workspaceRoot, 'fixtures', 'prospecting', 'sirene-stock-sample.csv');
const cacheDir = path.join(workspaceRoot, 'data', 'sirene');
const cachePath = path.join(cacheDir, 'stock-index-cache.jsonl');

const QUALIFYING_SIREN = '732829320';

function fakeJob(overrides: Partial<{ jobId: string }> = {}): JobDocument {
  return {
    jobId: overrides.jobId ?? 'ingest-job-1',
    type: 'prospect-ingestion',
    status: 'running',
    phase: 'queued',
    options: {},
    createdAt: new Date(),
    progress: {},
  } as unknown as JobDocument;
}

function htmlHomepage(): string {
  return '<html><body>Bienvenue <a href="/mentions-legales">Mentions légales</a></body></html>';
}

function htmlMentionsLegales(domain: string): string {
  return `<html><body>SIREN ${QUALIFYING_SIREN}. Contact: contact@${domain}</body></html>`;
}

function htmlHomepageNoLegal(): string {
  return '<html><body>Accueil, rien ici</body></html>';
}

beforeAll(async () => {
  process.env['ODYSSEUS_AFNIC_FILE_PATH'] = afnicFixture;
  process.env['ODYSSEUS_SIRENE_STOCK_PATH'] = sireneFixture;
  process.env['CRAWL_DELAY_MS'] = '1';
  await mkdir(cacheDir, { recursive: true });
});

afterAll(async () => {
  await rm(cachePath, { force: true });
  delete process.env['ODYSSEUS_AFNIC_FILE_PATH'];
  delete process.env['ODYSSEUS_SIRENE_STOCK_PATH'];
  delete process.env['CRAWL_DELAY_MS'];
});

const fakeConnection = {} as never;
let ctx: PipelineContext;
let fetchMock: ReturnType<typeof vi.fn>;
const originalFetch = global.fetch;

beforeEach(async () => {
  vi.clearAllMocks();
  await rm(cachePath, { force: true }); // force a fresh index build per test
  ctx = { connection: fakeConnection, originLock: new OriginLock() };

  vi.mocked(getCheckpoint).mockResolvedValue(null);
  vi.mocked(isSuppressed).mockImplementation(async (_connection, domain: string) => domain === 'example-org3.fr');
  vi.mocked(createProspect).mockImplementation(async (_connection, input) => ({
    ...input,
    prospectId: 'p-1',
    createdAt: new Date(),
    expiresAt: new Date(),
  }));
  vi.mocked(updateJobProgress).mockResolvedValue(undefined);
  vi.mocked(upsertCheckpoint).mockResolvedValue(undefined);
  vi.mocked(completeJob).mockResolvedValue(undefined);

  fetchMock = vi.fn(async (input: string | URL) => {
    const url = input.toString();
    if (url === 'https://example-org1.fr/') {
      return { ok: true, url, text: async () => htmlHomepage() };
    }
    if (url === 'https://example-org1.fr/mentions-legales') {
      return { ok: true, url, text: async () => htmlMentionsLegales('example-org1.fr') };
    }
    if (url === 'https://example-org3.fr/') {
      return { ok: true, url, text: async () => htmlHomepage() };
    }
    if (url === 'https://example-org3.fr/mentions-legales') {
      return { ok: true, url, text: async () => htmlMentionsLegales('example-org3.fr') };
    }
    return { ok: false };
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('runProspectIngestionJob', () => {
  it('qualifies a candidate with a resolvable SIREN, a Sirene match, and a valid contact address', async () => {
    await runProspectIngestionJob(fakeJob(), ctx);

    const qualifiedCall = vi
      .mocked(createProspect)
      .mock.calls.find(([, input]) => input.domain === 'example-org1.fr');
    expect(qualifiedCall).toBeDefined();
    const [, input] = qualifiedCall!;
    expect(input.qualification.qualified).toBe(true);
    expect(input.qualification.reasons).toEqual([]);
    expect(input.siren.value).toBe(QUALIFYING_SIREN);
    expect(input.contactAddress?.value).toBe('contact@example-org1.fr');
  });

  it('excludes a suppressed domain even though its SIREN would otherwise qualify', async () => {
    await runProspectIngestionJob(fakeJob(), ctx);

    const suppressedCall = vi
      .mocked(createProspect)
      .mock.calls.find(([, input]) => input.domain === 'example-org3.fr');
    expect(suppressedCall).toBeDefined();
    const [, input] = suppressedCall!;
    expect(input.qualification.qualified).toBe(false);
    expect(input.qualification.reasons).toContain('domain-suppressed');
  });

  it('completes the job with ingestionResults bounded to the batch, reflecting each candidate', async () => {
    await runProspectIngestionJob(fakeJob({ jobId: 'ingest-job-2' }), ctx);

    expect(completeJob).toHaveBeenCalledTimes(1);
    const [, jobId, patch] = vi.mocked(completeJob).mock.calls[0]!;
    expect(jobId).toBe('ingest-job-2');
    const results = patch!.ingestionResults!;
    expect(results).toHaveLength(2); // only the two ORG, non-withdrawn candidates
    expect(results.find((r) => r.domain === 'example-org1.fr')?.status).toBe('qualified');
    expect(results.find((r) => r.domain === 'example-org3.fr')?.status).toBe('not-qualified');
  });

  it('persists a resume checkpoint at batch end', async () => {
    await runProspectIngestionJob(fakeJob(), ctx);
    expect(upsertCheckpoint).toHaveBeenCalled();
    const lastCall = vi.mocked(upsertCheckpoint).mock.calls.at(-1)!;
    expect(lastCall[2].nextByteOffset).toBeGreaterThan(0);
  });

  it('does not write per-candidate progress for a batch smaller than the write interval', async () => {
    await runProspectIngestionJob(fakeJob(), ctx);

    // Only the two phase-transition writes before the loop starts (afnic-scan,
    // fetch-qualify) - the fixture's 2-candidate batch never reaches the
    // PROSPECT_CHECKPOINT_WRITE_INTERVAL threshold, so no per-candidate write
    // fires. The exact final state is still guaranteed by completeJob.
    expect(vi.mocked(updateJobProgress).mock.calls.length).toBe(2);
  });
});
