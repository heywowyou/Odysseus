/**
 * Plan 058 saved-corpus benchmark harness: runs the report-quality pipeline
 * over a corpus of already-saved audits on local disk (`artifacts/<host>/<ISO
 * timestamp>/`, each with manifest.json + findings.json) and records one
 * machine-readable outcome per entry plus a summary, so a model-profile or
 * prompt change can be compared offline before any production promotion.
 *
 * The harness is orchestration only: it assembles exactly the inputs
 * `runReportQualityForAudit` assembles for the dashboard route (connection,
 * auditDir, manifest, findings, artifact store) and hands them to
 * `runReportQualityPipeline`, which stays the single owner of the run
 * lifecycle. One entry's failure never aborts the corpus.
 *
 * Observability boundary, spelled out because it matters when reading the
 * outcome records: model-call provenance (role, digests) is persisted by the
 * pipeline on the `reportQualityRuns` document and is tallied here by role;
 * review issues themselves are NOT persisted anywhere yet, so the issue
 * tallies are read from the run document's optional `issues` array and are
 * empty until issue persistence lands on the run record. Everything else in
 * an outcome (state, reason, bundle/candidate/snapshot digests, durations) is
 * measured or read back directly.
 *
 * Outcome files record digests, counts and durations only - never report
 * prose, never PDF bytes. Client-facing content stays behind the exact
 * candidate digests, readable only through the artifact store.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Connection } from 'mongoose';
import { z } from 'zod';
import type { AuditManifest, Finding, Sha256Digest } from '@odysseus/core';
import { createReportQualityRunModel, type ReportQualityRunDocument } from '@odysseus/store';
import type { ArtifactStore } from '../artifacts/artifact-store.js';
import { toLanes } from '../prospecting/to-lanes.js';
import {
  runReportQualityPipeline,
  type ReportQualityPipelineResult,
} from './report-quality-pipeline.js';
import { loadAuditEvidencePayload } from './report-quality-evidence.js';

export interface ReportQualityCorpusEntry {
  entryId: string;
  host: string;
  /** Absolute path to the saved audit directory (manifest.json + findings.json). */
  auditDir: string;
  notes?: string | undefined;
}

export interface ReportQualityCorpusManifest {
  corpusId: string;
  schemaVersion: number;
  entries: ReportQualityCorpusEntry[];
}

export const reportQualityCorpusEntrySchema = z
  .object({
    entryId: z
      .string()
      .min(1)
      .regex(
        /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u,
        'entryId must start with a letter or digit and contain only letters, digits, dots, underscores and dashes',
      ),
    host: z.string().min(1),
    auditDir: z
      .string()
      .min(1)
      .refine((value) => path.isAbsolute(value), 'auditDir must be an absolute path'),
    notes: z.string().optional(),
  })
  .strict();

export const reportQualityCorpusManifestSchema = z
  .object({
    corpusId: z.string().min(1),
    schemaVersion: z.number().int().min(1),
    entries: z.array(reportQualityCorpusEntrySchema).min(1),
  })
  .strict();

const SHA256_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;

const outcomeCandidateSchema = z.object({
  pdfDigest: z.string().regex(SHA256_DIGEST_PATTERN),
  privateObjectKey: z.string().min(1),
  pageCount: z.number().int().min(1),
});

export const reportQualityCorpusOutcomeSchema = z
  .object({
    schemaVersion: z.literal(1),
    corpusId: z.string().min(1),
    entryId: z.string().min(1),
    host: z.string().min(1),
    auditDir: z.string().min(1),
    state: z.enum(['quality-approved', 'needs-operator-review', 'failed']),
    reason: z.string().min(1).optional(),
    reasonCode: z.string().min(1).optional(),
    evidenceApprovalMode: z.enum(['system', 'operator', 'legacy-adapter']).nullable(),
    qualityRunId: z.string().min(1).nullable(),
    epoch: z.number().int().nullable(),
    bundleDigest: z.string().regex(SHA256_DIGEST_PATTERN).nullable(),
    inputSnapshotDigest: z.string().regex(SHA256_DIGEST_PATTERN).nullable(),
    candidates: z.object({
      fr: outcomeCandidateSchema.nullable(),
      en: outcomeCandidateSchema.nullable(),
    }),
    issueCounts: z.object({
      byKind: z.record(z.string(), z.number().int()),
      bySeverity: z.record(z.string(), z.number().int()),
      byStatus: z.record(z.string(), z.number().int()),
    }),
    modelCalls: z.object({
      total: z.number().int(),
      byRole: z.record(z.string(), z.number().int()),
    }),
    durationsMs: z.object({
      artifactsMs: z.number(),
      evidenceMs: z.number(),
      pipelineMs: z.number(),
      totalMs: z.number(),
    }),
  })
  .strict();

