import { logger } from '../../logger.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { statSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROSPECT_FETCH_ALLOWLIST_ENV_VAR } from '../../config.js';

vi.mock('@odysseus/store', () => ({
  completeJob: vi.fn(),
  createProspect: vi.fn(),
  findProspectByDomainAndSourceVersion: vi.fn(),
  getCheckpoint: vi.fn(),
  isSuppressed: vi.fn(),
  updateJobProgress: vi.fn(),
  upsertCheckpoint: vi.fn(),
}));

// Delegate to the real reader by default so the fixture-based tests keep
// exercising it; a test that needs a synthetic batch overrides the resolved
// value for its own run only, while call arguments stay observable.
vi.mock('../../prospecting/afnic-reader.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../prospecting/afnic-reader.js')>();
  return {
    ...actual,
    streamAfnicCandidates: vi.fn(
      async (
        filePath: string,
        startByteOffset: number,
        targetCandidateCount: number,
        headerColumns?: string[],
      ) =>
        actual.streamAfnicCandidates(
          filePath,
          startByteOffset,
          targetCandidateCount,
          headerColumns,
        ),
    ),
  };
});

import {
  completeJob,
  createProspect,
  findProspectByDomainAndSourceVersion,
  getCheckpoint,
  isSuppressed,
  updateJobProgress,
  upsertCheckpoint,
  type JobDocument,
  type ProspectDocument,
} from '@odysseus/store';
import type { AfnicRow } from '@odysseus/core';
import { OriginLock } from '@odysseus/scanner';
import { runProspectIngestionJob } from './run-prospect-ingestion-job.js';
import { streamAfnicCandidates } from '../../prospecting/afnic-reader.js';
import { DEFAULT_PROSPECT_BATCH_SIZE, PROSPECT_CHECKPOINT_WRITE_INTERVAL } from '../../config.js';
import type { PipelineContext } from '../job-queue.js';
import { CancellationRegistry } from '../cancellation.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.join(moduleDir, '..', '..', '..', '..', '..');
const afnicFixture = path.join(workspaceRoot, 'fixtures', 'prospecting', 'afnic-sample.csv');
const sireneFixture = path.join(
  workspaceRoot,
  'fixtures',
  'prospecting',
  'sirene-stock-sample.csv',
);
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

// The fetch address guard (issue #158) resolves every fetched host, and the
// fetch stub answers for fake domains: these are allowlisted beforeAll so
// the tests stay hermetic instead of asking real DNS about them. The
// batch-candidate names are the synthetic domains the checkpoint-cadence
// test generates.
const allowlistedTestDomains = [
  'example-org1.fr',
  'example-org3.fr',
  ...Array.from(
    { length: PROSPECT_CHECKPOINT_WRITE_INTERVAL + 1 },
    (_, i) => `batch-candidate-${i}.fr`,
  ),
];

const originalAllowlist = process.env[PROSPECT_FETCH_ALLOWLIST_ENV_VAR];

beforeAll(async () => {
  process.env['ODYSSEUS_AFNIC_FILE_PATH'] = afnicFixture;
  process.env['ODYSSEUS_SIRENE_STOCK_PATH'] = sireneFixture;
  process.env['CRAWL_DELAY_MS'] = '1';
  process.env[PROSPECT_FETCH_ALLOWLIST_ENV_VAR] = allowlistedTestDomains.join(',');
  await mkdir(cacheDir, { recursive: true });
});

afterAll(async () => {
  await rm(cachePath, { force: true });
  delete process.env['ODYSSEUS_AFNIC_FILE_PATH'];
  delete process.env['ODYSSEUS_SIRENE_STOCK_PATH'];
  delete process.env['CRAWL_DELAY_MS'];
  if (originalAllowlist === undefined) delete process.env[PROSPECT_FETCH_ALLOWLIST_ENV_VAR];
  else process.env[PROSPECT_FETCH_ALLOWLIST_ENV_VAR] = originalAllowlist;
});

const fakeConnection = {} as never;
let ctx: PipelineContext;
let fetchMock: ReturnType<typeof vi.fn>;
const originalFetch = global.fetch;

