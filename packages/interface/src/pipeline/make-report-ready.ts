/**
 * Plan 045 slice 1.1: "one server function that just makes the PDFs."
 *
 * Belleval (`809b5e87`) sat at job status `needs-input` with both identity
 * fields already confirmed, both analyses present, and zero reports: the
 * dashboard's produce step only unlocks from an approved writing candidate
 * or an existing report row, and nothing wired those up automatically once
 * the operator confirmed the last field. Les Flots Bleus additionally has
 * stale findings (normalized under an old NORMALIZATION_FINGERPRINT), which
 * the report and writing stages correctly refuse (trade-off 40) but which
 * the dashboard had no button for fixing - only the CLI's `normalize`
 * command could.
 *
 * makeReportReady is the single path that gets an audit from "confirmed
 * and analysed" to "reports on disk and the job no longer stuck": refresh
 * findings if stale, regenerate the writing pair if the refresh touched
 * them, regenerate both PDFs, then reconcile any failed/needs-input job
 * row this audit's fresher state now satisfies.
 */

import type { Connection } from 'mongoose';
import { buildFindingsProvenance, type FindingsProvenance, type Finding } from '@odysseus/core';
import {
  getAuditManualFields,
  getAuditRuntimeFields,
  reconcileFailedAuditJobs,
  approveWritingCandidate,
  recordReadyWritingCandidate,
  resolveSelectedAnalysisPairForAudit,
  type AuditRuntimeFields,
  syncProspectIdentityIntoAudit,
} from '@odysseus/store';
import { buildAuditDir, getArtifactsRoot } from '@odysseus/scanner';
import { pauseBetweenLanguagePasses } from '@odysseus/llm';
import { ReportIdentityUnconfirmedError, type UnconfirmedField } from '@odysseus/report';
import type { ArtifactStore } from '../artifacts/artifact-store.js';
import { syncAuditDirToBucket } from '../artifacts/sync-audit-artifacts.js';
import { backfillAuditRow } from './backfill-audit-row.js';
import { renormalizeAudit } from './renormalize-audit.js';
import { runAnalysisStage } from './analysis-stage.js';
import { RegenerationConflictError } from './regeneration-conflict-error.js';
import { isWritingRegenerationInFlight } from './regenerate-writing.js';
import {
  readAuditArtifacts,
  regenerateReportsForAudit,
  AuditArtifactsUnavailableError,
  NoAnalysisPairError,
  type AllReportsStageResult,
} from './regenerate-reports.js';

export type MakeReportReadyRefusal =
  | { kind: 'audit-not-found' }
  | { kind: 'scan-data-missing' }
  | { kind: 'no-analysis' }
  | { kind: 'identity-unconfirmed'; fields: readonly UnconfirmedField[] };

export type MakeReportReadyOutcome =
  | { kind: 'ready'; reports: AllReportsStageResult[]; findingsWereRefreshed: boolean }
  | { kind: 'refused'; refusal: MakeReportReadyRefusal };

/** True when a stamped provenance was computed under a different
 *  normalization fingerprint or schema version than the current code
 *  produces from the same findings - the fail-closed check report-stage.ts
 *  and analysis-stage.ts already apply at render time, read here ahead of
 *  time so this function can act on it instead of merely refusing.
 *
 *  Takes the stamped provenance directly (not a manifest) so a caller that
 *  already has one in hand - the audit row's own `findingsProvenance`
 *  field, kept in sync by backfillAuditRow, for the dashboard's detail
 *  route - never pays for a manifest.json read just to answer this
 *  question. The one caller inside this file that only has a manifest
 *  passes `manifest.findingsProvenance`. */
export function findingsAreStale(
  stamped: FindingsProvenance | undefined,
  findings: Finding[],
): boolean {
  const current = buildFindingsProvenance(findings);
  return (
    stamped === undefined ||
    stamped.findingsSchemaVersion !== current.findingsSchemaVersion ||
    stamped.normalizationFingerprint !== current.normalizationFingerprint
  );
}

/** True when the pair the report would render was written from findings
 *  normalized differently than the current ones. An earlier run can leave
 *  the manifest refreshed but this pair old (it failed or was interrupted
 *  during the analysis passes); the manifest check alone would then skip
 *  the refresh on every retry and render a pair the report stage refuses. */
async function selectedPairIsStale(
  connection: Connection,
  auditId: string,
  findings: Finding[],
): Promise<boolean> {
  const resolution = await resolveSelectedAnalysisPairForAudit(connection, auditId);
  if (resolution.kind === 'none') return false;
  return (
    findingsAreStale(resolution.fr.findingsProvenance, findings) ||
    findingsAreStale(resolution.en.findingsProvenance, findings)
  );
}

/** Audits with a report production running in this process. Two runs on one
 *  audit would renormalize the same directory and pay for the analysis
 *  passes twice. */
const inFlight = new Set<string>();

