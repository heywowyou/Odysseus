import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FINDINGS_SCHEMA_VERSION,
  buildFindingsProvenance,
  type ApprovedAuditEvidencePayload,
  type AuditManifest,
  type Finding,
} from '@odysseus/core';
import type { ReportQualityRunDocument } from '@odysseus/store';

/** The harness is mocked at its three seams: the pipeline (no model calls,
 *  scripted outcomes), the evidence loader (a fixture payload; the real
 *  loader is pure and covered by report-quality-evidence.test.ts, and
 *  faking it here keeps this suite hermetic from the report package the
 *  real loader transitively imports), and the store boundary (a fake
 *  run-model reader instead of Mongo - the same boundary other interface
 *  tests mock). */
vi.mock('@odysseus/store', () => ({ createReportQualityRunModel: vi.fn() }));

vi.mock('./report-quality-pipeline.js', () => ({ runReportQualityPipeline: vi.fn() }));

vi.mock('./report-quality-evidence.js', () => ({ loadAuditEvidencePayload: vi.fn() }));

import { createReportQualityRunModel } from '@odysseus/store';
import { loadAuditEvidencePayload } from './report-quality-evidence.js';
import { runReportQualityPipeline } from './report-quality-pipeline.js';
import type { ReportQualityPipelineResult } from './report-quality-pipeline.js';
import {
  dryRunReportQualityCorpus,
  loadCorpusManifest,
  runReportQualityCorpus,
} from './report-quality-benchmark.js';

const CORPUS_ID = 'plan-058-test-corpus';

function finding(auditId: string): Finding {
  return {
    findingId: `finding-contrast-${auditId}`,
    auditId,
    schemaVersion: FINDINGS_SCHEMA_VERSION,
    source: 'axe',
    ruleId: 'color-contrast',
    category: 'accessibility',
    severity: 'serious',
    wcagCriteria: [],
    title: 'Synthetic fixture finding',
    description: 'Synthetic description; no real site content is used.',
    pageUrls: [`https://${auditId}.fixture.test/`],
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    dedupeKey: 'color-contrast',
    firstSeenAt: new Date(0),
    lastSeenAt: new Date(0),
  };
}

function manifest(auditId: string, findings: Finding[]): AuditManifest {
  return {
    auditId,
    kind: 'audit',
    siteUrl: `https://${auditId}.fixture.test/`,
    startedAt: '2026-09-01T00:00:00.000Z',
    finishedAt: '2026-09-01T01:00:00.000Z',
    findingsProvenance: buildFindingsProvenance(findings),
    tool: {
      odysseusVersion: 'fixture-build',
      findingsSchemaVersion: FINDINGS_SCHEMA_VERSION,
      axeCoreVersion: '4.0.0',
      lighthouseVersion: '13.0.0',
      playwrightVersion: '1.0.0',
      chromiumVersion: '151.0.0.0',
    },
    config: {
      maxPages: 5,
      maxDepth: 1,
      crawlDelayMs: 0,
      pageTimeoutMs: 1000,
      lighthouseTimeoutMs: 1000,
      userAgent: 'fixture-agent',
      scanConcurrency: 1,
    },
    crawl: {
      startUrl: `https://${auditId}.fixture.test/`,
      visitedCount: 1,
      maxPages: 5,
      maxDepth: 1,
      robotsTxtFound: false,
      effectiveDelayMs: 0,
    },
    pages: [{ url: `https://${auditId}.fixture.test/`, depth: 0, status: 'visited', errors: {} }],
  } as AuditManifest;
}

async function writeSavedAudit(rootDir: string, auditId: string): Promise<string> {
  const findings = [finding(auditId)];
  const auditDir = path.join(rootDir, `${auditId}.fixture.test`, '2026-09-01T00-00-00Z');
  await fs.mkdir(auditDir, { recursive: true });
  await fs.writeFile(
    path.join(auditDir, 'manifest.json'),
    JSON.stringify(manifest(auditId, findings), null, 2),
  );
  await fs.writeFile(path.join(auditDir, 'findings.json'), JSON.stringify(findings, null, 2));
  return auditDir;
}

