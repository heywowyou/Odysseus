/**
 * Plan 077: which stored versions to keep and which to remove. Pure: the
 * snapshot carries every fact the decision needs (database rows, the
 * structure files found on disk, where each audit's files are, and what is
 * still running), so every rule here is unit-testable without I/O.
 *
 * Two levels, both after a grace period counted from the moment an item was
 * superseded (the newer item's own timestamp):
 *
 * - Within an audit, a report, analysis, structure file or quality-run
 *   candidate set is kept while at least one `RetentionKeepReason` names
 *   it. Anything no reason names and superseded long enough goes.
 * - Across audits, an older audit of the same site and kind goes once a
 *   newer, equal-or-broader audit has existed long enough. A delivered one
 *   is slimmed instead, so its report and the findings delta keep working.
 *
 * Rationale and rejected alternatives: docs/decisions/trade-offs.md,
 * "Keep the latest version only".
 */

import type { ScanIntent } from '@odysseus/core';
import type {
  RetentionAnalysisRow,
  RetentionAuditRow,
  RetentionBundleRow,
  RetentionQualityRunRow,
  RetentionReportRow,
  RetentionStoreSnapshot,
} from '@odysseus/store';

export const RETENTION_GRACE_DAYS = 7;
const GRACE_MS = RETENTION_GRACE_DAYS * 86_400_000;

/** Every reason an item inside an audit is kept. Exhaustive by design: the
 *  policy has no fallback that keeps an item without naming why. */
export const RETENTION_KEEP_REASONS = [
  // Reports
  'latest-per-language',
  'latest-generated-per-language',
  'latest-finalized-per-language',
  'finalization-source',
  'approved',
  // Analyses
  'selected',
  'candidate',
  'report-source',
  'newest-per-language',
  // Structure files
  'structure-of-kept-analysis',
  'newest-structure',
  // Report-quality candidate sets and bundle rows
  'active-bundle',
  'operator-approved-or-promoted',
  'newest-run',
] as const;

export type RetentionKeepReason = (typeof RETENTION_KEEP_REASONS)[number];

export type RetentionHoldReason =
  'job-in-flight' | 'report-production' | 'archived-prospect' | 'not-local';

/** Where an audit's files are on the machine running retention. */
export type RetentionStoragePresence = 'local' | 'bucket-only' | 'absent';

export interface RetentionAuditInput extends RetentionAuditRow {
  storage: RetentionStoragePresence;
  /** Work that may still write this audit, if any. */
  busy?: 'job-in-flight' | 'report-production';
}

export interface RetentionStructureFile {
  auditId: string;
  /** File name under `analyses/`. */
  fileName: string;
  /** The document's own `generatedAt`, as analyses record it in
   *  `structureGeneratedAt`. */
  generatedAt: string;
}

export interface RetentionSnapshot extends Omit<RetentionStoreSnapshot, 'audits'> {
  audits: RetentionAuditInput[];
  structures: RetentionStructureFile[];
}

export interface RetentionAuditAction {
  auditId: string;
  siteUrl: string;
  startedAt: Date;
  supersededBy: string;
  supersededAt: Date;
}

export interface RetentionQualityCandidateSet {
  auditId: string;
  qualityRunId: string;
}

export interface RetentionHold {
  auditId: string;
  reason: RetentionHoldReason;
}

export interface RetentionPlan {
  deleteAudits: RetentionAuditAction[];
  slimAudits: RetentionAuditAction[];
  deleteReports: RetentionReportRow[];
  deleteAnalyses: RetentionAnalysisRow[];
  deleteStructureFiles: RetentionStructureFile[];
  deleteQualityCandidates: RetentionQualityCandidateSet[];
  deleteReportBundles: RetentionBundleRow[];
  /** Item key (see the `*Key` helpers) to the reasons that kept it. */
  kept: Map<string, RetentionKeepReason[]>;
  holds: RetentionHold[];
}

export const reportKey = (report: Pick<RetentionReportRow, 'rowId'>): string =>
  `report:${report.rowId}`;
export const analysisKey = (analysis: Pick<RetentionAnalysisRow, 'analysisId'>): string =>
  `analysis:${analysis.analysisId}`;
export const structureKey = (file: Pick<RetentionStructureFile, 'auditId' | 'fileName'>): string =>
  `structure:${file.auditId}/${file.fileName}`;
export const qualityRunKey = (run: Pick<RetentionQualityRunRow, 'qualityRunId'>): string =>
  `quality-run:${run.qualityRunId}`;
