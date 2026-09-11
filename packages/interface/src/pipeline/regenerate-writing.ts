/**
 * Candidate-first writing regeneration, plan 019 step 6. Reuses the
 * audit's existing structural analysis (runAnalysisStage reuses the newest
 * compatible `-structure.json` by default), regenerates the French and
 * English writing passes, persists both as new immutable analyses, and
 * records the exact pair as a ready candidate. Selection changes only
 * through the separate approval endpoint; failure leaves the selected pair
 * untouched.
 *
 * The in-flight registry is deliberately in-memory only (trade-off 62): a
 * persisted `generating` state could be stranded by a server restart, so a
 * run that never finishes simply leaves no candidate behind.
 */

import type { Connection } from 'mongoose';
import type { AnalysisPairRef, AuditManifest, Finding } from '@odysseus/core';
import {
  buildFindingsProvenance,
  buildReportPreparationPreview,
  isAcknowledgementCurrent,
  type MissingContextField,
} from '@odysseus/core';
import {
  getReportPreparation,
  recordFailedWritingCandidate,
  recordReadyWritingCandidate,
  type AuditDocument,
} from '@odysseus/store';
import { pauseBetweenLanguagePasses } from '@odysseus/llm';
import { runAnalysisStage } from './analysis-stage.js';
import { readAuditEvidence } from './audit-evidence.js';
import { RegenerationConflictError } from './regeneration-conflict-error.js';

export { RegenerationConflictError } from './regeneration-conflict-error.js';

/** Thrown when the stored warning acknowledgement does not match the
 *  current inputs; carries the typed warnings the client must show before
 *  the operator can confirm them. */
export class MissingAcknowledgementError extends Error {
  readonly warnings: readonly MissingContextField[];

  constructor(warnings: readonly MissingContextField[]) {
    super(
      'odysseus: the current missing-context warnings must be confirmed before regenerating writing',
    );
    this.name = 'MissingAcknowledgementError';
    this.warnings = warnings;
  }
}

const inFlight = new Set<string>();

export function isWritingRegenerationInFlight(auditId: string): boolean {
  return inFlight.has(auditId);
}

/** Thrown when the regeneration itself fails after starting; the failed
 *  candidate is already recorded when this propagates. */
export class WritingRegenerationFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WritingRegenerationFailedError';
  }
}

function currentWarningDigest(
  audit: AuditDocument,
  preparation: Awaited<ReturnType<typeof getReportPreparation>>,
  manifest: AuditManifest,
  findings: Finding[],
): { digest: string; warnings: readonly MissingContextField[] } {
  const preview = buildReportPreparationPreview({
    preparation,
    commercialName: audit.manualFields?.nomCommercial?.value,
    manifest,
    findings,
  });
  return { digest: preview.warningDigest, warnings: preview.warnings };
}

export interface RegenerateWritingResult {
  candidate: { status: 'ready'; pair: AnalysisPairRef; createdAt: string };
  analyses: { fr: string; en: string };
}

/**
 * Run one candidate-first regeneration to completion. The route awaits
 * this; a client that disconnects mid-request still gets the finished
 * candidate persisted, so reopening the card shows it ready for approval.
 */
export async function regenerateWriting(
  connection: Connection,
  audit: AuditDocument,
  costWarningConfirmed: boolean,
): Promise<RegenerateWritingResult> {
  const auditId = audit.auditId;
  if (!costWarningConfirmed) {
    throw new RegenerationConflictError(
      'odysseus: the model-call and cost warning must be explicitly confirmed',
    );
  }
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

  // Pre-flight: load the evidence and the stored preparation, then validate
  // the warning acknowledgement. Nothing is generated yet, so a failure here
  // releases the marker and propagates unchanged: no failed candidate is
  // recorded, and the route maps the original error exactly as before.
  let auditDir: string;
  let manifest: AuditManifest;
  let findings: Finding[];
  try {
    ({ auditDir, manifest, findings } = await readAuditEvidence(audit));
    const preparation = await getReportPreparation(connection, auditId);
    const { digest, warnings } = currentWarningDigest(audit, preparation, manifest, findings);
    if (!isAcknowledgementCurrent(preparation.warningAcknowledgement, digest)) {
      throw new MissingAcknowledgementError(warnings);
    }
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
    const updated = await recordReadyWritingCandidate(connection, auditId, pair);
    const candidate = updated.writingSelection?.candidate;
    if (!candidate || candidate.status !== 'ready') {
      throw new WritingRegenerationFailedError(
        'odysseus: the ready writing candidate could not be recorded',
      );
    }
    return {
      candidate: { status: 'ready', pair, createdAt: candidate.createdAt },
      analyses: { fr: frStage.analysis.analysisId, en: enStage.analysis.analysisId },
    };
  } catch (error) {
    if (
      error instanceof RegenerationConflictError ||
      error instanceof MissingAcknowledgementError
    ) {
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