async function writeCorpusManifest(rootDir: string, entries: unknown[]): Promise<string> {
  const manifestPath = path.join(rootDir, 'corpus.json');
  await fs.writeFile(
    manifestPath,
    JSON.stringify({ corpusId: CORPUS_ID, schemaVersion: 1, entries }, null, 2),
  );
  return manifestPath;
}

function evidencePayload(auditId: string): ApprovedAuditEvidencePayload {
  return {
    approval: {
      auditId,
      evidenceEpoch: 0,
      rawEvidenceSnapshotDigest: `sha256:${'a'.repeat(64)}`,
      auditEvidenceSnapshotDigest: `sha256:${'b'.repeat(64)}`,
      evidenceQualityAssessmentDigest: `sha256:${'c'.repeat(64)}`,
      verdict: 'reportable-with-known-limitations',
      limitations: [],
      evidenceCoverageSignature:
        {} as ApprovedAuditEvidencePayload['approval']['evidenceCoverageSignature'],
      capabilityRegistryVersion: 'fixture',
      approvalMode: 'legacy-adapter',
      approvedAt: '2026-09-18T00:00:00.000Z',
      approvedBySystemVersion: 'fixture:corpus-benchmark-v1',
    },
    manifest: { auditId } as AuditManifest,
    findings: [],
    mandatoryDisclosures: [
      {
        limitationId: 'fixture-legacy-lineage',
        code: 'legacy-evidence-lineage',
        summary: { fr: 'Phrase de limitation de test.', en: 'Test limitation sentence.' },
        reportDestination: 'section-11',
        evidenceRefs: [`sha256:${'a'.repeat(64)}`],
      },
    ],
  };
}

function pipelineResult(): ReportQualityPipelineResult {
  const candidate = (language: 'fr' | 'en', byte: string) => ({
    language,
    pdfDigest: `sha256:${byte.repeat(64)}` as `sha256:${string}`,
    privateObjectKey: `report-quality/candidates/audit/fixture-run/${language}-${byte.repeat(12)}.pdf`,
    pageCount: 7,
    qaDigest: `sha256:${byte.repeat(63)}0` as `sha256:${string}`,
    pageManifestDigest: `sha256:${byte.repeat(62)}01` as `sha256:${string}`,
    draftDigest: `sha256:${byte.repeat(61)}011` as `sha256:${string}`,
  });
  return {
    qualityRunId: 'fixture-quality-run',
    epoch: 3,
    state: 'awaiting-operator-approval',
    bundleId: 'fixture-bundle',
    bundleDigest: `sha256:${'d'.repeat(64)}`,
    inputSnapshotDigest: `sha256:${'e'.repeat(64)}`,
    evidenceApprovalMode: 'legacy-adapter',
    fr: candidate('fr', '1'),
    en: candidate('en', '2'),
  };
}

