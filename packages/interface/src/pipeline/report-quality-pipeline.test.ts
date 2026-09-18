import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Connection } from 'mongoose';
import type {
  ReportBundleCandidate,
  ReportQualityModelCall,
  ReviewIssue,
  Sha256Digest,
} from '@odysseus/core';
import { getReportModelProfile, getReportModelProfileMatrixDigest } from '@odysseus/llm';
import { bytesDigest, reportQualityDigest } from '@odysseus/report';
import { confirmedFindingsDigest } from '@odysseus/scanner';
import {
  approveAllScript,
  criticIssue,
  DEFAULT_FINDINGS,
  DISCLOSURE,
  evidenceFixture,
  findingFixture,
  InMemoryArtifactStore,
  makeLlmScript,
  manifestFixture,
  seniorPlanOutputFor,
  type LlmScriptHandler,
} from './report-quality-pipeline.fixtures.js';
import { runReportQualityPipeline } from './report-quality-pipeline.js';

/**
 * Plan 058 fail-closed behavior tests for the report-quality pipeline.
 *
 * Every heavy seam is faked in-memory: @odysseus/llm (callReportQualityRole)
 * returns scripted role outputs parsed by the REAL zod parsers, the
 * render/QA seams from @odysseus/report return small valid buffers and
 * raster paths on local disk, and @odysseus/store is an in-memory
 * lease/run/bundle fake that records the exact transition lineage. The
 * artifact storage (report-quality-storage.ts) and every deterministic
 * guard (plan bindings, coverage ledger, prose rules, digest binding) run
 * for real against an in-memory ArtifactStore.
 */

const harness = vi.hoisted(() => ({
  /** Scripted raw LLM outputs; assigned per test, defaults to all-approve. */
  llm: null as null | LlmScriptHandler,
  llmCalls: {} as Record<string, number | undefined>,
  llmLog: [] as Array<{ role: string; userPayload: unknown; imagePaths?: readonly string[] }>,
  pdfQa: { pageCount: 1, extractedText: '' },
  generateReportPdfCalls: 0,
}));

const storeState = vi.hoisted(() => ({
  runCounter: 0,
  leases: [] as Array<{ qualityRunId: string; epoch: number }>,
  runs: [] as Array<{
    qualityRunId: string;
    auditId: string;
    epoch: number;
    state: string;
    modelCalls: ReportQualityModelCall[];
    candidateDigests: Sha256Digest[];
    patches: Array<Record<string, unknown>>;
  }>,
  transitions: [] as Array<{
    qualityRunId: string;
    state: string;
    patch: Record<string, unknown>;
  }>,
  bundles: [] as Array<Record<string, unknown>>,
  released: [] as string[],
  renewed: 0,
}));

const scannerState = vi.hoisted(() => ({
  approval: undefined as unknown,
  audit: undefined as unknown,
  quality: undefined as unknown,
}));

vi.mock('@odysseus/scanner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odysseus/scanner')>()),
  readOdysseusBuildId: () => 'test-build-058',
  readApprovedAuditEvidence: () => scannerState.approval,
  readAuditEvidenceSnapshot: () => scannerState.audit,
  readEvidenceQualityAssessment: () => scannerState.quality,
}));

vi.mock('@odysseus/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@odysseus/llm')>();
  const { createHash } = await import('node:crypto');
  const digest = (value: unknown) =>
    `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}` as Sha256Digest;
  return {
    ...actual,
    callReportQualityRole: async (input: {
      role: Parameters<typeof actual.getReportModelProfile>[0];
      userPayload: unknown;
      parser: { parse(value: unknown): unknown };
      jsonSchema: Record<string, unknown>;
      imagePaths?: readonly string[];
    }) => {
      harness.llmCalls[input.role] = (harness.llmCalls[input.role] ?? 0) + 1;
      harness.llmLog.push({
        role: input.role,
        userPayload: input.userPayload,
        ...(input.imagePaths ? { imagePaths: input.imagePaths } : {}),
      });
      if (!harness.llm) throw new Error('test setup error: no scripted LLM handler');
      const profile = actual.getReportModelProfile(input.role);
      const output = await harness.llm(input, harness.llmCalls[input.role]!);
      // The scripted output is validated by the real zod parser exactly as
      // the real client would parse a provider response.
      return {
        output: input.parser.parse(output),
        provenance: {
          role: input.role,
          profileId: profile.profileId,
          profileDigest: digest(profile),
          requestedModel: profile.model,
          resolvedModel: profile.model,
          reasoningEffort: profile.reasoningEffort,
          promptVersion: 'test-058',
          schemaVersion: 'test-058',
          promptDigest: digest(input.userPayload),
          schemaDigest: digest(input.jsonSchema),
        } satisfies ReportQualityModelCall,
      };
    },
  };
});