export type ReportQualityCorpusEntryState = 'quality-approved' | 'needs-operator-review' | 'failed';

export interface ReportQualityCorpusOutcome {
  schemaVersion: 1;
  corpusId: string;
  entryId: string;
  host: string;
  auditDir: string;
  state: ReportQualityCorpusEntryState;
  reason?: string | undefined;
  reasonCode?: string | undefined;
  evidenceApprovalMode: 'system' | 'operator' | 'legacy-adapter' | null;
  qualityRunId: string | null;
  epoch: number | null;
  bundleDigest: Sha256Digest | null;
  inputSnapshotDigest: Sha256Digest | null;
  candidates: {
    fr: { pdfDigest: Sha256Digest; privateObjectKey: string; pageCount: number } | null;
    en: { pdfDigest: Sha256Digest; privateObjectKey: string; pageCount: number } | null;
  };
  issueCounts: {
    byKind: Record<string, number>;
    bySeverity: Record<string, number>;
    byStatus: Record<string, number>;
  };
  modelCalls: { total: number; byRole: Record<string, number> };
  durationsMs: { artifactsMs: number; evidenceMs: number; pipelineMs: number; totalMs: number };
}

export interface ReportQualityCorpusSummary {
  schemaVersion: 1;
  corpusId: string;
  generatedAt: string;
  wallTimeMs: number;
  entries: number;
  totals: Record<ReportQualityCorpusEntryState, number>;
  modelCalls: { total: number; byRole: Record<string, number> };
  outcomeFiles: string[];
}

export interface ReportQualityCorpusProgress {
  entryId: string;
  host: string;
  completed: number;
  total: number;
  state: ReportQualityCorpusEntryState;
  durationMs: number;
}

export interface RunReportQualityCorpusOptions {
  connection: Connection;
  /** The pipeline refuses to run without the private artifact store; the
   *  corpus keeps that fail-closed posture rather than faking one. */
  artifactStore: ArtifactStore | undefined;
  concurrency: number;
  outDir: string;
  onProgress?: (progress: ReportQualityCorpusProgress) => void;
}

export interface ReportQualityCorpusDryRunPlan {
  corpusId: string;
  schemaVersion: number;
  entries: ReportQualityCorpusDryRunEntry[];
}

export interface ReportQualityCorpusDryRunEntry {
  entryId: string;
  host: string;
  auditDir: string;
  status: 'ready' | 'invalid';
  reason?: string | undefined;
  plan?: {
    evidenceApprovalMode: 'system' | 'operator' | 'legacy-adapter';
    verdict: 'reportable-complete' | 'reportable-with-known-limitations';
    limitationsCount: number;
    requestedLanguages: ('fr' | 'en')[];
    findingCount: number;
  };
}

const NEEDS_OPERATOR_REVIEW_ERROR_NAME = 'ReportQualityNeedsOperatorReviewError';

/**
 * Loads and strictly validates a corpus manifest. Rejected: unreadable or
 * non-JSON files, schema violations, duplicate entryIds, duplicate
 * host+auditDir pairs, and any auditDir that does not exist on disk.
 */