async function refreshWritingCandidate(
  connection: Connection,
  auditDir: string,
  audit: AuditRuntimeFields,
  artifactStore: ArtifactStore | undefined,
): Promise<void> {
  await syncProspectIdentityIntoAudit(connection, audit.auditId);
  const manualFields = await getAuditManualFields(connection, audit.auditId);
  const { manifest, findings } = await readAuditArtifacts(
    auditDir,
    new URL(audit.siteUrl).hostname,
    audit.startedAt,
    artifactStore,
  );
  const findingsProvenance = buildFindingsProvenance(findings);

  const frStage = await runAnalysisStage(
    auditDir,
    manifest,
    findings,
    {
      language: 'fr',
      findingsProvenance,
      regenerateStructure: true,
      ...(manualFields?.siren !== undefined ? { manualSiren: manualFields.siren.value } : {}),
      ...(manualFields?.transactionalFlowOverride !== undefined
        ? {
            siteSignalOverrides: {
              hasTransactionalFlow: manualFields.transactionalFlowOverride,
            },
          }
        : {}),
    },
    connection,
  );
  await pauseBetweenLanguagePasses();
  const enStage = await runAnalysisStage(
    auditDir,
    manifest,
    findings,
    {
      language: 'en',
      findingsProvenance,
      regenerateStructure: true,
      ...(manualFields?.siren !== undefined ? { manualSiren: manualFields.siren.value } : {}),
      ...(manualFields?.transactionalFlowOverride !== undefined
        ? {
            siteSignalOverrides: {
              hasTransactionalFlow: manualFields.transactionalFlowOverride,
            },
          }
        : {}),
    },
    connection,
  );
  await Promise.allSettled([...frStage.advisoryPasses, ...enStage.advisoryPasses]);

  await recordReadyWritingCandidate(connection, audit.auditId, {
    frAnalysisId: frStage.analysis.analysisId,
    enAnalysisId: enStage.analysis.analysisId,
    findingsProvenance: frStage.analysis.findingsProvenance,
  });
  // The auto-selection amendment (trade-off 62, plan 045 section 2.1):
  // makeReportReady is only ever invoked by an operator action already
  // downstream of confirming the fields that matter (identity, or simply
  // "make this report reachable"), so a freshly regenerated pair does not
  // need a second, separate approval click here.
  await approveWritingCandidate(connection, audit.auditId);
}

/**
 * Gets one audit from "confirmed and analysed" to "reports on disk," doing
 * whatever refresh work is needed first. Never invents a writing pair from
 * nothing: an audit with no analysis at all still refuses with
 * 'no-analysis', same as regenerateReportsForAudit always has - only a
 * *stale* existing pair gets rebuilt.
 */
export async function makeReportReady(
  connection: Connection,
  auditId: string,
  artifactStore: ArtifactStore | undefined,
): Promise<MakeReportReadyOutcome> {
  // Checked and taken with no await in between, so two concurrent requests
  // cannot both pass.
  if (inFlight.has(auditId) || isWritingRegenerationInFlight(auditId)) {
    throw new RegenerationConflictError(
      'odysseus: the PDFs or the writing for this audit are already being produced',
    );
  }
  inFlight.add(auditId);
  try {
    return await produceReports(connection, auditId, artifactStore);
  } finally {
    inFlight.delete(auditId);
  }
}

async function produceReports(
  connection: Connection,
  auditId: string,
  artifactStore: ArtifactStore | undefined,
): Promise<MakeReportReadyOutcome> {
  const audit = await getAuditRuntimeFields(connection, auditId);
  if (!audit) return { kind: 'refused', refusal: { kind: 'audit-not-found' } };

  const hostname = new URL(audit.siteUrl).hostname;
  const auditDir = buildAuditDir(getArtifactsRoot(), hostname, audit.startedAt);

  let findingsWereRefreshed = false;
  try {
    const { manifest, findings } = await readAuditArtifacts(
      auditDir,
      hostname,
      audit.startedAt,
      artifactStore,
    );
    if (findingsAreStale(manifest.findingsProvenance, findings)) {
      await renormalizeAudit(auditDir, artifactStore);
      await backfillAuditRow(auditDir, connection);
      await syncAuditDirToBucket(artifactStore, auditDir, hostname, audit.startedAt);
      await refreshWritingCandidate(connection, auditDir, audit, artifactStore);
      findingsWereRefreshed = true;
    } else if (await selectedPairIsStale(connection, auditId, findings)) {
      await refreshWritingCandidate(connection, auditDir, audit, artifactStore);
      findingsWereRefreshed = true;
    }
  } catch (error) {
    if (error instanceof AuditArtifactsUnavailableError) {
      return { kind: 'refused', refusal: { kind: 'scan-data-missing' } };
    }
    throw error;
  }

  try {
    const reports = await regenerateReportsForAudit(connection, audit, artifactStore);
    await reconcileFailedAuditJobs(connection);
    return { kind: 'ready', reports, findingsWereRefreshed };
  } catch (error) {
    if (error instanceof AuditArtifactsUnavailableError) {
      return { kind: 'refused', refusal: { kind: 'scan-data-missing' } };
    }
    if (error instanceof NoAnalysisPairError) {
      return { kind: 'refused', refusal: { kind: 'no-analysis' } };
    }
    if (error instanceof ReportIdentityUnconfirmedError) {
      return { kind: 'refused', refusal: { kind: 'identity-unconfirmed', fields: error.fields } };
    }
    throw error;
  }
}
