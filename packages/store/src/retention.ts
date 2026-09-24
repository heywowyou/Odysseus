/**
 * Plan 077: the database half of retention. `loadRetentionSnapshot` reads
 * the narrow projections the interface's pure policy decides from; the
 * targeted deletes remove exactly the rows the policy named. No filesystem
 * access here (package boundary): the interface resolves and removes files
 * first, then calls these, so a storage failure leaves the rows naming what
 * is still to be removed.
 */

import { randomUUID } from 'node:crypto';
import type { Connection } from 'mongoose';
import { Types } from 'mongoose';
import type { ManifestKind, ReportLanguage, ScanIntent, WritingSelection } from '@odysseus/core';
import { createAnalysisModel } from './schemas/analysis.schema.js';
import { createAuditModel } from './schemas/audit.schema.js';
import { createJobModel, JOB_STATUSES_CAN_STILL_WRITE } from './schemas/job.schema.js';
import { createOutreachPreviewModel } from './schemas/outreach-preview.schema.js';
import { createProspectHubModel } from './schemas/prospect-hub.schema.js';
import { createReportApprovalModel } from './schemas/report-approval.schema.js';
import { createReportModel } from './schemas/report.schema.js';
import {
  createActiveReportBundleModel,
  createReportBundleModel,
  createReportQualityRunModel,
  type ReportBundleDocument,
} from './schemas/report-quality.schema.js';
import {
  createRetentionRunModel,
  RETENTION_RUN_TTL_DAYS,
  type RetentionRunDocument,
} from './schemas/retention-run.schema.js';

export interface RetentionAuditRow {
  auditId: string;
  siteUrl: string;
  kind: ManifestKind;
  scanIntent?: ScanIntent;
  startedAt: Date;
  finishedAt: Date;
  /** Finished and normalized: only such an audit can supersede another. */
  hasFindingsProvenance: boolean;
  prospectId?: string;
  slimmedAt?: Date;
  writingSelection?: WritingSelection;
}

export interface RetentionReportRow {
  /** The Mongo `_id`: legacy rows carry no `reportId`, and a row is deleted
   *  by this key. */
  rowId: string;
  reportId?: string;
  auditId: string;
  analysisId?: string;
  language: ReportLanguage;
  origin: 'pipeline' | 'finalized';
  generatedAt: Date;
  supersedesReportId?: string;
  fileRef: string;
  lightFileRef?: string;
}

export interface RetentionAnalysisRow {
  analysisId: string;
  auditId: string;
  language: ReportLanguage;
  generatedAt: Date;
  structureGeneratedAt?: string;
}

export interface RetentionBundleRow {
  bundleId: string;
  auditId: string;
  qualityRunId: string;
  state: ReportBundleDocument['state'];
  createdAt: Date;
}

export interface RetentionQualityRunRow {
  qualityRunId: string;
  auditId: string;
  createdAt: Date;
}

export interface RetentionJobRef {
  jobId: string;
  auditIds: string[];
}

export interface RetentionStoreSnapshot {
  audits: RetentionAuditRow[];
  reports: RetentionReportRow[];
  analyses: RetentionAnalysisRow[];
  /** Every report id any approval names, French or English. */
  approvals: { auditId: string; reportIds: string[] }[];
  bundles: RetentionBundleRow[];
  activeBundles: { auditId: string; bundleId: string; qualityRunId: string }[];
  qualityRuns: RetentionQualityRunRow[];
  /** Audits a live outreach preview is built from (not revoked, not expired). */
  livePreviewAuditIds: string[];
  archivedProspectIds: string[];
}

