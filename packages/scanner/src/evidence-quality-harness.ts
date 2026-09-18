/**
 * Plan 059 step 39: the evidence-quality fault-injection/evaluation harness.
 *
 * Plan section 19 requires that a known-good control be run after every gate
 * or tolerance change, and section 18 lists the faults the fail-closed
 * pipeline must survive. This module is the reusable way to do both offline:
 * take the synthetic clean audit from `evidence-graph-fixtures.ts`, inject
 * exactly one fault, run the real assembly/persistence/approval pipeline, and
 * hand the tests a small result object whose verdict, issue codes, mandatory
 * disclosures and approval outcome can be asserted directly. No live host, no
 * browser, no model call, no real-scan corpus stand-in (plan handoff §5.1:
 * that corpus does not exist on this machine and is not fabricated here).
 *
 * The value of routing every case through `runFaultCase` rather than calling
 * `assembleAuditEvidenceGraph` directly is the last mile: fail-closed is a
 * claim about disk, not only about a verdict object. The runner therefore
 * always writes the assembled graph to a temporary audit directory, applies
 * the case's persisted-artifact tamper if it has one, then attempts
 * `approveAuditEvidence`, and refuses its own result if an approval file
 * exists when none was written or a written approval does not read back. A
 * `failed` verdict with an approval file beside it would be the one bug this
 * whole plan exists to prevent, so the harness checks for it on every run
 * instead of trusting each test to remember.
 *
 * Rows of the section 18 matrix that need a real browser, a live site or the
 * saved real-audit corpus (network/security egress, browser-state surfaces,
 * performance lab runs, cross-run delta) are deferred, not faked: their
 * contracts stay with the modules that own them and the corpus reruns of
 * steps 40-43.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AuditScopeSnapshot } from '@odysseus/core';
import {
  approveAuditEvidence,
  EVIDENCE_GRAPH_DIRNAME,
  readApprovedAuditEvidence,
  writeAuditEvidenceGraph,
} from './artifacts/evidence-graph-io.js';
import {
  assertAcquisitionLease,
  StaleAcquisitionLeaseError,
  writeAcquisitionLease,
} from './artifacts/acquisition-lease-io.js';
import {
  assembleAuditEvidenceGraph,
  type AuditEvidenceGraph,
  type AuditEvidenceGraphInput,
} from './evidence-graph.js';
import {
  attempt,
  cleanAttempts,
  cleanInput,
  environmentInput,
  HOME,
  page,
  ROOMS,
} from './evidence-graph-fixtures.js';
import { buildAuditEnvironmentFingerprint } from './audit-environment-fingerprint.js';
import type { AcquisitionAttemptRecord, AttemptFailureClass } from './check-attempt-ledger.js';
import type { EvidenceQualityIssue, EvidenceQualityVerdict } from './evidence-snapshots.js';
import {
  InventoryLedger,
  type InventoryDisposition,
  type InventoryDiscoverySource,
  type InventoryLedgerSnapshot,
} from './inventory-ledger.js';
import {
  effectiveCrawlDelayMs,
  isPathAllowedForEpoch,
  type RobotsPolicyChain,
} from './robots-policy-snapshot.js';

const INVENTORY_TIME = new Date('2026-09-18T09:00:00.000Z');

/** How the last mile went for one fault case. */
type ApprovalOutcome = 'written' | 'absent' | 'refused';

export interface FaultCaseResult {
  /** The section 18 matrix row the case stands for. */
  readonly id: string;
  /** The faulted input the graph was assembled from, for cases that assert
   *  on what the pipeline actually saw (inventory rows, attempt records). */
  readonly input: AuditEvidenceGraphInput;
  readonly graph: AuditEvidenceGraph;
  readonly verdict: EvidenceQualityVerdict;
  readonly issues: readonly EvidenceQualityIssue[];
  readonly issueCodes: readonly string[];
  readonly blockingCodes: readonly string[];
  /** Codes of the mandatory disclosures the assessment carries. */
  readonly disclosureCodes: readonly string[];
  readonly approval: ApprovalOutcome;
  /** The `approveAuditEvidence` refusal reason, when refused. */
  readonly approvalError: string | undefined;
}