export const bundleKey = (bundle: Pick<RetentionBundleRow, 'bundleId'>): string =>
  `bundle:${bundle.bundleId}`;

const SCAN_INTENT_RANK: Record<ScanIntent, number> = {
  'quick-check': 0,
  'prospecting-audit': 1,
  'full-audit': 2,
};

/** A legacy audit with no recorded intent is treated as the broadest kind
 *  when it is the older one, so only a full audit can replace it. */
function rankAsSuperseded(audit: RetentionAuditRow): number {
  return audit.scanIntent === undefined ? 2 : SCAN_INTENT_RANK[audit.scanIntent];
}

/** A legacy audit with no recorded intent never replaces anything: what it
 *  covered is unknown. */
function rankAsSuperseding(audit: RetentionAuditRow): number | undefined {
  return audit.scanIntent === undefined ? undefined : SCAN_INTENT_RANK[audit.scanIntent];
}

/** The earliest newer audit that replaces `older`, or undefined. */
export function findSupersedingAudit(
  older: RetentionAuditRow,
  audits: readonly RetentionAuditRow[],
): RetentionAuditRow | undefined {
  const olderRank = rankAsSuperseded(older);
  let earliest: RetentionAuditRow | undefined;
  for (const newer of audits) {
    if (newer.siteUrl !== older.siteUrl || newer.kind !== older.kind) continue;
    if (newer.startedAt.getTime() <= older.startedAt.getTime()) continue;
    if (!newer.hasFindingsProvenance) continue;
    const newerRank = rankAsSuperseding(newer);
    if (newerRank === undefined || newerRank < olderRank) continue;
    if (earliest === undefined || newer.finishedAt.getTime() < earliest.finishedAt.getTime()) {
      earliest = newer;
    }
  }
  return earliest;
}

/** Delivered work is slimmed, never deleted: a client received something
 *  from it, or a live link still shows it. */
export function isDeliveredAudit(auditId: string, snapshot: RetentionSnapshot): boolean {
  return (
    snapshot.approvals.some((approval) => approval.auditId === auditId) ||
    snapshot.activeBundles.some((active) => active.auditId === auditId) ||
    snapshot.bundles.some(
      (bundle) =>
        bundle.auditId === auditId &&
        (bundle.state === 'operator-approved' || bundle.state === 'promoted'),
    ) ||
    snapshot.reports.some(
      (report) => report.auditId === auditId && report.origin === 'finalized',
    ) ||
    snapshot.livePreviewAuditIds.includes(auditId)
  );
}

function isPastGrace(supersededAt: Date | undefined, now: Date): boolean {
  return supersededAt !== undefined && now.getTime() - supersededAt.getTime() >= GRACE_MS;
}

/** The earliest timestamp after `own` among `all`, which is when the item
 *  at `own` stopped being the newest. */
function supersededAtOf(own: number, all: readonly number[]): Date | undefined {
  let earliest: number | undefined;
  for (const time of all) {
    if (time > own && (earliest === undefined || time < earliest)) earliest = time;
  }
  return earliest === undefined ? undefined : new Date(earliest);
}

function newestBy<T>(items: readonly T[], time: (item: T) => number): T | undefined {
  let newest: T | undefined;
  for (const item of items) {
    if (newest === undefined || time(item) > time(newest)) newest = item;
  }
  return newest;
}

function addReason(
  kept: Map<string, RetentionKeepReason[]>,
  key: string,
  reason: RetentionKeepReason,
) {
  const reasons = kept.get(key);
  if (reasons === undefined) kept.set(key, [reason]);
  else if (!reasons.includes(reason)) reasons.push(reason);
}

function holdFor(
  audit: RetentionAuditInput,
  archivedProspectIds: ReadonlySet<string>,
): RetentionHoldReason | undefined {
  if (audit.busy !== undefined) return audit.busy;
  if (audit.prospectId !== undefined && archivedProspectIds.has(audit.prospectId)) {
    return 'archived-prospect';
  }
  if (audit.storage === 'absent') return 'not-local';
  return undefined;
}

interface WithinAuditPlan {
  deleteReports: RetentionReportRow[];
  deleteAnalyses: RetentionAnalysisRow[];
  deleteStructureFiles: RetentionStructureFile[];
  deleteQualityCandidates: RetentionQualityCandidateSet[];
  deleteReportBundles: RetentionBundleRow[];
}

