/**
 * Plan 045 slice 1.1: extracted from the `regenerate-report` route
 * (routes/audits.ts) so `makeReportReady` (make-report-ready.ts) can call
 * the same rendering step after a renormalize, instead of the route being
 * the only caller. Behavior is unchanged from the route's own inline
 * version: same artifact reads, same selection resolution, same typed
 * refusals, now as named errors instead of inline sendError calls so a
 * second caller can distinguish them without parsing a message string.
 */

import path from 'node:path';
import type { Connection } from 'mongoose';
import { buildFindingsProvenance, type AuditManifest, type Finding } from '@odysseus/core';
import { resolveSelectedAnalysisPairForAudit, type AuditRuntimeFields } from '@odysseus/store';
import { buildArtifactBucketKey, buildAuditDir, getArtifactsRoot } from '@odysseus/scanner';
import type { StoredAnalysis } from '@odysseus/report';
import { resolveArtifactFile } from '../artifacts/resolve-artifact.js';
import type { ArtifactStore } from '../artifacts/artifact-store.js';
import { runAllReportsStage, type AllReportsStageResult } from './report-stage.js';
import {
  runReportQualityPipeline,
  type ReportQualityPipelineResult,
} from './report-quality-pipeline.js';

export type { AllReportsStageResult } from './report-stage.js';

export class AuditArtifactsUnavailableError extends Error {
  constructor() {
    super('audit artifacts not found on disk or in the bucket');
    this.name = 'AuditArtifactsUnavailableError';
  }
}

export class NoAnalysisPairError extends Error {
  constructor() {
    super(
      'a complete bilingual analysis pair is required before a report can be regenerated; ' +
        'run the writing regeneration in the Prepare report card, then approve the candidate',
    );
    this.name = 'NoAnalysisPairError';
  }
}

/** Reads manifest.json and findings.json for an audit (local disk, falling
 *  back to the bucket - resolveArtifactFile's own fallback), throwing
 *  AuditArtifactsUnavailableError when neither has them. */
export async function readAuditArtifacts(
  auditDir: string,
  hostname: string,
  startedAt: Date,
  artifactStore: ArtifactStore | undefined,
): Promise<{ manifest: AuditManifest; findings: Finding[] }> {
  try {
    const [manifestBytes, findingsBytes] = await Promise.all([
      resolveArtifactFile(
        path.join(auditDir, 'manifest.json'),
        buildArtifactBucketKey(hostname, startedAt, 'manifest.json'),
        artifactStore,
      ),
      resolveArtifactFile(
        path.join(auditDir, 'findings.json'),
        buildArtifactBucketKey(hostname, startedAt, 'findings.json'),
        artifactStore,
      ),
    ]);
    return {
      manifest: JSON.parse(manifestBytes.toString('utf-8')) as AuditManifest,
      findings: JSON.parse(findingsBytes.toString('utf-8')) as Finding[],
    };
  } catch {
    throw new AuditArtifactsUnavailableError();
  }
}

/**
 * Re-renders both language reports from the audit's selected analysis
 * pair, exactly what `odysseus report <dir> --all` does: no rescan, no new
 * LLM call. Throws AuditArtifactsUnavailableError, NoAnalysisPairError, or
 * (propagated from generateReportPdf) ReportIdentityUnconfirmedError.
 */
export async function regenerateReportsForAudit(
  connection: Connection,
  audit: AuditRuntimeFields,
  artifactStore: ArtifactStore | undefined,
): Promise<AllReportsStageResult[]> {
  const hostname = new URL(audit.siteUrl).hostname;
  const auditDir = buildAuditDir(getArtifactsRoot(), hostname, audit.startedAt);

  const { manifest, findings } = await readAuditArtifacts(
    auditDir,
    hostname,
    audit.startedAt,
    artifactStore,
  );

  // Computed once over the parsed findings: the report stage used to
  // canonicalize and hash the full array once per language, twice per
  // request. The stage still asserts the supplied value against the
  // manifest and the analyses, so a stale artifact still fails closed
  // exactly as before.
  const findingsProvenance = buildFindingsProvenance(findings);

  // Selection-aware resolution (plan 019): the selected exact pair, or the
  // legacy latest complete pair for audits without a selection. A ready-
  // but-unapproved candidate is never rendered as the paid report.
  const resolution = await resolveSelectedAnalysisPairForAudit(connection, audit.auditId);
  if (resolution.kind === 'none') throw new NoAnalysisPairError();
  const fr: StoredAnalysis = { ...resolution.fr };
  const en: StoredAnalysis = { ...resolution.en };

  return runAllReportsStage(
    auditDir,
    manifest,
    findings,
    { fr, en },
    connection,
    findingsProvenance,
  );
}

export async function runReportQualityForAudit(
  connection: Connection,
  audit: AuditRuntimeFields,
  artifactStore: ArtifactStore | undefined,
): Promise<ReportQualityPipelineResult> {
  const hostname = new URL(audit.siteUrl).hostname;
  const auditDir = buildAuditDir(getArtifactsRoot(), hostname, audit.startedAt);
  const { manifest, findings } = await readAuditArtifacts(
    auditDir,
    hostname,
    audit.startedAt,
    artifactStore,
  );
  return runReportQualityPipeline({ connection, auditDir, manifest, findings, artifactStore });
}
