/**
 * Candidate-first writing regeneration, plan 019 step 6. Reuses the
 * audit's existing structural analysis (runAnalysisStage reuses the newest
 * compatible `-structure.json` by default), regenerates the canonical French
 * writing pass, and persists it as a new immutable analysis.
 *
 * Plan 045 section 2.1 (trade-off 62 amendment): the pair is approved and
 * rendered automatically once ready. Regeneration is already an explicit
 * operator action to replace the current version, so a second manual
 * "approve this candidate" click adds ceremony without adding safety - the
 * operator reads the result (and the "delivered version replaced" status
 * this reports back when a previously approved pair existed) rather than
 * clicking a second gate. Only the writing generation itself failing - the
 * catch block below, before a candidate is ever recorded - leaves the
 * selected pair untouched; a render refusal after approval is reported back
 * as `pdfs`, not thrown, since PDF production stays reachable separately
 * (slice 1.2).
 *
 * The in-flight registry is deliberately in-memory only (trade-off 62): a
 * persisted `generating` state could be stranded by a server restart, so a
 * run that never finishes simply leaves no candidate behind.
 */

import type { Connection } from 'mongoose';
import type {
  AnalysisSelectionRef,
  AuditManifest,
  Finding,
  WritingGuardRejection,
} from '@odysseus/core';
import { buildFindingsProvenance } from '@odysseus/core';
import {
  approveWritingCandidate,
  getReportPreparation,
  reconcileFailedAuditJobs,
  recordFailedWritingCandidate,
  recordReadyWritingCandidate,
  type AuditDocument,
} from '@odysseus/store';
import { WritingPassExhaustedError } from '@odysseus/llm';
import { ReportIdentityUnconfirmedError } from '@odysseus/report';
import type { ArtifactStore } from '../artifacts/artifact-store.js';
import { runAnalysisStage } from './analysis-stage.js';
import { findingsAreStale, refreshStaleAuditEvidence } from './audit-evidence.js';
import { RegenerationConflictError } from './regeneration-conflict-error.js';
import { releaseReportProduction, tryAcquireReportProduction } from './report-production-lock.js';
import {
  markReportProductionCompleted,
  markReportProductionFailed,
  markReportProductionStage,
} from './report-production-state.js';
import {
  regenerateReportsForAudit,
  AuditArtifactsUnavailableError,
  NoAnalysisPairError,
  type AllReportsStageResult,
} from './regenerate-reports.js';

export { RegenerationConflictError } from './regeneration-conflict-error.js';
export { isWritingRegenerationInFlight } from './report-production-lock.js';

/** Issue #281: how the last background run for an audit ended, kept in
 *  memory so the dashboard can report it after polling. */
export type WritingRunOutcome =
  | { status: 'succeeded'; pdfsGenerated: boolean; pdfsRefusedReason?: string; finishedAt: string }
  | { status: 'failed'; message: string; finishedAt: string };

const lastOutcome = new Map<string, WritingRunOutcome>();

export function lastWritingRunOutcome(auditId: string): WritingRunOutcome | undefined {
  return lastOutcome.get(auditId);
}

export function recordWritingRunOutcome(auditId: string, outcome: WritingRunOutcome): void {
  lastOutcome.set(auditId, outcome);
}

/** Thrown when the regeneration itself fails after starting; the failed
 *  candidate is already recorded when this propagates. */
export class WritingRegenerationFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WritingRegenerationFailedError';
  }
}

export type RegeneratedReportsOutcome =
  { kind: 'generated'; reports: AllReportsStageResult[] } | { kind: 'refused'; reason: string };

export interface RegenerateWritingResult {
  candidate: { status: 'selected'; pair: AnalysisSelectionRef; approvedAt: string };
  analyses: { fr: string };
  pdfs: RegeneratedReportsOutcome;
  /** True when a previously approved (and possibly already delivered) pair
   *  existed before this regeneration replaced it - the client's cue for
   *  the "delivered version replaced" status line instead of a dialog. */
  replacedApprovedSelection: boolean;
}

/**
 * Run one candidate-first regeneration to completion. The route awaits
 * this; a client that disconnects mid-request still gets the finished
 * candidate persisted, so reopening the card shows it ready for approval.
 */