export async function loadRetentionSnapshot(
  connection: Connection,
  now: Date,
): Promise<RetentionStoreSnapshot> {
  const [audits, reports, analyses, approvals, bundles, activeBundles, runs, previews, prospects] =
    await Promise.all([
      createAuditModel(connection)
        .find({})
        .select({
          _id: 0,
          auditId: 1,
          siteUrl: 1,
          kind: 1,
          scanIntent: 1,
          startedAt: 1,
          finishedAt: 1,
          'findingsProvenance.findingsDigest': 1,
          prospectId: 1,
          retention: 1,
          'reportPreparation.writingSelection': 1,
        })
        .lean<
          Array<{
            auditId: string;
            siteUrl: string;
            kind: ManifestKind;
            scanIntent?: ScanIntent;
            startedAt: Date;
            finishedAt: Date;
            findingsProvenance?: { findingsDigest?: string };
            prospectId?: string;
            retention?: { slimmedAt: Date };
            reportPreparation?: { writingSelection?: WritingSelection };
          }>
        >(),
      createReportModel(connection)
        .find({})
        .select({
          _id: 1,
          reportId: 1,
          auditId: 1,
          analysisId: 1,
          language: 1,
          origin: 1,
          generatedAt: 1,
          'finalization.supersedesReportId': 1,
          fileRef: 1,
          'variants.light.fileRef': 1,
        })
        .lean<
          Array<{
            _id: Types.ObjectId;
            reportId?: string;
            auditId: string;
            analysisId?: string;
            language: ReportLanguage;
            origin?: 'pipeline' | 'finalized';
            generatedAt: Date;
            finalization?: { supersedesReportId?: string };
            fileRef: string;
            variants?: { light?: { fileRef?: string } };
          }>
        >(),
      createAnalysisModel(connection)
        .find({})
        .select({
          _id: 0,
          analysisId: 1,
          auditId: 1,
          language: 1,
          generatedAt: 1,
          structureGeneratedAt: 1,
        })
        .lean<RetentionAnalysisRow[]>(),
      createReportApprovalModel(connection)
        .find({})
        .select({ _id: 0, auditId: 1, 'fr.reportId': 1, 'en.reportId': 1 })
        .lean<Array<{ auditId: string; fr?: { reportId: string }; en?: { reportId: string } }>>(),
      createReportBundleModel(connection)
        .find({})
        .select({ _id: 0, bundleId: 1, auditId: 1, qualityRunId: 1, state: 1, createdAt: 1 })
        .lean<RetentionBundleRow[]>(),
      createActiveReportBundleModel(connection)
        .find({})
        .select({ _id: 0, auditId: 1, bundleId: 1, qualityRunId: 1 })
        .lean<Array<{ auditId: string; bundleId: string; qualityRunId: string }>>(),
      createReportQualityRunModel(connection)
        .find({})
        .select({ _id: 0, qualityRunId: 1, auditId: 1, createdAt: 1 })
        .lean<RetentionQualityRunRow[]>(),
      createOutreachPreviewModel(connection)
        .find({ auditId: { $exists: true }, status: 'live', expiresAt: { $gt: now } })
        .select({ _id: 0, auditId: 1 })
        .lean<Array<{ auditId: string }>>(),
      createProspectHubModel(connection)
        .find({ archivedAt: { $exists: true } })
        .select({ _id: 0, prospectId: 1 })
        .lean<Array<{ prospectId: string }>>(),
    ]);

  return {
    audits: audits.map((audit) => ({
      auditId: audit.auditId,
      siteUrl: audit.siteUrl,
      kind: audit.kind,
      ...(audit.scanIntent !== undefined ? { scanIntent: audit.scanIntent } : {}),
      startedAt: audit.startedAt,
      finishedAt: audit.finishedAt,
      hasFindingsProvenance: audit.findingsProvenance?.findingsDigest !== undefined,
      ...(audit.prospectId !== undefined ? { prospectId: audit.prospectId } : {}),
      ...(audit.retention?.slimmedAt !== undefined ? { slimmedAt: audit.retention.slimmedAt } : {}),
      ...(audit.reportPreparation?.writingSelection !== undefined
        ? { writingSelection: audit.reportPreparation.writingSelection }
        : {}),
    })),
    reports: reports.map((report) => ({
      rowId: report._id.toHexString(),
      ...(report.reportId !== undefined ? { reportId: report.reportId } : {}),
      auditId: report.auditId,
      ...(report.analysisId !== undefined ? { analysisId: report.analysisId } : {}),
      language: report.language,
      origin: report.origin === 'finalized' ? 'finalized' : 'pipeline',
      generatedAt: report.generatedAt,
      ...(report.finalization?.supersedesReportId !== undefined
        ? { supersedesReportId: report.finalization.supersedesReportId }
        : {}),
      fileRef: report.fileRef,
      ...(report.variants?.light?.fileRef !== undefined
        ? { lightFileRef: report.variants.light.fileRef }
        : {}),
    })),
    analyses,
    approvals: approvals.map((approval) => ({
      auditId: approval.auditId,
      reportIds: [approval.fr?.reportId, approval.en?.reportId].filter(
        (id): id is string => id !== undefined,
      ),
    })),
    bundles,
    activeBundles,
    qualityRuns: runs,
    livePreviewAuditIds: [...new Set(previews.map((preview) => preview.auditId))],
    archivedProspectIds: prospects.map((prospect) => prospect.prospectId),
  };
}