/**
 * One fault: an id naming its matrix row, an `inject` that mutates one input
 * of the otherwise clean synthetic audit, and optionally a `tamper` that
 * corrupts one persisted evidence file after the graph was written and before
 * approval is attempted. Exactly one of the two should be set; a case may set
 * both when a fault has an assembly side and a persistence side.
 */
export interface EvidenceFaultCase {
  readonly id: string;
  readonly inject?: (clean: AuditEvidenceGraphInput) => AuditEvidenceGraphInput;
  readonly tamper?: (evidenceDir: string) => void;
}

function collectResult(
  id: string,
  input: AuditEvidenceGraphInput,
  graph: AuditEvidenceGraph,
  approval: ApprovalOutcome,
  approvalError: string | undefined,
): FaultCaseResult {
  return {
    id,
    input,
    graph,
    verdict: graph.quality.verdict,
    issues: graph.quality.issues,
    issueCodes: graph.quality.issues.map((issue) => issue.code),
    blockingCodes: graph.quality.issues
      .filter((issue) => issue.severity === 'blocking')
      .map((issue) => issue.code),
    disclosureCodes: graph.quality.mandatoryDisclosures.map((entry) => entry.code),
    approval,
    approvalError,
  };
}

/**
 * Runs one fault through the real pipeline: assemble, persist, tamper,
 * attempt approval. The temporary audit directory is always cleaned up.
 *
 * Throws (rather than returning a result) when the pipeline's own fail-closed
 * guarantee is violated: an approval on disk for a graph that carries none,
 * or a written approval that does not read back. Those are harness findings,
 * not case outcomes.
 */
