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
 * findings if stale, regenerate the French writing if the refresh touched
 * them, regenerate the selected report PDFs, then reconcile any failed/needs-input job
 * row this audit's fresher state now satisfies.
 */

import type { Connection } from 'mongoose';
import { buildFindingsProvenance } from '@odysseus/core';
import {
  getAuditRuntimeFields,
  reconcileFailedAuditJobs,
  resolveSelectedAnalysisPairForAudit,
  type AuditRuntimeFields,
  syncProspectIdentityIntoAudit,
} from '@odysseus/store';
import { buildAuditDir, getArtifactsRoot } from '@odysseus/scanner';
import { ReportIdentityUnconfirmedError, type UnconfirmedField } from '@odysseus/report';
import type { ArtifactStore } from '../artifacts/artifact-store.js';
import { syncAuditDirToBucket } from '../artifacts/sync-audit-artifacts.js';
import { backfillAuditRow } from './backfill-audit-row.js';
import { renormalizeAudit } from './renormalize-audit.js';
import { findingsAreStale } from './audit-evidence.js';
import { RegenerationConflictError } from './regeneration-conflict-error.js';
import { releaseReportProduction, tryAcquireReportProduction } from './report-production-lock.js';
import {
  clearReportProduction,
  markReportProductionCompleted,
  markReportProductionFailed,
  markReportProductionStage,
} from './report-production-state.js';
import {
  readAuditArtifacts,
  regenerateReportsForAudit,
  AuditArtifactsUnavailableError,
  NoAnalysisPairError,
  type AllReportsStageResult,
} from './regenerate-reports.js';
import { writeSelectedAnalysis } from './write-selected-analysis.js';

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
export { findingsAreStale } from './audit-evidence.js';

/** True when the pair the report would render was written from findings
 *  normalized differently than the current ones. An earlier run can leave
 *  the manifest refreshed but this pair old (it failed or was interrupted
 *  during the analysis passes); the manifest check alone would then skip
 *  the refresh on every retry and render a pair the report stage refuses. */
async function selectedPairIsStale(connection: Connection, auditId: string): Promise<boolean> {
  const resolution = await resolveSelectedAnalysisPairForAudit(connection, auditId);
  if (resolution.kind === 'none') return false;
  return (
    findingsAreStale(resolution.fr.findingsProvenance) ||
    (resolution.en !== undefined && findingsAreStale(resolution.en.findingsProvenance))
  );
}

async function refreshWritingCandidate(
  connection: Connection,
  auditDir: string,
  audit: AuditRuntimeFields,
  artifactStore: ArtifactStore | undefined,
): Promise<void> {
  await syncProspectIdentityIntoAudit(connection, audit.auditId);
  const { manifest, findings } = await readAuditArtifacts(
    auditDir,
    new URL(audit.siteUrl).hostname,
    audit.startedAt,
    artifactStore,
  );
  // The auto-selection amendment (trade-off 62, plan 045 section 2.1):
  // makeReportReady is only ever invoked by an operator action already
  // downstream of confirming the fields that matter (identity, or simply
  // "make this report reachable"), so a freshly regenerated pair does not
  // need a second, separate approval click here.
  await writeSelectedAnalysis(connection, {
    auditDir,
    manifest,
    findings,
    findingsProvenance: buildFindingsProvenance(findings),
    regenerateStructure: true,
  });
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
  // cannot both pass. The lock is shared with writing regeneration: two runs
  // on one audit would renormalize the same directory and pay for the
  // analysis passes twice.
  if (!tryAcquireReportProduction(auditId, 'report-ready')) {
    throw new RegenerationConflictError(
      'odysseus: the PDFs or the writing for this audit are already being produced',
    );
  }
  try {
    const outcome = await produceReports(connection, auditId, artifactStore);
    if (outcome.kind === 'ready') markReportProductionCompleted(auditId);
    else clearReportProduction(auditId);
    return outcome;
  } catch (error) {
    markReportProductionFailed(auditId, error);
    throw error;
  } finally {
    releaseReportProduction(auditId, 'report-ready');
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
    const { manifest } = await readAuditArtifacts(
      auditDir,
      hostname,
      audit.startedAt,
      artifactStore,
    );
    if (findingsAreStale(manifest.findingsProvenance)) {
      markReportProductionStage(auditId, 'writing');
      await renormalizeAudit(auditDir, artifactStore);
      await backfillAuditRow(auditDir, connection);
      await syncAuditDirToBucket(artifactStore, auditDir, hostname, audit.startedAt);
      await refreshWritingCandidate(connection, auditDir, audit, artifactStore);
      findingsWereRefreshed = true;
    } else if (await selectedPairIsStale(connection, auditId)) {
      markReportProductionStage(auditId, 'writing');
      await refreshWritingCandidate(connection, auditDir, audit, artifactStore);
      findingsWereRefreshed = true;
    }
  } catch (error) {
    if (error instanceof AuditArtifactsUnavailableError) {
      return { kind: 'refused', refusal: { kind: 'scan-data-missing' } };
    }
    throw error;
  }

  markReportProductionStage(auditId, 'pdf-generation');
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