/** Jobs that may still write an audit: every job whose stored status can
 *  still write, plus the named ids (a server passes the jobs its own queue
 *  is still running, which includes a stopped job finishing its stage). */
export async function listRetentionJobRefs(
  connection: Connection,
  inFlightJobIds: readonly string[] = [],
): Promise<RetentionJobRef[]> {
  const jobs = await createJobModel(connection)
    .find({
      $or: [
        { status: { $in: [...JOB_STATUSES_CAN_STILL_WRITE] } },
        { jobId: { $in: [...inFlightJobIds] } },
      ],
    })
    .select({ _id: 0, jobId: 1, auditId: 1, auditIds: 1, 'urlResults.auditId': 1 })
    .lean<
      Array<{
        jobId: string;
        auditId?: string;
        auditIds?: string[];
        urlResults?: Array<{ auditId?: string }>;
      }>
    >();
  return jobs.map((job) => ({
    jobId: job.jobId,
    auditIds: [
      ...new Set(
        [
          job.auditId,
          ...(job.auditIds ?? []),
          ...(job.urlResults ?? []).map((row) => row.auditId),
        ].filter((id): id is string => id !== undefined),
      ),
    ],
  }));
}

export async function deleteReportsById(
  connection: Connection,
  rowIds: readonly string[],
): Promise<number> {
  if (rowIds.length === 0) return 0;
  const result = await createReportModel(connection)
    .deleteMany({ _id: { $in: rowIds.map((id) => new Types.ObjectId(id)) } })
    .exec();
  return result.deletedCount;
}

export async function deleteAnalysesById(
  connection: Connection,
  analysisIds: readonly string[],
): Promise<number> {
  if (analysisIds.length === 0) return 0;
  const result = await createAnalysisModel(connection)
    .deleteMany({ analysisId: { $in: [...analysisIds] } })
    .exec();
  return result.deletedCount;
}

/** Never removes a bundle that is active, operator-approved or promoted,
 *  whatever the caller passes: those are delivered state. */
export async function deleteReportBundlesById(
  connection: Connection,
  bundleIds: readonly string[],
): Promise<number> {
  if (bundleIds.length === 0) return 0;
  const active = await createActiveReportBundleModel(connection)
    .find({ bundleId: { $in: [...bundleIds] } })
    .select({ _id: 0, bundleId: 1 })
    .lean<Array<{ bundleId: string }>>();
  const protectedIds = new Set(active.map((row) => row.bundleId));
  const result = await createReportBundleModel(connection)
    .deleteMany({
      bundleId: { $in: bundleIds.filter((id) => !protectedIds.has(id)) },
      state: { $nin: ['operator-approved', 'promoted'] },
    })
    .exec();
  return result.deletedCount;
}

export async function markAuditSlimmed(
  connection: Connection,
  auditId: string,
  slimmedAt: Date,
): Promise<void> {
  await createAuditModel(connection)
    .updateOne({ auditId }, { $set: { retention: { slimmedAt } } })
    .exec();
}

/** The slim marker for one audit, read by every route that needs raw scan
 *  evidence before it starts. */
export async function getAuditSlimmedAt(
  connection: Connection,
  auditId: string,
): Promise<Date | undefined> {
  const audit = await createAuditModel(connection)
    .findOne({ auditId })
    .select({ _id: 0, retention: 1 })
    .lean<{ retention?: { slimmedAt: Date } }>();
  return audit?.retention?.slimmedAt;
}

export type NewRetentionRun = Omit<RetentionRunDocument, 'runId' | 'expiresAt'>;

export async function persistRetentionRun(
  connection: Connection,
  run: NewRetentionRun,
): Promise<RetentionRunDocument> {
  const document: RetentionRunDocument = {
    ...run,
    runId: randomUUID(),
    expiresAt: new Date(run.finishedAt.getTime() + RETENTION_RUN_TTL_DAYS * 86_400_000),
  };
  await createRetentionRunModel(connection).create(document);
  return document;
}

export async function getLatestRetentionRun(
  connection: Connection,
): Promise<RetentionRunDocument | null> {
  return createRetentionRunModel(connection)
    .findOne({})
    .sort({ startedAt: -1 })
    .select({ _id: 0, __v: 0 })
    .lean<RetentionRunDocument>();
}