function planWithinAudit(
  audit: RetentionAuditInput,
  snapshot: RetentionSnapshot,
  now: Date,
  kept: Map<string, RetentionKeepReason[]>,
): WithinAuditPlan {
  const auditId = audit.auditId;
  const reports = snapshot.reports.filter((report) => report.auditId === auditId);
  const analyses = snapshot.analyses.filter((analysis) => analysis.auditId === auditId);
  const structures = snapshot.structures.filter((file) => file.auditId === auditId);
  const runs = snapshot.qualityRuns.filter((run) => run.auditId === auditId);
  const bundles = snapshot.bundles.filter((bundle) => bundle.auditId === auditId);

  // Reports.
  for (const language of new Set(reports.map((report) => report.language))) {
    const inLanguage = reports.filter((report) => report.language === language);
    const time = (report: RetentionReportRow) => report.generatedAt.getTime();
    const latest = newestBy(inLanguage, time);
    if (latest) addReason(kept, reportKey(latest), 'latest-per-language');
    const latestGenerated = newestBy(
      inLanguage.filter((report) => report.origin !== 'finalized'),
      time,
    );
    if (latestGenerated)
      addReason(kept, reportKey(latestGenerated), 'latest-generated-per-language');
    const latestFinalized = newestBy(
      inLanguage.filter((report) => report.origin === 'finalized'),
      time,
    );
    if (latestFinalized) {
      addReason(kept, reportKey(latestFinalized), 'latest-finalized-per-language');
      const source = reports.find(
        (report) =>
          report.reportId !== undefined && report.reportId === latestFinalized.supersedesReportId,
      );
      if (source) addReason(kept, reportKey(source), 'finalization-source');
    }
  }
  const approvedReportIds = new Set(
    snapshot.approvals
      .filter((approval) => approval.auditId === auditId)
      .flatMap((approval) => approval.reportIds),
  );
  for (const report of reports) {
    if (report.reportId !== undefined && approvedReportIds.has(report.reportId)) {
      addReason(kept, reportKey(report), 'approved');
    }
  }
  const keptReports = reports.filter((report) => kept.has(reportKey(report)));

  // Analyses.
  const selection = audit.writingSelection;
  const selectedIds = [selection?.selected?.frAnalysisId, selection?.selected?.enAnalysisId];
  const candidate = selection?.candidate;
  const candidateIds =
    candidate === undefined
      ? []
      : candidate.status === 'failed'
        ? [candidate.partialPair?.frAnalysisId, candidate.partialPair?.enAnalysisId]
        : [candidate.pair.frAnalysisId, candidate.pair.enAnalysisId];
  const reportSourceIds = new Set(keptReports.map((report) => report.analysisId));
  for (const analysis of analyses) {
    if (selectedIds.includes(analysis.analysisId))
      addReason(kept, analysisKey(analysis), 'selected');
    if (candidateIds.includes(analysis.analysisId)) {
      addReason(kept, analysisKey(analysis), 'candidate');
    }
    if (reportSourceIds.has(analysis.analysisId)) {
      addReason(kept, analysisKey(analysis), 'report-source');
    }
  }
  for (const language of new Set(analyses.map((analysis) => analysis.language))) {
    const newest = newestBy(
      analyses.filter((analysis) => analysis.language === language),
      (analysis) => analysis.generatedAt.getTime(),
    );
    if (newest) addReason(kept, analysisKey(newest), 'newest-per-language');
  }
  const keptStructureStamps = new Set(
    analyses
      .filter((analysis) => kept.has(analysisKey(analysis)))
      .map((analysis) => analysis.structureGeneratedAt),
  );

  // Structure files.
  const structureTime = (file: RetentionStructureFile) => Date.parse(file.generatedAt);
  const newestStructure = newestBy(structures, structureTime);
  if (newestStructure) addReason(kept, structureKey(newestStructure), 'newest-structure');
  for (const file of structures) {
    if (keptStructureStamps.has(file.generatedAt)) {
      addReason(kept, structureKey(file), 'structure-of-kept-analysis');
    }
  }

  // Report-quality candidate sets (one per run) and bundle rows.
  const newestRun = newestBy(runs, (run) => run.createdAt.getTime());
  const activeBundleIds = new Set(
    snapshot.activeBundles
      .filter((active) => active.auditId === auditId)
      .map((active) => active.bundleId),
  );
  if (newestRun) addReason(kept, qualityRunKey(newestRun), 'newest-run');
  for (const bundle of bundles) {
    if (activeBundleIds.has(bundle.bundleId)) {
      addReason(kept, bundleKey(bundle), 'active-bundle');
      addReason(kept, qualityRunKey(bundle), 'active-bundle');
    }
    if (bundle.state === 'operator-approved' || bundle.state === 'promoted') {
      addReason(kept, bundleKey(bundle), 'operator-approved-or-promoted');
      addReason(kept, qualityRunKey(bundle), 'operator-approved-or-promoted');
    }
    if (newestRun !== undefined && bundle.qualityRunId === newestRun.qualityRunId) {
      addReason(kept, bundleKey(bundle), 'newest-run');
    }
  }

  const reportTimes = (language: string) =>
    reports.filter((report) => report.language === language).map((r) => r.generatedAt.getTime());
  const analysisTimes = (language: string) =>
    analyses
      .filter((analysis) => analysis.language === language)
      .map((a) => a.generatedAt.getTime());
  const runTimes = runs.map((run) => run.createdAt.getTime());
  const runCreatedAt = new Map(runs.map((run) => [run.qualityRunId, run.createdAt.getTime()]));

  return {
    deleteReports: reports.filter(
      (report) =>
        !kept.has(reportKey(report)) &&
        isPastGrace(
          supersededAtOf(report.generatedAt.getTime(), reportTimes(report.language)),
          now,
        ),
    ),
    deleteAnalyses: analyses.filter(
      (analysis) =>
        !kept.has(analysisKey(analysis)) &&
        isPastGrace(
          supersededAtOf(analysis.generatedAt.getTime(), analysisTimes(analysis.language)),
          now,
        ),
    ),
    deleteStructureFiles: structures.filter(
      (file) =>
        !kept.has(structureKey(file)) &&
        isPastGrace(supersededAtOf(structureTime(file), structures.map(structureTime)), now),
    ),
    deleteQualityCandidates: runs
      .filter(
        (run) =>
          !kept.has(qualityRunKey(run)) &&
          isPastGrace(supersededAtOf(run.createdAt.getTime(), runTimes), now),
      )
      .map((run) => ({ auditId, qualityRunId: run.qualityRunId })),
    deleteReportBundles: bundles.filter((bundle) => {
      if (kept.has(bundleKey(bundle))) return false;
      const own = runCreatedAt.get(bundle.qualityRunId) ?? bundle.createdAt.getTime();
      return isPastGrace(supersededAtOf(own, runTimes), now);
    }),
  };
}