export function runFaultCase(fault: EvidenceFaultCase): FaultCaseResult {
  const input = fault.inject === undefined ? cleanInput() : fault.inject(cleanInput());
  const graph = assembleAuditEvidenceGraph(input);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'odysseus-fault-harness-'));
  try {
    writeAuditEvidenceGraph(dir, graph);
    if (fault.tamper !== undefined) fault.tamper(path.join(dir, EVIDENCE_GRAPH_DIRNAME));

    let approval: ApprovalOutcome;
    let approvalError: string | undefined;
    if (graph.approval === undefined) {
      approval = 'absent';
    } else {
      try {
        approveAuditEvidence(dir, graph);
        approval = 'written';
      } catch (error) {
        approval = 'refused';
        approvalError = (error as Error).message;
      }
    }

    const persisted = readApprovedAuditEvidence(dir);
    if (approval === 'written') {
      if (persisted?.auditEvidenceSnapshotDigest !== graph.audit.digest) {
        throw new Error(
          `fault case ${fault.id}: approval reported written but does not read back as assembled`,
        );
      }
    } else if (persisted !== undefined) {
      throw new Error(
        `fault case ${fault.id}: an approval file is on disk although approval was ${approval}`,
      );
    }
    return collectResult(fault.id, input, graph, approval, approvalError);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** The verdict-level fail-closed contract: a blocked assessment and no
 *  approval anywhere - not in the graph, not on disk. */
export function assertFailClosed(result: FaultCaseResult): void {
  const problems: string[] = [];
  if (result.verdict !== 'failed' && result.verdict !== 'needs-operator-review') {
    problems.push(`verdict is ${result.verdict}`);
  }
  if (result.graph.approval !== undefined) problems.push('the graph carries an approval');
  if (result.approval === 'written') problems.push('an approval was persisted');
  if (problems.length > 0) {
    throw new Error(`fault case ${result.id} did not fail closed: ${problems.join('; ')}`);
  }
}

/** The clean-control contract: reportable and approved on disk. */
export function assertApproved(result: FaultCaseResult): void {
  const problems: string[] = [];
  if (
    result.verdict !== 'reportable-complete' &&
    result.verdict !== 'reportable-with-known-limitations'
  ) {
    problems.push(`verdict is ${result.verdict}`);
  }
  if (result.approval !== 'written') problems.push(`approval outcome is ${result.approval}`);
  if (problems.length > 0) {
    throw new Error(`fault case ${result.id} did not approve: ${problems.join('; ')}`);
  }
}

/** The persisted-read-back contract: the assembled graph was approvable but
 *  `approveAuditEvidence` refused because what is on disk no longer matches
 *  what was assessed, leaving no approval. */
export function assertApprovalRefused(result: FaultCaseResult, expected: RegExp): void {
  const problems: string[] = [];
  if (result.approval !== 'refused') problems.push(`approval outcome is ${result.approval}`);
  if (result.approvalError === undefined || !expected.test(result.approvalError)) {
    problems.push(`refusal was "${result.approvalError ?? 'none'}"`);
  }
  if (problems.length > 0) {
    throw new Error(`fault case ${result.id} was not refused: ${problems.join('; ')}`);
  }
}

/** The evidence roots of one input, for sensitivity rows that compare a
 *  faulted assembly against the clean control. */
export function rootsOf(input: AuditEvidenceGraphInput): {
  rawDigest: string;
  auditDigest: string;
} {
  const graph = assembleAuditEvidenceGraph(input);
  return { rawDigest: graph.raw.digest, auditDigest: graph.audit.digest };
}

/* ------------------------------------------------------------------ *
 * Input builders for the fault cases
 * ------------------------------------------------------------------ */

/**
 * The clean input rebuilt under a different frozen scope: every attempt and
 * the inventory are re-bound to the scope's digest, which is what a real
 * rescoped run would produce. Extra scanned pages get their full page-check
 * attempts, inventory rows and page observations.
 */
export function inputForScope(
  frozen: AuditScopeSnapshot,
  extraScanned: readonly string[] = [],
): AuditEvidenceGraphInput {
  return inputWithInventoryRows(
    frozen,
    extraScanned.map((url) => ({ url, source: 'link' as const, disposition: 'scanned' as const })),
  );
}

/** One inventory candidate beyond the start page and `/chambres`. */
export interface InventoryRowInput {
  url: string;
  source: InventoryDiscoverySource;
  referrer?: string;
  /** The spelling as seen, when it differed from the normalized identity. */
  observedUrl?: string;
  disposition?: InventoryDisposition;
}

/**
 * The clean input rebuilt with an explicit inventory. Scanned extra pages
 * must still get their attempts and observations, so pass them as
 * `extraScanned`; rows that are only inventory facts need no scan evidence.
 */
export function inputWithInventoryRows(
  frozen: AuditScopeSnapshot,
  rows: readonly InventoryRowInput[] = [],
  extraScanned: readonly string[] = [],
): AuditEvidenceGraphInput {
  // Every candidate disposed as scanned needs the full page-check attempts
  // and the page observations a scanned page persists, whoever listed it.
  const scannedUrls = [
    ...new Set([
      ...extraScanned,
      ...rows.filter((row) => row.disposition === 'scanned').map((row) => row.url),
    ]),
  ].sort();
  const urls = [HOME, ROOMS, ...scannedUrls];
  return cleanInput({
    scope: frozen,
    inventory: inventoryWithRows(frozen, rows),
    attempts: cleanAttempts(urls).map((record) => ({ ...record, scopeDigest: frozen.digest })),
    pages: urls.map((url) => page(url)),
  });
}

/** An inventory snapshot: start page and `/chambres` scanned, plus `rows`. */
export function inventoryWithRows(
  frozen: AuditScopeSnapshot,
  rows: readonly InventoryRowInput[] = [],
): InventoryLedgerSnapshot {
  const ledger = new InventoryLedger({
    evidenceEpoch: frozen.evidenceEpoch,
    scopeDigest: frozen.digest,
  });
  ledger.recordDiscovery({ url: HOME, source: 'start', discoveredAt: INVENTORY_TIME, depth: 0 });
  ledger.recordDisposition({ url: HOME, disposition: 'scanned', decidedAt: INVENTORY_TIME });
  ledger.recordDiscovery({
    url: ROOMS,
    source: 'link',
    discoveredAt: INVENTORY_TIME,
    referrer: HOME,
    depth: 1,
  });
  ledger.recordDisposition({ url: ROOMS, disposition: 'scanned', decidedAt: INVENTORY_TIME });
  for (const row of rows) {
    ledger.recordDiscovery({
      url: row.url,
      source: row.source,
      discoveredAt: INVENTORY_TIME,
      ...(row.referrer !== undefined ? { referrer: row.referrer } : {}),
      ...(row.observedUrl !== undefined ? { observedUrl: row.observedUrl } : {}),
      depth: 1,
    });
    if (row.disposition !== undefined) {
      ledger.recordDisposition({
        url: row.url,
        disposition: row.disposition,
        decidedAt: INVENTORY_TIME,
      });
    }
  }
  return ledger.snapshot();
}

/** A failed attempt as a page's scan.json would persist it. */
export function failedAttemptRecord(
  checkId: string,
  target: AcquisitionAttemptRecord['target'],
  failureClass: AttemptFailureClass,
  diagnosticCode: string,
  overrides: Partial<AcquisitionAttemptRecord> = {},
): AcquisitionAttemptRecord {
  return attempt(checkId, target, {
    outcome: 'failed',
    failureClass,
    diagnosticCode,
    sourceArtifactDigest: null,
    ...overrides,
  } as Partial<AcquisitionAttemptRecord>);
}

/** The retry a recovery profile would run under, as a persisted record. */
export function retrySuccessRecord(
  checkId: string,
  target: AcquisitionAttemptRecord['target'],
  materialResultDigest: string,
  overrides: Partial<AcquisitionAttemptRecord> = {},
): AcquisitionAttemptRecord {
  return attempt(checkId, target, {
    executionProfile: 'isolated-retry',
    startedAt: '2026-09-18T09:05:00.000Z',
    finishedAt: '2026-09-18T09:05:30.000Z',
    materialResultDigest,
    ...overrides,
  } as Partial<AcquisitionAttemptRecord>);
}

/**
 * Re-fingerprints the run under a different normalization contract, the way a
 * renormalization under changed normalize code would honestly rebuild it, so
 * the case proves the coverage signature moves instead of being patched.
 */
export function inputWithNormalizationFingerprint(
  input: AuditEvidenceGraphInput,
  normalizationFingerprint: string,
): AuditEvidenceGraphInput {
  const raw = environmentInput();
  return {
    ...input,
    environment: buildAuditEnvironmentFingerprint({
      ...raw,
      build: { ...raw.build, normalizationFingerprint },
    }),
  };
}

/* ------------------------------------------------------------------ *
 * Machinery outside the graph that the matrix names
 * ------------------------------------------------------------------ */

/**
 * Whether a worker whose lease id differs from the audit directory's current
 * holder is refused at its next evidence write (`StaleAcquisitionLeaseError`),
 * and whether the holder itself is still admitted. Exercises the step 22
 * acquisition lease in a temporary directory.
 */
export function leaseHandoverIsStale(
  currentHolderLeaseId: string,
  incomingWorkerLeaseId: string,
): boolean {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'odysseus-lease-harness-'));
  try {
    writeAcquisitionLease(dir, currentHolderLeaseId);
    try {
      assertAcquisitionLease(dir, incomingWorkerLeaseId);
      return false;
    } catch (error) {
      return error instanceof StaleAcquisitionLeaseError;
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Whether a directory with no lease at all refuses every worker. */
export function missingLeaseIsStale(workerLeaseId: string): boolean {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'odysseus-lease-harness-'));
  try {
    try {
      assertAcquisitionLease(dir, workerLeaseId);
      return false;
    } catch (error) {
      return error instanceof StaleAcquisitionLeaseError;
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** The epoch robots intersection (plan section 8) over a path sample: a path
 *  is fetchable only if every snapshot in the chain allows it, and the delay
 *  is the largest any snapshot asked for. This is the gate a mid-run robots
 *  tightening is enforced by. */
export function epochPathGate(chain: RobotsPolicyChain, paths: readonly string[]) {
  return {
    allowed: paths.filter((candidate) => isPathAllowedForEpoch(chain, candidate)),
    refused: paths.filter((candidate) => !isPathAllowedForEpoch(chain, candidate)),
    effectiveDelayMs: effectiveCrawlDelayMs(chain),
  };
}