beforeEach(async () => {
  vi.clearAllMocks();
  await rm(cachePath, { force: true }); // force a fresh index build per test
  ctx = {
    connection: fakeConnection,
    originLock: new OriginLock(),
    cancellation: new CancellationRegistry(),
    log: logger,
  };

  vi.mocked(getCheckpoint).mockResolvedValue(null);
  vi.mocked(findProspectByDomainAndSourceVersion).mockResolvedValue(null);
  vi.mocked(isSuppressed).mockImplementation(
    async (_connection, domain: string) => domain === 'example-org3.fr',
  );
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

  it('writes the checkpoint exactly once, at batch end, only after the loop finishes', async () => {
    // One candidate past the write interval: a mid-loop checkpoint would
    // have fired here and named an offset past unprocessed candidates.
    const candidates: AfnicRow[] = Array.from(
      { length: PROSPECT_CHECKPOINT_WRITE_INTERVAL + 1 },
      (_, i) => ({
        domain: `batch-candidate-${i}.fr`,
        titulaireType: 'ORG',
        idn: false,
      }),
    );
    const batchEndOffset = 4_096;
    vi.mocked(streamAfnicCandidates).mockResolvedValueOnce({
      candidates,
      rowsScanned: candidates.length,
      nextByteOffset: batchEndOffset,
      exhausted: false,
      headerColumns: ['Nom de domaine'],
    });

    await runProspectIngestionJob(fakeJob({ jobId: 'ingest-job-3' }), ctx);

    expect(upsertCheckpoint).toHaveBeenCalledTimes(1);
    expect(vi.mocked(upsertCheckpoint).mock.calls[0]![2].nextByteOffset).toBe(batchEndOffset);
    // The single write landed after the loop, before completeJob.
    expect(vi.mocked(upsertCheckpoint).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(completeJob).mock.invocationCallOrder[0]!,
    );
    // Mid-run progress reporting still fires at the interval: the two
    // phase transitions plus one interval write at candidate 100.
    expect(updateJobProgress).toHaveBeenCalledTimes(3);
  });

  it('skips an already-ingested candidate from its stored outcome without fetching or re-inserting it', async () => {
    // Only the fields the redo guard reads; the rest of the stored row is
    // irrelevant to it, same as fakeJob's partial JobDocument above.
    const stored = {
      domain: 'example-org1.fr',
      siren: {
        value: QUALIFYING_SIREN,
        source: 'lcen-mentions-legales-fetch',
        retrievedAt: new Date(),
      },
      qualification: { qualified: true, reasons: [], evaluatedAt: new Date() },
    } as unknown as ProspectDocument;
    vi.mocked(findProspectByDomainAndSourceVersion).mockImplementation(
      async (_connection, domain: string) => (domain === 'example-org1.fr' ? stored : null),
    );

    await runProspectIngestionJob(fakeJob({ jobId: 'ingest-job-4' }), ctx);

    // The stored row satisfied the candidate: its site was never fetched
    // and no new prospect row was inserted, while the other candidate
    // still went through the full funnel.
    const fetchedUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(fetchedUrls.some((url) => url.includes('example-org1.fr'))).toBe(false);
    expect(
      vi.mocked(createProspect).mock.calls.some(([, input]) => input.domain === 'example-org1.fr'),
    ).toBe(false);
    expect(
      vi.mocked(createProspect).mock.calls.some(([, input]) => input.domain === 'example-org3.fr'),
    ).toBe(true);

    // The result entry is reconstructed from the stored prospect's own
    // outcome, not a fresh evaluation.
    const results = vi.mocked(completeJob).mock.calls[0]![2]!.ingestionResults!;
    expect(results.find((r) => r.domain === 'example-org1.fr')).toEqual({
      domain: 'example-org1.fr',
      status: 'qualified',
      siren: QUALIFYING_SIREN,
      reasons: [],
    });
  });

  it('streams a resumed batch from the checkpointed mid-file offset', async () => {
    const stats = statSync(afnicFixture);
    const headerColumns = [
      'Nom de domaine',
      'Type du titulaire',
      'Pays titulaire',
      'Departement titulaire',
      'Domaine IDN',
      'Date de création',
      'Date de retrait du WHOIS',
    ];
    vi.mocked(getCheckpoint).mockResolvedValue({
      checkpointId: 'afnic-fichier-a',
      sourceFilePath: afnicFixture,
      sourceFileVersion: `${stats.size}:${stats.mtimeMs}`,
      nextByteOffset: 250,
      rowsProcessed: 2,
      headerColumns,
      updatedAt: new Date(),
    });

    await runProspectIngestionJob(fakeJob({ jobId: 'ingest-job-5' }), ctx);

    // The redo design re-streams the partially-processed batch from the
    // offset where that batch started - pinning this so it cannot regress.
    expect(streamAfnicCandidates).toHaveBeenCalledWith(
      afnicFixture,
      250,
      DEFAULT_PROSPECT_BATCH_SIZE,
      headerColumns,
    );
  });
});
