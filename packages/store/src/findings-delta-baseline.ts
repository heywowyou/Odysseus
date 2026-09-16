/**
 * Baseline lookup for the re-audit findings delta (plan 051). The baseline
 * is the most recent earlier audit of the exact same site URL whose report
 * pair was approved for delivery and whose findings carry a provenance
 * stamp. An undelivered rerun is never a baseline, and an unstamped
 * findings set is never compared.
 */

import type { Connection } from 'mongoose';
import type { FindingsDeltaRun } from '@odysseus/core';
import { createAuditModel, type AuditDocument } from './schemas/audit.schema.js';
import { createFindingModel, type FindingDocument } from './schemas/finding.schema.js';
import { createReportApprovalModel } from './schemas/report-approval.schema.js';

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
