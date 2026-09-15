/**
 * Candidate-first writing regeneration, plan 019 step 6. Reuses the
 * audit's existing structural analysis (runAnalysisStage reuses the newest
 * compatible `-structure.json` by default), regenerates the French and
 * English writing passes, and persists both as new immutable analyses.
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
import type { AnalysisPairRef, AuditManifest, Finding } from '@odysseus/core';
import { buildFindingsProvenance } from '@odysseus/core';
import {
  approveWritingCandidate,
  getReportPreparation,
  recordFailedWritingCandidate,
  recordReadyWritingCandidate,
  type AuditDocument,
} from '@odysseus/store';
import { pauseBetweenLanguagePasses } from '@odysseus/llm';
import { ReportIdentityUnconfirmedError } from '@odysseus/report';
import type { ArtifactStore } from '../artifacts/artifact-store.js';
import { runAnalysisStage } from './analysis-stage.js';
import { readAuditEvidence } from './audit-evidence.js';
import { RegenerationConflictError } from './regeneration-conflict-error.js';
import {
  regenerateReportsForAudit,
  AuditArtifactsUnavailableError,
  NoAnalysisPairError,
  type AllReportsStageResult,
} from './regenerate-reports.js';

export { RegenerationConflictError } from './regeneration-conflict-error.js';

const inFlight = new Set<string>();

export function isWritingRegenerationInFlight(auditId: string): boolean {
  return inFlight.has(auditId);
}

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
  candidate: { status: 'selected'; pair: AnalysisPairRef; approvedAt: string };
  analyses: { fr: string; en: string };
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
): Promise<RegenerateWritingResult> {
  const auditId = audit.auditId;
  if (inFlight.has(auditId)) {
    throw new RegenerationConflictError(
      'odysseus: a writing regeneration is already running for this audit',
    );
  }
  // The add must stay adjacent to the has check with no await in between:
  // Node serves requests concurrently, and the previous check-then-await-
  // then-add ordering let two simultaneous submits pass the guard, race on
  // the writing candidate, and insert duplicate analysis versions
  // (issue #143).
  inFlight.add(auditId);

  // Pre-flight: load the evidence and note whether an approved pair already
  // exists (the "replaced" signal). Nothing is generated yet, so a failure
  // here releases the marker and propagates unchanged.
  let auditDir: string;
  let manifest: AuditManifest;
  let findings: Finding[];
  let replacedApprovedSelection: boolean;
  try {
    ({ auditDir, manifest, findings } = await readAuditEvidence(audit));
    const preparation = await getReportPreparation(connection, auditId);
    replacedApprovedSelection = preparation.writingSelection?.selected !== undefined;
  } catch (error) {
    // Set.delete is idempotent, so a delete of an already absent marker
    // changes nothing.
    inFlight.delete(auditId);
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
    // Issue #30, same shape as run-full-audit-job: the English pass must
    // not enter the quota window the French pass just drained.
    await pauseBetweenLanguagePasses();
    const enStage = await runAnalysisStage(
      auditDir,
      manifest,
      findings,
      {
        language: 'en',
        findingsProvenance,
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
    partialPair = {
      frAnalysisId: frStage.analysis.analysisId,
      enAnalysisId: enStage.analysis.analysisId,
    };
    // The route awaits the whole regeneration, and this function previously
    // resolved only once the advisory passes were done (they were awaited
    // inside the stage). The stages now start the passes without awaiting
    // them (issue #145), so settling them here preserves that behaviour:
    // the candidate is never recorded while advisory writes are pending.
    await Promise.allSettled([...frStage.advisoryPasses, ...enStage.advisoryPasses]);

    const pair: AnalysisPairRef = {
      frAnalysisId: frStage.analysis.analysisId,
      enAnalysisId: enStage.analysis.analysisId,
      findingsProvenance: frStage.analysis.findingsProvenance,
    };
    const readied = await recordReadyWritingCandidate(connection, auditId, pair);
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
    try {
      const reports = await regenerateReportsForAudit(connection, audit, artifactStore);
      pdfs = { kind: 'generated', reports };
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
      } else {
        throw renderError;
      }
    }

    return {
      candidate: { status: 'selected', pair, approvedAt: candidate.approvedAt },
      analyses: { fr: frStage.analysis.analysisId, en: enStage.analysis.analysisId },
      pdfs,
      replacedApprovedSelection,
    };
  } catch (error) {
    if (error instanceof RegenerationConflictError) {
      throw error;
    }
    const reason = error instanceof Error ? error.message : String(error);
    // One language may have succeeded before the failure; recording the
    // partial lets the selection fallback exclude the half-generated
    // content instead of adopting it as current.
    await recordFailedWritingCandidate(connection, auditId, reason, partialPair);
    throw new WritingRegenerationFailedError(reason);
  } finally {
    inFlight.delete(auditId);
  }
}