vi.mock('@odysseus/report', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@odysseus/report')>();
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  // Signature-bearing stub raster: content is never decoded, only read back
  // as bytes/digests by the pipeline.
  const PNG = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001' +
      '0d0a2db40000000049454e44ae426082',
    'hex',
  );
  return {
    ...actual,
    reportRendererAssetFingerprints: async () => ({
      rendererAssets: `sha256:${'r'.repeat(64)}` as Sha256Digest,
      fonts: `sha256:${'f'.repeat(64)}` as Sha256Digest,
    }),
    preflightPdfQualityToolchain: async () => ({
      qpdf: 'fake-qpdf',
      pdfinfo: 'fake-pdfinfo',
      pdftotext: 'fake-pdftotext',
      pdffonts: 'fake-pdffonts',
      pdftoppm: 'fake-pdftoppm',
      mutool: 'fake-mutool',
    }),
    generateReportPdf: async (input: { analysis: { language: 'fr' | 'en' } }) => {
      harness.generateReportPdfCalls += 1;
      return {
        pdf: Buffer.from(`%PDF-1.4 fake-report-${input.analysis.language}\n`, 'utf8'),
        pageCount: harness.pdfQa.pageCount,
      };
    },
    canonicalPostProcessPdf: async (inputPath: string, outputPath: string) => {
      await fs.copyFile(inputPath, outputPath);
    },
    runExactPdfQa: async (input: { pdfPath: string; workDir: string }) => {
      await fs.mkdir(input.workDir, { recursive: true });
      const pdf = await fs.readFile(input.pdfPath);
      const pages = harness.pdfQa.pageCount;
      await fs.writeFile(path.join(input.workDir, 'extracted.txt'), harness.pdfQa.extractedText);
      const popplerPages: string[] = [];
      const mupdfPages: string[] = [];
      const detailTiles: string[][] = [];
      for (let page = 1; page <= pages; page += 1) {
        const poppler = path.join(input.workDir, `poppler-${page}.png`);
        const mupdf = path.join(input.workDir, `mupdf-${page}.png`);
        await fs.writeFile(poppler, PNG);
        await fs.writeFile(mupdf, PNG);
        popplerPages.push(poppler);
        mupdfPages.push(mupdf);
        const tiles: string[] = [];
        for (const source of [poppler, mupdf]) {
          const tile = path.join(input.workDir, `detail-${page}-${tiles.length + 1}.png`);
          await fs.copyFile(source, tile);
          tiles.push(tile);
        }
        detailTiles.push(tiles);
      }
      return {
        pdfDigest: bytesDigest(pdf),
        pageCount: pages,
        pageWidthPt: 595,
        pageHeightPt: 842,
        extractedTextDigest: bytesDigest(Buffer.from(harness.pdfQa.extractedText, 'utf8')),
        gateDigest: `sha256:${'g'.repeat(64)}` as Sha256Digest,
        coverage: { popplerPages: pages, mupdfPages: pages, detailTiles: pages * 2 },
        toolVersions: { qpdf: 'fake-qpdf' },
        popplerPages,
        mupdfPages,
        detailTiles,
      };
    },
  };
});