export function planRetention(snapshot: RetentionSnapshot, now: Date): RetentionPlan {
  const plan: RetentionPlan = {
    deleteAudits: [],
    slimAudits: [],
    deleteReports: [],
    deleteAnalyses: [],
    deleteStructureFiles: [],
    deleteQualityCandidates: [],
    deleteReportBundles: [],
    kept: new Map(),
    holds: [],
  };
  const archivedProspectIds = new Set(snapshot.archivedProspectIds);

  for (const audit of snapshot.audits) {
    const superseding = findSupersedingAudit(audit, snapshot.audits);
    const supersededAt = superseding?.finishedAt;
    const replaced = superseding !== undefined && isPastGrace(supersededAt, now);
    const delivered = replaced && isDeliveredAudit(audit.auditId, snapshot);
    const action: RetentionAuditAction | undefined = replaced
      ? {
          auditId: audit.auditId,
          siteUrl: audit.siteUrl,
          startedAt: audit.startedAt,
          supersededBy: superseding.auditId,
          supersededAt: supersededAt!,
        }
      : undefined;

    // A deleted audit takes every version with it; the within-audit rules
    // only apply to an audit that stays.
    const within =
      action !== undefined && !delivered
        ? undefined
        : planWithinAudit(audit, snapshot, now, plan.kept);
    const needsSlim = action !== undefined && delivered && audit.slimmedAt === undefined;
    const hasWork =
      (action !== undefined && !delivered) ||
      needsSlim ||
      (within !== undefined && Object.values(within).some((items) => items.length > 0));
    if (!hasWork) continue;

    const hold = holdFor(audit, archivedProspectIds);
    if (hold !== undefined) {
      plan.holds.push({ auditId: audit.auditId, reason: hold });
      continue;
    }
    if (action !== undefined && !delivered) plan.deleteAudits.push(action);
    if (needsSlim) plan.slimAudits.push(action!);
    if (within !== undefined) {
      plan.deleteReports.push(...within.deleteReports);
      plan.deleteAnalyses.push(...within.deleteAnalyses);
      plan.deleteStructureFiles.push(...within.deleteStructureFiles);
      plan.deleteQualityCandidates.push(...within.deleteQualityCandidates);
      plan.deleteReportBundles.push(...within.deleteReportBundles);
    }
  }
  return plan;
}