export async function loadCorpusManifest(
  manifestPath: string,
): Promise<ReportQualityCorpusManifest> {
  let raw: string;
  try {
    raw = await fs.readFile(manifestPath, 'utf8');
  } catch {
    throw new Error(`corpus manifest unreadable: ${manifestPath}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`corpus manifest is not valid JSON: ${manifestPath}`);
  }
  const result = reportQualityCorpusManifestSchema.safeParse(parsed);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`corpus manifest rejected: ${detail}`);
  }
  const manifest = result.data;

  const seenEntryIds = new Set<string>();
  const seenLocations = new Set<string>();
  for (const entry of manifest.entries) {
    if (seenEntryIds.has(entry.entryId)) {
      throw new Error(`corpus manifest rejected: duplicate entryId "${entry.entryId}"`);
    }
    seenEntryIds.add(entry.entryId);
    const location = `${entry.host}\n${entry.auditDir}`;
    if (seenLocations.has(location)) {
      throw new Error(
        `corpus manifest rejected: duplicate host+auditDir for entry "${entry.entryId}" (${entry.auditDir})`,
      );
    }
    seenLocations.add(location);
  }

  const missing: string[] = [];
  for (const entry of manifest.entries) {
    try {
      if (!(await fs.stat(entry.auditDir)).isDirectory()) missing.push(entry.entryId);
    } catch {
      missing.push(entry.entryId);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `corpus manifest rejected: auditDir does not exist or is not a directory for: ${missing.join(', ')}`,
    );
  }
  return manifest;
}

/** Reads manifest.json + findings.json from a saved audit directory. Local
 *  disk only: the saved corpus is the authoritative copy, so there is no
 *  bucket fallback and no network read. */
async function readCorpusAuditArtifacts(
  auditDir: string,
): Promise<{ manifest: AuditManifest; findings: Finding[] }> {
  const readJson = async (fileName: string): Promise<unknown> => {
    let raw: string;
    try {
      raw = await fs.readFile(path.join(auditDir, fileName), 'utf8');
    } catch {
      throw new Error(`saved audit is missing ${fileName}: ${auditDir}`);
    }
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      throw new Error(`saved audit ${fileName} is not valid JSON: ${auditDir}`);
    }
  };
  const [manifest, findings] = await Promise.all([
    readJson('manifest.json'),
    readJson('findings.json'),
  ]);
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    typeof (manifest as { auditId?: unknown }).auditId !== 'string' ||
    !Array.isArray(findings)
  ) {
    throw new Error(
      `saved audit artifacts do not have the expected shape (manifest object with auditId, findings array): ${auditDir}`,
    );
  }
  return { manifest: manifest as AuditManifest, findings: findings as Finding[] };
}

function tallyBy<T>(
  items: readonly T[],
  key: (item: T) => string | undefined,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const name = key(item);
    if (name === undefined) continue;
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return counts;
}

function tallyIssueCounts(
  runDoc: ReportQualityRunDocument | null,
): ReportQualityCorpusOutcome['issueCounts'] {
  // The pipeline does not persist review issues yet; when issue persistence
  // lands on the run document this read starts filling without a harness
  // change. Until then the tallies are honestly empty rather than invented.
  const issues: unknown[] = Array.isArray((runDoc as { issues?: unknown } | null)?.issues)
    ? (runDoc as unknown as { issues: unknown[] }).issues
    : [];
  const field = (issue: unknown, name: string): string | undefined =>
    typeof issue === 'object' &&
    issue !== null &&
    typeof (issue as Record<string, unknown>)[name] === 'string'
      ? (issue as Record<string, string>)[name]
      : undefined;
  return {
    byKind: tallyBy(issues, (issue) => field(issue, 'kind')),
    bySeverity: tallyBy(issues, (issue) => field(issue, 'severity')),
    byStatus: tallyBy(issues, (issue) => field(issue, 'status')),
  };
}

type QualityLanguageCandidate = ReportQualityPipelineResult['fr'];

function candidateOf(result: QualityLanguageCandidate | undefined) {
  if (!result) return null;
  return {
    pdfDigest: result.pdfDigest,
    privateObjectKey: result.privateObjectKey,
    pageCount: result.pageCount,
  };
}

/** Reads the persisted quality-run record for one corpus entry: model-call
 *  provenance, final state confirmation, error code, snapshot digest. A run
 *  that returned a result is read by its qualityRunId; a failed run has no
 *  result, so its latest run record for the audit is the best available. */
async function readQualityRunDoc(
  connection: Connection,
  auditId: string,
  qualityRunId: string | null,
): Promise<ReportQualityRunDocument | null> {
  const model = createReportQualityRunModel(connection);
  const query = qualityRunId !== null ? { qualityRunId } : { auditId };
  return model.findOne(query).sort({ createdAt: -1 }).lean<ReportQualityRunDocument | null>();
}

function safeEntryFileName(entryId: string): string {
  return `${entryId.replace(/[^a-zA-Z0-9._-]/gu, '_')}.json`;
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function runOneCorpusEntry(
  manifest: ReportQualityCorpusManifest,
  entry: ReportQualityCorpusEntry,
  options: RunReportQualityCorpusOptions,
): Promise<ReportQualityCorpusOutcome> {
  const startedAt = Date.now();
  const outcome: ReportQualityCorpusOutcome = {
    schemaVersion: 1,
    corpusId: manifest.corpusId,
    entryId: entry.entryId,
    host: entry.host,
    auditDir: entry.auditDir,
    state: 'failed',
    evidenceApprovalMode: null,
    qualityRunId: null,
    epoch: null,
    bundleDigest: null,
    inputSnapshotDigest: null,
    candidates: { fr: null, en: null },
    issueCounts: { byKind: {}, bySeverity: {}, byStatus: {} },
    modelCalls: { total: 0, byRole: {} },
    durationsMs: { artifactsMs: 0, evidenceMs: 0, pipelineMs: 0, totalMs: 0 },
  };

  let audit: { manifest: AuditManifest; findings: Finding[] };
  const artifactsStartedAt = Date.now();
  try {
    audit = await readCorpusAuditArtifacts(entry.auditDir);
  } catch (error) {
    outcome.reason = error instanceof Error ? error.message : String(error);
    outcome.durationsMs.totalMs = Date.now() - startedAt;
    return outcome;
  }
  outcome.durationsMs.artifactsMs = Date.now() - artifactsStartedAt;

  const evidenceStartedAt = Date.now();
  let evidence: Awaited<ReturnType<typeof loadAuditEvidencePayload>>;
  try {
    evidence = loadAuditEvidencePayload({
      auditDir: entry.auditDir,
      manifest: audit.manifest,
      findings: audit.findings,
    });
  } catch (error) {
    outcome.reason = error instanceof Error ? error.message : String(error);
    outcome.durationsMs.evidenceMs = Date.now() - evidenceStartedAt;
    outcome.durationsMs.totalMs = Date.now() - startedAt;
    return outcome;
  }
  outcome.evidenceApprovalMode = evidence.approval.approvalMode;
  outcome.durationsMs.evidenceMs = Date.now() - evidenceStartedAt;

  const pipelineStartedAt = Date.now();
  try {
    const result = await runReportQualityPipeline({
      connection: options.connection,
      auditDir: entry.auditDir,
      manifest: audit.manifest,
      findings: audit.findings,
      artifactStore: options.artifactStore,
      approvedEvidence: evidence,
    });
    outcome.state = 'quality-approved';
    outcome.qualityRunId = result.qualityRunId;
    outcome.epoch = result.epoch;
    outcome.bundleDigest = result.bundleDigest;
    outcome.inputSnapshotDigest = result.inputSnapshotDigest;
    outcome.candidates = { fr: candidateOf(result.fr), en: candidateOf(result.en) };
  } catch (error) {
    const isNeedsReview = error instanceof Error && error.name === NEEDS_OPERATOR_REVIEW_ERROR_NAME;
    outcome.state = isNeedsReview ? 'needs-operator-review' : 'failed';
    outcome.reason = error instanceof Error ? error.message : String(error);
    if (isNeedsReview) {
      const reasonCode = (error as { reasonCode?: unknown }).reasonCode;
      if (typeof reasonCode === 'string') outcome.reasonCode = reasonCode;
    }
  }
  outcome.durationsMs.pipelineMs = Date.now() - pipelineStartedAt;

  const runDoc = await readQualityRunDoc(
    options.connection,
    audit.manifest.auditId,
    outcome.qualityRunId,
  );
  outcome.issueCounts = tallyIssueCounts(runDoc);
  outcome.modelCalls = {
    total: runDoc?.modelCalls.length ?? 0,
    byRole: tallyBy(runDoc?.modelCalls ?? [], (call) => call?.role),
  };
  if (outcome.reasonCode === undefined && typeof runDoc?.errorCode === 'string') {
    outcome.reasonCode = runDoc.errorCode;
  }
  if (outcome.inputSnapshotDigest === null && typeof runDoc?.inputSnapshotDigest === 'string') {
    outcome.inputSnapshotDigest = runDoc.inputSnapshotDigest as Sha256Digest;
  }
  outcome.durationsMs.totalMs = Date.now() - startedAt;
  return outcome;
}

function emptyTotals(): Record<ReportQualityCorpusEntryState, number> {
  return { 'quality-approved': 0, 'needs-operator-review': 0, failed: 0 };
}

/**
 * Runs the report-quality pipeline over every corpus entry and writes one
 * outcome JSON file per entry plus summary.json under `outDir`. One entry's
 * failure never aborts the corpus. Outcome files carry digests, counts and
 * durations only - never client prose or PDF bytes.
 */
export async function runReportQualityCorpus(
  manifest: ReportQualityCorpusManifest,
  options: RunReportQualityCorpusOptions,
): Promise<{ outcomes: ReportQualityCorpusOutcome[]; summary: ReportQualityCorpusSummary }> {
  const startedAt = Date.now();
  await fs.mkdir(options.outDir, { recursive: true });

  const outcomesByEntry = new Map<string, Promise<ReportQualityCorpusOutcome>>();
  const lanes = toLanes(manifest.entries, options.concurrency);
  const total = manifest.entries.length;
  let completed = 0;

  await Promise.all(
    lanes.map(async (lane) => {
      for (const entry of lane) {
        const promise = runOneCorpusEntry(manifest, entry, options);
        outcomesByEntry.set(entry.entryId, promise);
        const outcome = await promise;
        const fileName = safeEntryFileName(entry.entryId);
        const parsed = reportQualityCorpusOutcomeSchema.safeParse(outcome);
        if (!parsed.success) {
          throw new Error(
            `corpus outcome for "${entry.entryId}" failed its own schema: ${parsed.error.message}`,
          );
        }
        await writeJsonFile(path.join(options.outDir, fileName), parsed.data);
        completed += 1;
        options.onProgress?.({
          entryId: entry.entryId,
          host: entry.host,
          completed,
          total,
          state: outcome.state,
          durationMs: outcome.durationsMs.totalMs,
        });
      }
    }),
  );

  const ordered = manifest.entries
    .map((entry) => outcomesByEntry.get(entry.entryId))
    .filter((outcome): outcome is Promise<ReportQualityCorpusOutcome> => outcome !== undefined);
  const settled = await Promise.all(ordered);
  const totals = emptyTotals();
  const modelCallsByRole: Record<string, number> = {};
  let modelCallsTotal = 0;
  for (const outcome of settled) {
    totals[outcome.state] += 1;
    modelCallsTotal += outcome.modelCalls.total;
    for (const [role, count] of Object.entries(outcome.modelCalls.byRole)) {
      modelCallsByRole[role] = (modelCallsByRole[role] ?? 0) + count;
    }
  }
  const summary: ReportQualityCorpusSummary = {
    schemaVersion: 1,
    corpusId: manifest.corpusId,
    generatedAt: new Date().toISOString(),
    wallTimeMs: Date.now() - startedAt,
    entries: manifest.entries.length,
    totals,
    modelCalls: { total: modelCallsTotal, byRole: modelCallsByRole },
    outcomeFiles: settled.map((outcome) => safeEntryFileName(outcome.entryId)),
  };
  await writeJsonFile(path.join(options.outDir, 'summary.json'), summary);
  return { outcomes: settled, summary };
}

/**
 * Validates every entry without calling any model: the saved audit's shape
 * (manifest.json + findings.json readable), then the real evidence load.
 * Returns the per-entry plan (evidence approval mode, verdict, limitation
 * count, requested languages) or the reason the entry cannot run.
 */
export async function dryRunReportQualityCorpus(
  manifest: ReportQualityCorpusManifest,
): Promise<ReportQualityCorpusDryRunPlan> {
  const entries = await Promise.all(
    manifest.entries.map(async (entry): Promise<ReportQualityCorpusDryRunEntry> => {
      try {
        const { manifest: auditManifest, findings } = await readCorpusAuditArtifacts(
          entry.auditDir,
        );
        const evidence = loadAuditEvidencePayload({
          auditDir: entry.auditDir,
          manifest: auditManifest,
          findings,
        });
        return {
          entryId: entry.entryId,
          host: entry.host,
          auditDir: entry.auditDir,
          status: 'ready',
          plan: {
            evidenceApprovalMode: evidence.approval.approvalMode,
            verdict: evidence.approval.verdict,
            limitationsCount: evidence.mandatoryDisclosures.length,
            // The pipeline's fixed bilingual pair; the corpus does not
            // choose languages.
            requestedLanguages: ['fr', 'en'],
            findingCount: findings.length,
          },
        };
      } catch (error) {
        return {
          entryId: entry.entryId,
          host: entry.host,
          auditDir: entry.auditDir,
          status: 'invalid',
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
  return { corpusId: manifest.corpusId, schemaVersion: manifest.schemaVersion, entries };
}