export async function regenerateWriting(
  connection: Connection,
  audit: AuditDocument,
  artifactStore: ArtifactStore | undefined,
  /** Force a fresh French writing pass even when a compatible stored
   *  French analysis exists. English is generated only by the explicit
   *  Generate English version action (Plan 067). */
  options: { regenerateWriting?: boolean } = {},
): Promise<RegenerateWritingResult> {
  const auditId = audit.auditId;
  // The lock is checked and taken in one synchronous call with no await
  // before it: Node serves requests concurrently, and the previous
  // check-then-await-then-add ordering let two simultaneous submits pass the
  // guard, race on the writing candidate, and insert duplicate analysis
  // versions (issue #143). The lock is shared with makeReportReady.
  if (!tryAcquireReportProduction(auditId, 'writing')) {
    throw new RegenerationConflictError(
      'odysseus: the PDFs or the writing for this audit are already being produced',
    );
  }
  markReportProductionStage(auditId, 'writing');

  // Pre-flight: load the evidence and note whether an approved pair already
  // exists (the "replaced" signal). Nothing is generated yet, so a failure
  // here releases the marker and propagates unchanged.
  let auditDir: string;
  let manifest: AuditManifest;
  let findings: Finding[];
  let findingsWereRefreshed: boolean;
  let regenerateStructure: boolean;
  let replacedApprovedSelection: boolean;
  try {
    ({ auditDir, manifest, findings, findingsWereRefreshed } = await refreshStaleAuditEvidence(
      connection,
      audit,
      artifactStore,
    ));
    const preparation = await getReportPreparation(connection, auditId);
    replacedApprovedSelection = preparation.writingSelection?.selected !== undefined;
    // A prior failed run may already have refreshed manifest.json while
    // leaving the selected French analysis and its structure document stamped
    // with the old normalization fingerprint. In that state the manifest is
    // fresh, so the evidence refresh alone cannot tell the analysis stage to
    // replace the incompatible structure. Treat the selected pair's stamp as
    // part of this pre-flight decision too; otherwise retrying the same
    // operator action just advances from "stale findings" to "stale structure
    // document" and fails again.
    const selectedProvenance = preparation.writingSelection?.selected?.findingsProvenance;
    regenerateStructure = findingsWereRefreshed || findingsAreStale(selectedProvenance, findings);
  } catch (error) {
    // Release is idempotent, so releasing an already free lock changes
    // nothing.
    releaseReportProduction(auditId, 'writing');
    markReportProductionFailed(auditId, error);
    throw error;
  }

  // Computed once over the evidence both language passes receive: the full
  // array canonicalize plus hash used to run once per language inside
  // runAnalysisStage. Each stage still asserts the supplied value against
  // the manifest, so fail-closed behaviour is unchanged.
  const findingsProvenance = buildFindingsProvenance(findings);

  let partialPair: { frAnalysisId?: string; enAnalysisId?: string } = {};
  try {
    const frStage = await runAnalysisStage(
      auditDir,
      manifest,
      findings,
      {
        language: 'fr',
        findingsProvenance,
        regenerateStructure,
        regenerateWriting: options.regenerateWriting ?? false,
        ...(audit.manualFields?.siren !== undefined
          ? { manualSiren: audit.manualFields.siren.value }
          : {}),
        ...(audit.manualFields?.transactionalFlowOverride !== undefined
          ? {
              siteSignalOverrides: {
                hasTransactionalFlow: audit.manualFields.transactionalFlowOverride,
              },
            }
          : {}),
      },
      connection,
    );
    partialPair = { frAnalysisId: frStage.analysis.analysisId };

    const pair: AnalysisSelectionRef = {
      frAnalysisId: frStage.analysis.analysisId,
      findingsProvenance: frStage.analysis.findingsProvenance,
    };
    const readied = await recordReadyWritingCandidate(
      connection,
      auditId,
      pair,
      frStage.sanitizationWarnings,
    );
    if (readied.writingSelection?.candidate?.status !== 'ready') {
      throw new WritingRegenerationFailedError(
        'odysseus: the ready writing candidate could not be recorded',
      );
    }

    // Plan 045 section 2.1: approve immediately, no separate manual click.
    const approved = await approveWritingCandidate(connection, auditId);
    const candidate = approved.writingSelection?.candidate;
    if (!candidate || candidate.status !== 'selected') {
      throw new WritingRegenerationFailedError(
        'odysseus: the writing candidate could not be selected after regeneration',
      );
    }

    let pdfs: RegeneratedReportsOutcome;
    markReportProductionStage(auditId, 'pdf-generation');
    try {
      const reports = await regenerateReportsForAudit(connection, audit, artifactStore);
      // Same as makeReportReady: a scan job that failed before its report
      // now has a current one, so its row must stop reading as failed.
      await reconcileFailedAuditJobs(connection);
      pdfs = { kind: 'generated', reports };
      markReportProductionCompleted(auditId);
    } catch (renderError) {
      // The writing pair is already generated and selected; a render
      // refusal at this point is reported back rather than thrown, so it is
      // never mistaken for a failed writing candidate (production stays
      // separately reachable, slice 1.2).
      if (
        renderError instanceof AuditArtifactsUnavailableError ||
        renderError instanceof NoAnalysisPairError ||
        renderError instanceof ReportIdentityUnconfirmedError
      ) {
        pdfs = { kind: 'refused', reason: renderError.message };
        markReportProductionFailed(auditId, renderError);
      } else {
        throw renderError;
      }
    }

    return {
      candidate: { status: 'selected', pair, approvedAt: candidate.approvedAt },
      analyses: { fr: frStage.analysis.analysisId },
      pdfs,
      replacedApprovedSelection,
    };
  } catch (error) {
    if (error instanceof RegenerationConflictError) {
      throw error;
    }
    markReportProductionFailed(auditId, error);
    const reason = error instanceof Error ? error.message : String(error);
    // One language may have succeeded before the failure; recording the
    // partial lets the selection fallback exclude the half-generated
    // content instead of adopting it as current.
    await recordFailedWritingCandidate(
      connection,
      auditId,
      reason,
      partialPair,
      // Issue #409: when the writing pass exhausted its budget, record which
      // guards rejected each attempt, not only the reason the last one gave.
      describeGuardRejections(error),
    );
    throw new WritingRegenerationFailedError(reason);
  } finally {
    releaseReportProduction(auditId, 'writing');
  }
}

/** The per-attempt guard record of an exhausted writing pass, or nothing for
 *  any other failure (a provider outage, a missing artifact). Guard names
 *  only - the violating prose belongs in the analysis artifact. */
function describeGuardRejections(error: unknown): readonly WritingGuardRejection[] {
  if (!(error instanceof WritingPassExhaustedError)) return [];
  const totalAttempts = error.rejections.length;
  return error.rejections.map((rejection) => ({
    attempt: rejection.attempt,
    totalAttempts,
    guards: [...rejection.guards],
  }));
}