function runDoc(overrides: Partial<ReportQualityRunDocument> = {}): ReportQualityRunDocument {
  return {
    qualityRunId: 'fixture-quality-run',
    auditId: 'fixture-audit',
    epoch: 3,
    leaseTokenHash: `sha256:${'f'.repeat(64)}`,
    state: 'awaiting-operator-approval',
    inputSnapshotDigest: `sha256:${'e'.repeat(64)}`,
    approvedEvidenceDigest: `sha256:${'a'.repeat(64)}`,
    issues: [],
    modelCalls: [
      { role: 'senior-analyst' },
      { role: 'writer-fr' },
      { role: 'writer-fr' },
      { role: 'parity-reviewer' },
    ] as ReportQualityRunDocument['modelCalls'],
    candidateDigests: [],
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function fakeRunModel(
  lean: (query: Record<string, string>) => ReportQualityRunDocument | null,
): void {
  vi.mocked(createReportQualityRunModel).mockReturnValue({
    findOne: (query: Record<string, string>) => ({
      sort: () => ({ lean: async () => lean(query) }),
    }),
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadAuditEvidencePayload).mockImplementation(({ manifest }) =>
    evidencePayload((manifest as { auditId: string }).auditId),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadCorpusManifest', () => {
  it('accepts a valid manifest whose audit directories exist', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rq-corpus-'));
    try {
      const dirA = await writeSavedAudit(root, 'audit-a');
      const manifestPath = await writeCorpusManifest(root, [
        { entryId: 'entry-a', host: 'audit-a.fixture.test', auditDir: dirA },
      ]);
      const loaded = await loadCorpusManifest(manifestPath);
      expect(loaded.corpusId).toBe(CORPUS_ID);
      expect(loaded.entries).toHaveLength(1);
      expect(loaded.entries[0]!.entryId).toBe('entry-a');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('rejects duplicate entryIds', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rq-corpus-'));
    try {
      const dirA = await writeSavedAudit(root, 'audit-a');
      const manifestPath = await writeCorpusManifest(root, [
        { entryId: 'entry-a', host: 'audit-a.fixture.test', auditDir: dirA },
        { entryId: 'entry-a', host: 'audit-b.fixture.test', auditDir: dirA },
      ]);
      await expect(loadCorpusManifest(manifestPath)).rejects.toThrow('duplicate entryId "entry-a"');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('rejects a duplicate host+auditDir pair', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rq-corpus-'));
    try {
      const dirA = await writeSavedAudit(root, 'audit-a');
      const manifestPath = await writeCorpusManifest(root, [
        { entryId: 'entry-a', host: 'audit-a.fixture.test', auditDir: dirA },
        { entryId: 'entry-b', host: 'audit-a.fixture.test', auditDir: dirA },
      ]);
      await expect(loadCorpusManifest(manifestPath)).rejects.toThrow('duplicate host+auditDir');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('rejects an auditDir that does not exist on disk', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rq-corpus-'));
    try {
      const manifestPath = await writeCorpusManifest(root, [
        {
          entryId: 'entry-missing',
          host: 'missing.fixture.test',
          auditDir: path.join(root, 'does-not-exist'),
        },
      ]);
      await expect(loadCorpusManifest(manifestPath)).rejects.toThrow(
        'auditDir does not exist or is not a directory for: entry-missing',
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('rejects schema violations such as a relative auditDir', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rq-corpus-'));
    try {
      const manifestPath = await writeCorpusManifest(root, [
        { entryId: 'entry-a', host: 'audit-a.fixture.test', auditDir: 'relative/path' },
      ]);
      await expect(loadCorpusManifest(manifestPath)).rejects.toThrow('corpus manifest rejected');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe('dryRunReportQualityCorpus', () => {
  it('plans every ready entry from the evidence load without calling the pipeline', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rq-corpus-'));
    try {
      const dirA = await writeSavedAudit(root, 'audit-a');
      const dirB = await writeSavedAudit(root, 'audit-b');
      const manifestPath = await writeCorpusManifest(root, [
        { entryId: 'entry-a', host: 'audit-a.fixture.test', auditDir: dirA },
        { entryId: 'entry-b', host: 'audit-b.fixture.test', auditDir: dirB },
      ]);
      const corpus = await loadCorpusManifest(manifestPath);

      const plan = await dryRunReportQualityCorpus(corpus);

      expect(plan.corpusId).toBe(CORPUS_ID);
      expect(plan.entries).toHaveLength(2);
      for (const entry of plan.entries) {
        expect(entry.status).toBe('ready');
        expect(entry.plan).toMatchObject({
          evidenceApprovalMode: 'legacy-adapter',
          verdict: 'reportable-with-known-limitations',
          limitationsCount: 1,
          requestedLanguages: ['fr', 'en'],
          findingCount: 1,
        });
      }
      expect(loadAuditEvidencePayload).toHaveBeenCalledTimes(2);
      expect(runReportQualityPipeline).not.toHaveBeenCalled();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('marks a malformed saved audit invalid without aborting the other entries', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rq-corpus-'));
    try {
      const dirA = await writeSavedAudit(root, 'audit-a');
      const dirBroken = await writeSavedAudit(root, 'audit-broken');
      await fs.rm(path.join(dirBroken, 'findings.json'));
      const manifestPath = await writeCorpusManifest(root, [
        { entryId: 'entry-a', host: 'audit-a.fixture.test', auditDir: dirA },
        { entryId: 'entry-broken', host: 'audit-broken.fixture.test', auditDir: dirBroken },
      ]);
      const corpus = await loadCorpusManifest(manifestPath);

      const plan = await dryRunReportQualityCorpus(corpus);

      expect(plan.entries[0]).toMatchObject({ entryId: 'entry-a', status: 'ready' });
      expect(plan.entries[1]).toMatchObject({
        entryId: 'entry-broken',
        status: 'invalid',
      });
      expect(plan.entries[1]!.reason).toContain('findings.json');
      expect(plan.entries[1]!.plan).toBeUndefined();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe('runReportQualityCorpus', () => {
  it('records quality-approved and needs-operator-review outcomes, files, and summary totals', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rq-corpus-'));
    try {
      const dirA = await writeSavedAudit(root, 'audit-a');
      const dirB = await writeSavedAudit(root, 'audit-b');
      const manifestPath = await writeCorpusManifest(root, [
        { entryId: 'entry-a', host: 'audit-a.fixture.test', auditDir: dirA },
        { entryId: 'entry-b', host: 'audit-b.fixture.test', auditDir: dirB },
      ]);
      const corpus = await loadCorpusManifest(manifestPath);
      vi.mocked(loadAuditEvidencePayload).mockImplementation(() => evidencePayload('fixture'));
      vi.mocked(runReportQualityPipeline).mockImplementation(async ({ manifest }) => {
        if (manifest.auditId === 'audit-a') return pipelineResult();
        throw Object.assign(new Error('Material content issue remains unsure: critic:1'), {
          name: 'ReportQualityNeedsOperatorReviewError',
          reasonCode: 'content-review-unsure',
        });
      });
      // The success path reads the run doc by qualityRunId; the failure path
      // can only query by auditId, mirroring the harness's real lookups.
      fakeRunModel((query) => {
        if (query.auditId === 'audit-b') {
          return runDoc({
            auditId: 'audit-b',
            qualityRunId: 'fixture-quality-run-b',
            state: 'needs-operator-review',
            errorCode: 'content-review-unsure',
            modelCalls: [
              { role: 'senior-analyst' },
              { role: 'writer-fr' },
            ] as ReportQualityRunDocument['modelCalls'],
          });
        }
        return runDoc({ auditId: 'audit-a' });
      });

      const outDir = path.join(root, 'out');
      const progress: string[] = [];
      const { outcomes, summary } = await runReportQualityCorpus(corpus, {
        connection: {} as never,
        artifactStore: {
          get: async () => null,
          put: async () => undefined,
          list: async () => [],
          delete: async () => undefined,
        },
        concurrency: 2,
        outDir,
        onProgress: (event) => {
          progress.push(`${event.entryId}:${event.state}`);
        },
      });

      const byId = new Map(outcomes.map((outcome) => [outcome.entryId, outcome]));
      expect(byId.get('entry-a')).toMatchObject({
        state: 'quality-approved',
        evidenceApprovalMode: 'legacy-adapter',
        qualityRunId: 'fixture-quality-run',
        epoch: 3,
        bundleDigest: `sha256:${'d'.repeat(64)}`,
        inputSnapshotDigest: `sha256:${'e'.repeat(64)}`,
      });
      expect(byId.get('entry-a')!.candidates.fr).toMatchObject({
        pdfDigest: `sha256:${'1'.repeat(64)}`,
        pageCount: 7,
      });
      expect(byId.get('entry-a')!.candidates.en).not.toBeNull();
      expect(byId.get('entry-b')).toMatchObject({
        state: 'needs-operator-review',
        reasonCode: 'content-review-unsure',
      });
      expect(byId.get('entry-b')!.reason).toContain('unsure');

      // The pipeline receives exactly what the dashboard route assembles,
      // plus the evidence payload the harness loaded.
      expect(runReportQualityPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          connection: expect.anything(),
          auditDir: dirA,
          artifactStore: expect.anything(),
          approvedEvidence: expect.objectContaining({
            approval: expect.objectContaining({ approvalMode: 'legacy-adapter' }),
          }),
        }),
      );

      expect(progress.sort()).toEqual([
        'entry-a:quality-approved',
        'entry-b:needs-operator-review',
      ]);

      // Outcome files exist on disk, one per entry, plus summary.json.
      const writtenA = JSON.parse(await fs.readFile(path.join(outDir, 'entry-a.json'), 'utf8'));
      const writtenB = JSON.parse(await fs.readFile(path.join(outDir, 'entry-b.json'), 'utf8'));
      expect(writtenA).toMatchObject({ entryId: 'entry-a', state: 'quality-approved' });
      expect(writtenB).toMatchObject({ entryId: 'entry-b', state: 'needs-operator-review' });
      const writtenSummary = JSON.parse(
        await fs.readFile(path.join(outDir, 'summary.json'), 'utf8'),
      );
      expect(writtenSummary).toMatchObject({
        schemaVersion: 1,
        corpusId: CORPUS_ID,
        entries: 2,
        totals: { 'quality-approved': 1, 'needs-operator-review': 1, failed: 0 },
        modelCalls: {
          total: 6,
          byRole: { 'senior-analyst': 2, 'writer-fr': 3, 'parity-reviewer': 1 },
        },
        outcomeFiles: expect.arrayContaining(['entry-a.json', 'entry-b.json']),
      });
      expect(writtenSummary.wallTimeMs).toBeGreaterThanOrEqual(0);
      expect(summary.totals).toEqual(writtenSummary.totals);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('records a failed outcome when the pipeline throws an unexpected error, without aborting', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rq-corpus-'));
    try {
      const dirA = await writeSavedAudit(root, 'audit-a');
      const dirB = await writeSavedAudit(root, 'audit-b');
      const manifestPath = await writeCorpusManifest(root, [
        { entryId: 'entry-a', host: 'audit-a.fixture.test', auditDir: dirA },
        { entryId: 'entry-b', host: 'audit-b.fixture.test', auditDir: dirB },
      ]);
      const corpus = await loadCorpusManifest(manifestPath);
      vi.mocked(loadAuditEvidencePayload).mockImplementation(() => evidencePayload('fixture'));
      vi.mocked(runReportQualityPipeline).mockImplementation(async ({ manifest }) => {
        if (manifest.auditId === 'audit-a') throw new Error('renderer crashed');
        return pipelineResult();
      });
      fakeRunModel(() =>
        runDoc({
          auditId: 'audit-a',
          state: 'failed',
          errorCode: 'report-quality-failed',
          qualityRunId: 'other-run',
        }),
      );

      const outDir = path.join(root, 'out');
      const { outcomes, summary } = await runReportQualityCorpus(corpus, {
        connection: {} as never,
        artifactStore: undefined,
        concurrency: 1,
        outDir,
      });

      const byId = new Map(outcomes.map((outcome) => [outcome.entryId, outcome]));
      expect(byId.get('entry-a')).toMatchObject({
        state: 'failed',
        reason: 'renderer crashed',
        reasonCode: 'report-quality-failed',
      });
      expect(byId.get('entry-a')!.candidates.fr).toBeNull();
      expect(byId.get('entry-b')).toMatchObject({ state: 'quality-approved' });
      expect(summary.totals).toEqual({
        'quality-approved': 1,
        'needs-operator-review': 0,
        failed: 1,
      });
      // Summary and outcomes record digests and counts only - never report
      // prose or PDF bytes.
      const summaryRaw = await fs.readFile(path.join(outDir, 'summary.json'), 'utf8');
      expect(summaryRaw).not.toContain('%PDF');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('records a failed outcome when the saved audit artifacts are unreadable, without calling the pipeline', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rq-corpus-'));
    try {
      const dirBroken = await writeSavedAudit(root, 'audit-broken');
      await fs.rm(path.join(dirBroken, 'findings.json'));
      const manifestPath = await writeCorpusManifest(root, [
        { entryId: 'entry-broken', host: 'audit-broken.fixture.test', auditDir: dirBroken },
      ]);
      const corpus = await loadCorpusManifest(manifestPath);
      fakeRunModel(() => null);

      const outDir = path.join(root, 'out');
      const { outcomes } = await runReportQualityCorpus(corpus, {
        connection: {} as never,
        artifactStore: undefined,
        concurrency: 1,
        outDir,
      });

      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]).toMatchObject({ state: 'failed' });
      expect(outcomes[0]!.reason).toContain('findings.json');
      expect(runReportQualityPipeline).not.toHaveBeenCalled();
      expect(loadAuditEvidencePayload).not.toHaveBeenCalled();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