vi.mock('@odysseus/store', () => ({
  acquireReportQualityLease: async () => {
    const lease = {
      qualityRunId: `quality-run-${(storeState.runCounter += 1)}`,
      token: 'test-token',
      tokenHash: `sha256:${'t'.repeat(64)}` as Sha256Digest,
      epoch: 7,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    };
    storeState.leases.push({ qualityRunId: lease.qualityRunId, epoch: lease.epoch });
    return lease;
  },
  startReportQualityRun: async (
    _c: unknown,
    auditId: string,
    lease: { qualityRunId: string; epoch: number },
  ) => {
    storeState.runs.push({
      qualityRunId: lease.qualityRunId,
      auditId,
      epoch: lease.epoch,
      state: 'running',
      modelCalls: [],
      candidateDigests: [],
      patches: [],
    });
  },
  transitionReportQualityRun: async (
    _c: unknown,
    _auditId: string,
    lease: { qualityRunId: string; epoch: number },
    state: string,
    patch: Record<string, unknown> = {},
  ) => {
    const run = storeState.runs.find((entry) => entry.qualityRunId === lease.qualityRunId);
    if (!run) throw new Error('stale report quality run (test fake)');
    run.state = state;
    run.patches.push(patch);
    if (patch.modelCall) run.modelCalls.push(patch.modelCall as ReportQualityModelCall);
    if (patch.candidateDigest) run.candidateDigests.push(patch.candidateDigest as Sha256Digest);
    storeState.transitions.push({ qualityRunId: lease.qualityRunId, state, patch });
  },
  renewReportQualityLease: async (_c: unknown, _a: string, lease: { qualityRunId: string }) => {
    storeState.renewed += 1;
    return { ...lease, expiresAt: new Date(Date.now() + 30 * 60 * 1000) };
  },
  releaseReportQualityLease: async (_c: unknown, _a: string, lease: { qualityRunId: string }) => {
    storeState.released.push(lease.qualityRunId);
  },
  recordQualityApprovedBundle: async (_c: unknown, input: Record<string, unknown>) => {
    storeState.bundles.push({ ...input, state: 'awaiting-operator-approval' });
  },
  syncProspectIdentityIntoAudit: async () => undefined,
  getAuditManualFields: async () => undefined,
  getAuditGradeOverride: async () => undefined,
  getReportPreparation: async () => ({ updatedAt: new Date(0).toISOString() }),
  findDeltaBaseline: async () => null,
  // Stubs for module-scope imports elsewhere in the pipeline graph; never called.
  getCachedSireneProfile: async () => null,
  upsertSireneCache: async () => undefined,
}));

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;

type PipelineInput = Parameters<typeof runReportQualityPipeline>[0];

function makePipelineInput(overrides: Partial<PipelineInput> = {}): PipelineInput {
  return {
    connection: {} as Connection,
    auditDir: '/unused-audit-dir',
    manifest: manifestFixture(),
    findings: DEFAULT_FINDINGS,
    artifactStore: new InMemoryArtifactStore(),
    approvedEvidence: evidenceFixture(DEFAULT_FINDINGS),
    ...overrides,
  };
}

function states(): string[] {
  return storeState.transitions.map((transition) => transition.state);
}

function finalTransition(): { state: string; patch: Record<string, unknown> } {
  const transition = storeState.transitions.at(-1);
  expect(transition, 'the run must record at least one transition').toBeDefined();
  return transition!;
}

function modelCalls(): ReportQualityModelCall[] {
  return storeState.runs.flatMap((run) => run.modelCalls);
}

async function artifactObject<T = Record<string, unknown>>(
  store: InMemoryArtifactStore,
  kind: string,
): Promise<T> {
  const [key] = await store.list(`report-quality/objects/${kind}/`);
  expect(key, `expected a stored ${kind} artifact`).toBeDefined();
  return JSON.parse((await store.get(key!))!.toString('utf8')) as T;
}

beforeEach(() => {
  harness.llm = approveAllScript(DEFAULT_FINDINGS);
  harness.llmCalls = {};
  harness.llmLog = [];
  harness.generateReportPdfCalls = 0;
  harness.pdfQa = {
    pageCount: 1,
    extractedText: `${DISCLOSURE.summary.fr}\n${DISCLOSURE.summary.en}`,
  };
  storeState.runCounter = 0;
  storeState.leases = [];
  storeState.runs = [];
  storeState.transitions = [];
  storeState.bundles = [];
  storeState.released = [];
  storeState.renewed = 0;
  scannerState.approval = undefined;
  scannerState.audit = undefined;
  scannerState.quality = undefined;
});

