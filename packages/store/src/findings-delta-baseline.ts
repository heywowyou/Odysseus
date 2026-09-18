/**
 * Baseline lookup for the re-audit findings delta (plan 051). The baseline
 * is the most recent earlier audit of the exact same site URL whose report
 * pair was approved for delivery and whose findings carry a provenance
 * stamp. An undelivered rerun is never a baseline, and an unstamped
 * findings set is never compared.
 *
 * Plan 059 step 35: each run's evidence coverage signature rides along, so
 * the delta can judge observability and not only identity. An audit whose
 * persisted record carries a current-version signature contributes it
 * verbatim; one that predates the coverage graph - or whose signature was
 * written by a future build - contributes only what such an audit can
 * honestly claim, through `buildLegacyFindingsDeltaCoverage`: the surfaces
 * it is known to have scanned and nothing else.
 */

import type { Connection } from 'mongoose';
import {
  buildLegacyFindingsDeltaCoverage,
  FINDINGS_DELTA_COVERAGE_VERSION,
  type FindingsDeltaCoverage,
  type FindingsDeltaRun,
} from '@odysseus/core';
import { createAuditModel, type AuditDocument } from './schemas/audit.schema.js';
import { createFindingModel, type FindingDocument } from './schemas/finding.schema.js';
import { createReportApprovalModel } from './schemas/report-approval.schema.js';

function storedCoverage(coverage: FindingsDeltaCoverage | undefined): FindingsDeltaCoverage {
  return coverage?.version === FINDINGS_DELTA_COVERAGE_VERSION
    ? coverage
    : buildLegacyFindingsDeltaCoverage();
}

export async function findDeltaBaseline(
  connection: Connection,
  current: { siteUrl: string; startedAt: Date },
): Promise<FindingsDeltaRun | null> {
  const candidates = await createAuditModel(connection)
    .find(
      {
        siteUrl: current.siteUrl,
        kind: 'audit',
        startedAt: { $lt: current.startedAt },
        findingsProvenance: { $exists: true },
      },
      { auditId: 1 },
    )
    .sort({ startedAt: -1 })
    .lean<Pick<AuditDocument, 'auditId'>[]>();
  if (candidates.length === 0) return null;

  const approved = new Set<string>(
    await createReportApprovalModel(connection).distinct('auditId', {
      auditId: { $in: candidates.map(({ auditId }) => auditId) },
    }),
  );
  const baselineId = candidates.find(({ auditId }) => approved.has(auditId))?.auditId;
  if (baselineId === undefined) return null;

  const [audit, findings] = await Promise.all([
    createAuditModel(connection).findOne({ auditId: baselineId }).lean<AuditDocument>(),
    createFindingModel(connection)
      .find(
        { auditId: baselineId },
        { findingId: 1, ruleId: 1, category: 1, severity: 1, title: 1, pageUrls: 1, dedupeKey: 1 },
      )
      .lean<FindingDocument[]>(),
  ]);
  if (audit === null || audit.findingsProvenance === undefined) return null;

  return {
    auditId: audit.auditId,
    siteUrl: audit.siteUrl,
    startedAt: new Date(audit.startedAt).toISOString(),
    tool: audit.tool,
    config: { maxPages: audit.config.maxPages, maxDepth: audit.config.maxDepth },
    findingsProvenance: audit.findingsProvenance,
    coverage: storedCoverage(audit.evidenceCoverage),
    findings: findings.map((finding) => ({
      findingId: finding.findingId,
      ruleId: finding.ruleId,
      category: finding.category,
      severity: finding.severity,
      title: finding.title,
      pageUrls: finding.pageUrls,
      dedupeKey: finding.dedupeKey,
    })),
  };
}

/**
 * The current audit's own coverage signature, read back from its persisted
 * record for the delta's current side. Undefined when this audit has no
 * stored signature, so the delta degrades instead of inventing one.
 */
export async function findAuditEvidenceCoverage(
  connection: Connection,
  auditId: string,
): Promise<FindingsDeltaCoverage | undefined> {
  const audit = await createAuditModel(connection)
    .findOne({ auditId }, { evidenceCoverage: 1 })
    .lean<Pick<AuditDocument, 'evidenceCoverage'>>();
  const coverage = audit?.evidenceCoverage;
  return coverage?.version === FINDINGS_DELTA_COVERAGE_VERSION ? coverage : undefined;
}