describe('runReportQualityPipeline (Plan 058 fail-closed behavior)', () => {
  it('refuses to start without the private artifact store', async () => {
    await expect(
      runReportQualityPipeline(makePipelineInput({ artifactStore: undefined })),
    ).rejects.toThrow('private artifact store');
    expect(storeState.leases).toHaveLength(0);
    expect(storeState.transitions).toHaveLength(0);
  });

  it('approves a clean bilingual bundle and lands in awaiting-operator-approval', async () => {
    const store = new InMemoryArtifactStore();
    const result = await runReportQualityPipeline(makePipelineInput({ artifactStore: store }));

    expect(result.state).toBe('awaiting-operator-approval');
    expect(result.evidenceApprovalMode).toBe('system');
    expect(result.bundleDigest).toMatch(DIGEST_RE);
    for (const candidate of [result.fr, result.en]) {
      expect(candidate.pdfDigest).toMatch(DIGEST_RE);
      expect(candidate.qaDigest).toMatch(DIGEST_RE);
      expect(candidate.pageManifestDigest).toMatch(DIGEST_RE);
      expect(candidate.draftDigest).toMatch(DIGEST_RE);
    }
    // Language-specific renders: distinct digests, each byte-bound to its
    // stored private candidate.
    expect(result.fr.pdfDigest).not.toBe(result.en.pdfDigest);
    expect(bytesDigest(Buffer.from('%PDF-1.4 fake-report-fr\n', 'utf8'))).toBe(result.fr.pdfDigest);
    for (const candidate of [result.fr, result.en]) {
      expect(bytesDigest((await store.get(candidate.privateObjectKey))!)).toBe(candidate.pdfDigest);
    }

    // Run lineage: snapshot bind, milestone transitions in order, digests pushed.
    expect(storeState.transitions[0]!.state).toBe('running');
    expect(storeState.transitions[0]!.patch.inputSnapshotDigest).toMatch(DIGEST_RE);
    expect(storeState.transitions[0]!.patch.approvedEvidenceDigest).toMatch(DIGEST_RE);
    const milestones = [
      'running',
      'content-clean',
      'parity-clean',
      'fr-candidate-clean',
      'en-candidate-clean',
      'bundle-final-review',
      'quality-approved',
      'awaiting-operator-approval',
    ];
    let previous = -1;
    for (const milestone of milestones) {
      const index = states().indexOf(milestone);
      expect(index, `transition ${milestone} must be recorded in order`).toBeGreaterThan(previous);
      previous = index;
    }
    expect(states()).not.toContain('needs-operator-review');
    expect(states()).not.toContain('failed');
    expect(storeState.runs[0]!.candidateDigests).toEqual([
      result.fr.pdfDigest,
      result.en.pdfDigest,
      result.bundleDigest,
    ]);
    expect(storeState.bundles).toHaveLength(1);
    expect(storeState.bundles[0]).toMatchObject({
      bundleDigest: result.bundleDigest,
      state: 'awaiting-operator-approval',
      evidenceApprovalMode: 'system',
      fr: { pdfDigest: result.fr.pdfDigest, pageCount: 1 },
      en: { pdfDigest: result.en.pdfDigest, pageCount: 1 },
    });
    expect(storeState.released).toEqual([result.qualityRunId]);

    // The stored bundle manifest is a self-verifying candidate: recomputing
    // the digest over the candidate without bundleDigest reproduces it.
    const manifest = await artifactObject(store, 'bundle-manifest');
    const bundle = manifest.bundle as ReportBundleCandidate;
    const { bundleDigest, ...candidateWithoutDigest } = bundle;
    expect(reportQualityDigest(candidateWithoutDigest)).toBe(bundleDigest);
    expect(bundleDigest).toBe(result.bundleDigest);
    expect(bundle.state).toBe('quality-approved');
    expect(bundle.frCandidateDigest).toBe(result.fr.pdfDigest);
    expect(bundle.enCandidateDigest).toBe(result.en.pdfDigest);
    expect(bundle.approvedEvidenceDigest).toBe(
      storeState.transitions[0]!.patch.approvedEvidenceDigest,
    );
    expect(bundle.inputSnapshotDigest).toBe(storeState.transitions[0]!.patch.inputSnapshotDigest);
  });

  it('binds the input snapshot to the approved evidence digest and model profile matrix', async () => {
    const store = new InMemoryArtifactStore();
    const result = await runReportQualityPipeline(makePipelineInput({ artifactStore: store }));

    const snapshot = await artifactObject(store, 'input-snapshot');
    const evidence = evidenceFixture(DEFAULT_FINDINGS);
    expect(snapshot.approvedEvidenceDigest).toBe(reportQualityDigest(evidence.approval));
    expect(snapshot.evidenceQualityAssessmentDigest).toBe(
      evidence.approval.evidenceQualityAssessmentDigest,
    );
    expect(snapshot.modelProfileDigest).toBe(getReportModelProfileMatrixDigest());
    expect(snapshot.auditId).toBe(evidence.approval.auditId);

    // The recorded snapshot digest is the digest of exactly these bytes and
    // is what every model call is bound to.
    const snapshotDigest = reportQualityDigest(snapshot);
    expect(result.inputSnapshotDigest).toBe(snapshotDigest);
    expect(storeState.transitions[0]!.patch.inputSnapshotDigest).toBe(snapshotDigest);
    const seniorCall = harness.llmLog.find((call) => call.role === 'senior-analyst');
    expect(
      (seniorCall!.userPayload as { inputSnapshotDigest: Sha256Digest }).inputSnapshotDigest,
    ).toBe(snapshotDigest);
    for (const role of ['writer-fr', 'writer-en']) {
      const call = harness.llmLog.find((entry) => entry.role === role);
      expect((call!.userPayload as { inputSnapshotDigest: Sha256Digest }).inputSnapshotDigest).toBe(
        snapshotDigest,
      );
    }
    const seniorPlanArtifact = await artifactObject<{
      plan: { inputSnapshotDigest: Sha256Digest };
    }>(store, 'senior-plan');
    expect(seniorPlanArtifact.plan.inputSnapshotDigest).toBe(snapshotDigest);

    // Changed evidence cannot masquerade as the same snapshot: a rerun with
    // a different approval lands on a different content-addressed snapshot.
    const changed = await runReportQualityPipeline(
      makePipelineInput({
        artifactStore: store,
        approvedEvidence: evidenceFixture(DEFAULT_FINDINGS, {
          approvedAt: '2026-09-18T11:00:00.000Z',
        }),
      }),
    );
    expect(changed.inputSnapshotDigest).not.toBe(snapshotDigest);
    const snapshotKeys = await store.list('report-quality/objects/input-snapshot/');
    expect(snapshotKeys).toHaveLength(2);
  });

  it('refuses evidence that changed after approval when loading from the audit directory', async () => {
    const approval = evidenceFixture().approval;
    scannerState.approval = approval;
    scannerState.quality = {
      digest: approval.evidenceQualityAssessmentDigest,
      verdict: 'reportable-with-known-limitations',
      issues: [],
    };
    scannerState.audit = {
      digest: approval.auditEvidenceSnapshotDigest,
      // Findings on disk no longer match the approved findings digest.
      confirmedFindingsDigest: confirmedFindingsDigest([findingFixture('finding-replaced')]),
    };
    // Omit the pre-loaded payload so the pipeline reads the (tampered)
    // evidence from the scanner mocks, as a resumed run would.
    const { approvedEvidence: _omitApprovedEvidence, ...fromDisk } = makePipelineInput();
    void _omitApprovedEvidence;
    await expect(runReportQualityPipeline(fromDisk)).rejects.toThrow(
      'findings changed after evidence approval',
    );
    // The run never started: no run row, no lineage, nothing to approve.
    expect(storeState.runs).toHaveLength(0);
    expect(storeState.transitions).toHaveLength(0);
  });

  it('exhausts the bounded content repair loop and ends in needs-operator-review', async () => {
    harness.llm = makeLlmScript({
      findings: DEFAULT_FINDINGS,
      issues: {
        'content-critic-evidence': [criticIssue({ issueId: 'loop-1' })],
        'content-critic-editorial': [criticIssue({ issueId: 'loop-1' })],
      },
    });
    await expect(runReportQualityPipeline(makePipelineInput())).rejects.toThrow(
      'within 8 targeted repair iterations',
    );
    expect(harness.llmCalls['editor']).toBe(8);
    // The French draft failed first: the English writer never ran and the
    // run never reached approval.
    expect(harness.llmCalls['writer-en']).toBeUndefined();
    expect(finalTransition().state).toBe('needs-operator-review');
    expect(finalTransition().patch.errorCode).toBe('content-repair-limit');
    expect(states()).not.toContain('quality-approved');
    expect(states()).not.toContain('content-clean');
    expect(storeState.bundles).toHaveLength(0);
    expect(storeState.released).toHaveLength(1);
  });

  it('routes a material unsure verdict to needs-operator-review without speculative rewriting', async () => {
    harness.llm = makeLlmScript({
      findings: DEFAULT_FINDINGS,
      issues: {
        'content-critic-evidence': [criticIssue({ issueId: 'unsure-1', severity: 'major' })],
      },
      adjudicate: () => 'unsure',
    });
    await expect(runReportQualityPipeline(makePipelineInput())).rejects.toThrow(
      'Material content issue remains unsure',
    );
    expect(harness.llmCalls['editor']).toBeUndefined();
    expect(finalTransition().state).toBe('needs-operator-review');
    expect(finalTransition().patch.errorCode).toBe('content-review-unsure');
    expect(states()).not.toContain('quality-approved');
  });

  it('treats a rejected preference as non-blocking and still approves', async () => {
    harness.llm = makeLlmScript({
      findings: DEFAULT_FINDINGS,
      issues: {
        'content-critic-evidence': [
          criticIssue({ issueId: 'pref-1', kind: 'preference', severity: 'minor' }),
        ],
      },
      adjudicate: () => 'rejected',
    });
    const result = await runReportQualityPipeline(makePipelineInput());
    expect(result.state).toBe('awaiting-operator-approval');
    // The scripted preference is reported once per language, adjudicated and
    // rejected both times, and never escalates: no editor call, no operator
    // review, full approval path completed.
    expect(harness.llmCalls['issue-adjudicator']).toBe(2);
    // The adjudicated issues land in run lineage with their verdict intact,
    // so the corpus benchmark can tally editorial outcomes.
    const recordedIssues = storeState.transitions.flatMap(
      (transition) => (transition.patch.reviewIssues as ReviewIssue[] | undefined) ?? [],
    );
    expect(recordedIssues).toHaveLength(2);
    expect(recordedIssues.map((issue) => issue.kind)).toEqual(['preference', 'preference']);
    expect(recordedIssues.every((issue) => issue.status === 'rejected')).toBe(true);
    expect(harness.llmCalls['editor']).toBeUndefined();
    expect(states()).toContain('quality-approved');
    expect(states()).toContain('awaiting-operator-approval');
  });

  it('stops on an accepted objective defect that needs a non-prose owner', async () => {
    harness.llm = makeLlmScript({
      findings: DEFAULT_FINDINGS,
      issues: {
        'content-critic-editorial': [
          criticIssue({ issueId: 'owner-1', repairRoute: 'upstream-evidence-defect' }),
        ],
      },
    });
    await expect(runReportQualityPipeline(makePipelineInput())).rejects.toThrow('non-prose owner');
    expect(harness.llmCalls['editor']).toBeUndefined();
    expect(finalTransition().state).toBe('needs-operator-review');
    expect(finalTransition().patch.errorCode).toBe('content-owner-repair-required');
    expect(states()).not.toContain('quality-approved');
  });

  it('fails the run when the senior plan leaves an eligible finding unassigned', async () => {
    const findings = [
      findingFixture('finding-contrastes'),
      findingFixture('finding-nav', { severity: 'moderate' }),
    ];
    harness.llm = makeLlmScript({
      findings,
      roles: { 'senior-analyst': () => seniorPlanOutputFor([findings[0]!]) },
    });
    await expect(
      runReportQualityPipeline(
        makePipelineInput({ findings, approvedEvidence: evidenceFixture(findings) }),
      ),
    ).rejects.toThrow('Senior report plan omitted eligible finding(s): finding-nav');
    // A coverage-ledger breach is a hard failure, not an operator review:
    // no writer ran and the run can never be approved.
    expect(harness.llmCalls['writer-fr']).toBeUndefined();
    expect(finalTransition().state).toBe('failed');
    expect(finalTransition().patch.errorCode).toBe('report-quality-failed');
    expect(states()).not.toContain('quality-approved');
    expect(storeState.bundles).toHaveLength(0);
  });

  it('sends an accepted first-pass visual defect to operator review without looping visual repairs', async () => {
    harness.llm = makeLlmScript({
      findings: DEFAULT_FINDINGS,
      issues: {
        'visual-reviewer-design': [
          criticIssue({
            issueId: 'vis-1',
            target: 'page-1',
            domain: 'layout',
            repairRoute: 'template-defect',
          }),
        ],
      },
    });
    await expect(runReportQualityPipeline(makePipelineInput())).rejects.toThrow(
      'Visual candidate requires targeted layout/template ownership',
    );
    expect(harness.generateReportPdfCalls).toBe(1);
    // No repair loop: no editor, no rerender, no fresh final visual pass.
    expect(harness.llmCalls['editor']).toBeUndefined();
    expect(harness.llmCalls['final-visual-reviewer']).toBeUndefined();
    expect(finalTransition().state).toBe('needs-operator-review');
    expect(finalTransition().patch.errorCode).toBe('visual-defect');
    expect(states()).not.toContain('fr-candidate-clean');
    expect(states()).not.toContain('quality-approved');
  });

  it('sends a fresh final visual defect to operator review', async () => {
    harness.llm = makeLlmScript({
      findings: DEFAULT_FINDINGS,
      issues: {
        'final-visual-reviewer': [
          criticIssue({
            issueId: 'fvis-1',
            target: 'page-1',
            domain: 'layout',
            repairRoute: 'template-defect',
          }),
        ],
      },
    });
    await expect(runReportQualityPipeline(makePipelineInput())).rejects.toThrow(
      'Fresh final visual review found an objective or materially unsure defect',
    );
    expect(finalTransition().state).toBe('needs-operator-review');
    expect(finalTransition().patch.errorCode).toBe('final-visual-review');
    expect(states()).not.toContain('fr-candidate-clean');
    expect(states()).not.toContain('quality-approved');
  });

  it('blocks the bundle on a parity rejection', async () => {
    harness.llm = makeLlmScript({
      findings: DEFAULT_FINDINGS,
      issues: {
        'parity-reviewer': [criticIssue({ issueId: 'par-1', domain: 'parity' })],
      },
    });
    await expect(runReportQualityPipeline(makePipelineInput())).rejects.toThrow(
      'French/English parity review found an objective or materially unsure defect',
    );
    expect(finalTransition().state).toBe('needs-operator-review');
    expect(finalTransition().patch.errorCode).toBe('bilingual-parity');
    expect(states()).toContain('content-clean');
    expect(states()).not.toContain('parity-clean');
    // Nothing was rendered: parity gates the bundle before any candidate.
    expect(harness.generateReportPdfCalls).toBe(0);
    expect(states()).not.toContain('quality-approved');
  });

  it('blocks quality-approved when the final arbiter rejects the bundle', async () => {
    harness.llm = makeLlmScript({
      findings: DEFAULT_FINDINGS,
      arbiter: { approved: false, issues: [] },
    });
    await expect(runReportQualityPipeline(makePipelineInput())).rejects.toThrow(
      'Final document arbiter did not approve the exact bilingual bundle',
    );
    expect(finalTransition().state).toBe('needs-operator-review');
    expect(finalTransition().patch.errorCode).toBe('final-arbiter');
    expect(states()).toContain('bundle-final-review');
    expect(states()).not.toContain('quality-approved');
    expect(storeState.bundles).toHaveLength(0);
    expect(storeState.released).toHaveLength(1);
  });

  it('records role and model provenance for every model call in run lineage', async () => {
    await runReportQualityPipeline(makePipelineInput());
    const calls = modelCalls();
    expect(calls.length).toBeGreaterThanOrEqual(10);
    for (const call of calls) {
      expect(call.profileId).toBe(getReportModelProfile(call.role).profileId);
      expect(call.requestedModel).toBe(getReportModelProfile(call.role).model);
      expect(call.resolvedModel).toBe(getReportModelProfile(call.role).model);
      expect(call.reasoningEffort).toBe(getReportModelProfile(call.role).reasoningEffort);
      for (const digestField of ['profileDigest', 'promptDigest', 'schemaDigest'] as const) {
        expect(call[digestField]).toMatch(DIGEST_RE);
      }
    }
    // Exact roles and call counts for the all-approve bilingual run.
    expect(calls.map((call) => call.role).sort()).toEqual(
      [
        'senior-analyst',
        'writer-fr',
        'writer-en',
        'content-critic-evidence',
        'content-critic-editorial',
        'content-critic-evidence',
        'content-critic-editorial',
        'parity-reviewer',
        'visual-reviewer-physical',
        'visual-reviewer-design',
        'final-visual-reviewer',
        'visual-reviewer-physical',
        'visual-reviewer-design',
        'final-visual-reviewer',
        'final-document-arbiter',
      ].sort(),
    );
  });
});
