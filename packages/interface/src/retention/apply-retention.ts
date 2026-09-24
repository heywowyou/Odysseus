/**
 * Plan 077: runs one retention pass. It assembles the policy's snapshot
 * (database rows from the store, then the facts only this machine knows:
 * which audit directories and structure files exist here, and what is still
 * running), asks `planRetention` what to remove, measures it, and on
 * `apply` removes it.
 *
 * Per item, files go before rows: local disk, then the bucket, then Mongo.
 * A storage failure leaves the rows that name what is left, so the next run
 * finds the same item and finishes it (the order issue #384 set for audit
 * deletion). One item's failure is recorded and the run moves on.
 *
 * A dry run makes no delete call of any kind and writes no run record.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Connection } from 'mongoose';
import {
  buildArtifactBucketKey,
  buildAuditArtifactBucketPrefix,
  buildAuditDir,
  CRAWL_CHECKPOINT_FILENAME,
  CRAWL_STATE_FILENAME,
} from '@odysseus/scanner';
import {
  deleteAnalysesById,
  deleteAuditCascade,
  deleteFinishedScanJobsForAudit,
  deleteReportBundlesById,
  deleteReportsById,
  listRetentionJobRefs,
  loadRetentionSnapshot,
  markAuditSlimmed,
  persistRetentionRun,
  type RetentionAnalysisRow,
  type RetentionAuditRow,
  type RetentionReportRow,
  type RetentionRunCounts,
  type RetentionRunDocument,
  type RetentionRunFailure,
} from '@odysseus/store';
import type { ArtifactStore } from '../artifacts/artifact-store.js';
import {
  deleteAuditArtifacts,
  deletePrefix,
  reportQualityCandidatesPrefix,
} from '../artifacts/delete-audit-artifacts.js';
import {
  planRetention,
  type RetentionAuditInput,
  type RetentionPlan,
  type RetentionStoragePresence,
  type RetentionStructureFile,
} from './retention-policy.js';

/** A run that would delete or slim more audits than this refuses as a whole. */
export const RETENTION_RUN_CAP = 20;

/** Raw scan evidence a slimmed audit loses. Everything else in its directory
 *  (manifest, findings, audit scope, evidence snapshots, analyses, reports)
 *  stays, so its delivered report and the findings delta keep working. */
const SLIMMED_PATHS = ['pages', CRAWL_CHECKPOINT_FILENAME, CRAWL_STATE_FILENAME] as const;

/** What only a running server knows. The CLI runs without it and sees
 *  queued and running jobs through their stored status only. */
export interface RetentionInProcessState {
  inFlightJobIds(): readonly string[];
  isReportProductionInFlight(auditId: string): boolean;
}

export interface RetentionRunOptions {
  connection: Connection;
  artifactsRoot: string;
  store: ArtifactStore | undefined;
  now: Date;
  apply: boolean;
  /** Lifts the per-run cap. The scheduled sweeper never passes it. */
  allowLarge: boolean;
  trigger: RetentionRunDocument['trigger'];
  inProcess?: RetentionInProcessState;
}

export interface RetentionAuditSummary {
  auditId: string;
  siteUrl: string;
  supersededBy: string;
  bytes: number;
}

export interface RetentionItemSummary {
  auditId: string;
  kind: 'report' | 'analysis' | 'structure' | 'quality-candidates' | 'report-bundle';
  id: string;
  bytes: number;
}

export interface RetentionRunResult {
  plan: RetentionPlan;
  deleteAudits: RetentionAuditSummary[];
  slimAudits: RetentionAuditSummary[];
  items: RetentionItemSummary[];
  refusal?: NonNullable<RetentionRunDocument['refusal']>;
  counts: RetentionRunCounts;
  /** Measured before deletion on a dry run too. Remote bytes are the local
   *  sizes of the files whose bucket mirror was removed; objects that only
   *  ever lived in the bucket (quality candidates) are counted, not sized. */
  bytesReclaimed: { local: number; remote: number };
  remoteObjectsDeleted: number;
  failures: RetentionRunFailure[];
  /** Present when an applied run was recorded. */
  record?: RetentionRunDocument;
}

async function pathBytes(target: string): Promise<number> {
  let stat;
  try {
    stat = await fs.stat(target);
  } catch {
    return 0;
  }
  if (!stat.isDirectory()) return stat.size;
  const entries = await fs.readdir(target, { withFileTypes: true, recursive: true });
  let total = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    try {
      total += (await fs.stat(path.join(entry.parentPath, entry.name))).size;
    } catch {
      // Removed between listing and stat.
    }
  }
  return total;
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

interface AuditLocation {
  hostname: string;
  auditDir: string;
}

function locateAudit(artifactsRoot: string, audit: RetentionAuditRow): AuditLocation {
  const hostname = new URL(audit.siteUrl).hostname;
  return { hostname, auditDir: buildAuditDir(artifactsRoot, hostname, audit.startedAt) };
}

async function storagePresence(
  location: AuditLocation,
  audit: RetentionAuditRow,
  store: ArtifactStore | undefined,
): Promise<RetentionStoragePresence> {
  if (await exists(location.auditDir)) return 'local';
  if (store === undefined) return 'absent';
  const keys = await store.list(buildAuditArtifactBucketPrefix(location.hostname, audit.startedAt));
  return keys.length > 0 ? 'bucket-only' : 'absent';
}

async function readJsonField(file: string, field: string): Promise<string | undefined> {
  try {
    const value = (JSON.parse(await fs.readFile(file, 'utf-8')) as Record<string, unknown>)[field];
    return typeof value === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
}

async function listAnalysesDir(auditDir: string): Promise<string[]> {
  try {
    return await fs.readdir(path.join(auditDir, 'analyses'));
  } catch {
    return [];
  }
}

async function listStructureFiles(
  auditId: string,
  auditDir: string,
): Promise<RetentionStructureFile[]> {
  const files: RetentionStructureFile[] = [];
  for (const fileName of await listAnalysesDir(auditDir)) {
    if (!fileName.endsWith('-structure.json')) continue;
    // A structure file whose date cannot be read is never deleted: without
    // it the policy cannot tell whether a kept analysis was written from it.
    const generatedAt = await readJsonField(
      path.join(auditDir, 'analyses', fileName),
      'generatedAt',
    );
    if (generatedAt !== undefined) files.push({ auditId, fileName, generatedAt });
  }
  return files;
}

/** Analysis files by the id they record, read rather than guessed from the
 *  timestamped name. */
async function analysisFilesById(auditDir: string): Promise<Map<string, string>> {
  const byId = new Map<string, string>();
  for (const fileName of await listAnalysesDir(auditDir)) {
    if (!/-(fr|en)\.json$/u.test(fileName)) continue;
    const analysisId = await readJsonField(path.join(auditDir, 'analyses', fileName), 'analysisId');
    if (analysisId !== undefined) byId.set(analysisId, path.join('analyses', fileName));
  }
  return byId;
}

function reportFiles(report: RetentionReportRow): string[] {
  return [
    report.fileRef,
    `${report.fileRef}.provenance.json`,
    `${report.fileRef}.overrides.json`,
    ...(report.lightFileRef !== undefined ? [report.lightFileRef] : []),
  ];
}

function analysisFiles(relativePath: string): string[] {
  return [relativePath, relativePath.replace(/\.json$/u, '-critic.json')];
}

/** Deletes one exact key and says whether it was there. */
async function deleteKey(store: ArtifactStore, key: string): Promise<number> {
  const present = (await store.list(key)).includes(key);
  await store.delete(key);
  return present ? 1 : 0;
}

function emptyCounts(): RetentionRunCounts {
  return {
    auditsDeleted: 0,
    auditsSlimmed: 0,
    reportsDeleted: 0,
    analysesDeleted: 0,
    structureFilesDeleted: 0,
    qualityCandidateSetsDeleted: 0,
    reportBundlesDeleted: 0,
    auditsHeld: 0,
  };
}

export async function runRetention(options: RetentionRunOptions): Promise<RetentionRunResult> {
  const startedAt = new Date();
  const { connection, artifactsRoot, store, now } = options;

  const storeSnapshot = await loadRetentionSnapshot(connection, now);
  const jobRefs = await listRetentionJobRefs(connection, options.inProcess?.inFlightJobIds() ?? []);
  const auditsWithJobs = new Set(jobRefs.flatMap((job) => job.auditIds));

  const locations = new Map<string, AuditLocation>();
  const audits: RetentionAuditInput[] = [];
  const structures: RetentionStructureFile[] = [];
  for (const audit of storeSnapshot.audits) {
    let location: AuditLocation;
    try {
      location = locateAudit(artifactsRoot, audit);
    } catch {
      // A site URL no directory can be built from has nothing here to remove.
      audits.push({ ...audit, storage: 'absent' });
      continue;
    }
    locations.set(audit.auditId, location);
    const busy = auditsWithJobs.has(audit.auditId)
      ? ('job-in-flight' as const)
      : options.inProcess?.isReportProductionInFlight(audit.auditId)
        ? ('report-production' as const)
        : undefined;
    audits.push({
      ...audit,
      storage: await storagePresence(location, audit, store),
      ...(busy !== undefined ? { busy } : {}),
    });
    structures.push(...(await listStructureFiles(audit.auditId, location.auditDir)));
  }

  const plan = planRetention({ ...storeSnapshot, audits, structures }, now);
  const counts = emptyCounts();
  counts.auditsHeld = plan.holds.length;
  const result: RetentionRunResult = {
    plan,
    deleteAudits: [],
    slimAudits: [],
    items: [],
    counts,
    bytesReclaimed: { local: 0, remote: 0 },
    remoteObjectsDeleted: 0,
    failures: [],
  };

  // Measure everything first, so the dry run reports what --apply would do.
  const analysisFileMaps = new Map<string, Map<string, string>>();
  const analysisFileMap = async (auditId: string) => {
    const location = locations.get(auditId);
    if (location === undefined) return new Map<string, string>();
    let map = analysisFileMaps.get(auditId);
    if (map === undefined) {
      map = await analysisFilesById(location.auditDir);
      analysisFileMaps.set(auditId, map);
    }
    return map;
  };
  const filesBytes = async (auditId: string, relativePaths: readonly string[]) => {
    const location = locations.get(auditId);
    if (location === undefined) return 0;
    let total = 0;
    for (const relativePath of relativePaths) {
      total += await pathBytes(path.join(location.auditDir, relativePath));
    }
    return total;
  };

  for (const action of plan.deleteAudits) {
    const location = locations.get(action.auditId);
    result.deleteAudits.push({
      auditId: action.auditId,
      siteUrl: action.siteUrl,
      supersededBy: action.supersededBy,
      bytes: location === undefined ? 0 : await pathBytes(location.auditDir),
    });
  }
  for (const action of plan.slimAudits) {
    result.slimAudits.push({
      auditId: action.auditId,
      siteUrl: action.siteUrl,
      supersededBy: action.supersededBy,
      bytes: await filesBytes(action.auditId, SLIMMED_PATHS),
    });
  }
  for (const report of plan.deleteReports) {
    result.items.push({
      auditId: report.auditId,
      kind: 'report',
      id: report.reportId ?? report.rowId,
      bytes: await filesBytes(report.auditId, reportFiles(report)),
    });
  }
  const analysisPaths = new Map<RetentionAnalysisRow, string | undefined>();
  for (const analysis of plan.deleteAnalyses) {
    const relativePath = (await analysisFileMap(analysis.auditId)).get(analysis.analysisId);
    analysisPaths.set(analysis, relativePath);
    result.items.push({
      auditId: analysis.auditId,
      kind: 'analysis',
      id: analysis.analysisId,
      bytes:
        relativePath === undefined
          ? 0
          : await filesBytes(analysis.auditId, analysisFiles(relativePath)),
    });
  }
  for (const file of plan.deleteStructureFiles) {
    result.items.push({
      auditId: file.auditId,
      kind: 'structure',
      id: file.fileName,
      bytes: await filesBytes(file.auditId, [path.join('analyses', file.fileName)]),
    });
  }
  for (const set of plan.deleteQualityCandidates) {
    result.items.push({
      auditId: set.auditId,
      kind: 'quality-candidates',
      id: set.qualityRunId,
      bytes: 0,
    });
  }
  for (const bundle of plan.deleteReportBundles) {
    result.items.push({
      auditId: bundle.auditId,
      kind: 'report-bundle',
      id: bundle.bundleId,
      bytes: 0,
    });
  }

  if (
    !options.allowLarge &&
    (plan.deleteAudits.length > RETENTION_RUN_CAP || plan.slimAudits.length > RETENTION_RUN_CAP)
  ) {
    result.refusal = {
      reason: 'cap-exceeded',
      auditsToDelete: plan.deleteAudits.length,
      auditsToSlim: plan.slimAudits.length,
    };
  }

  if (!options.apply) {
    result.bytesReclaimed.local =
      result.deleteAudits.reduce((sum, audit) => sum + audit.bytes, 0) +
      result.slimAudits.reduce((sum, audit) => sum + audit.bytes, 0) +
      result.items.reduce((sum, item) => sum + item.bytes, 0);
    return result;
  }
  if (result.refusal !== undefined) {
    result.record = await persistRetentionRun(connection, {
      trigger: options.trigger,
      startedAt,
      finishedAt: new Date(),
      counts,
      bytesReclaimed: result.bytesReclaimed,
      remoteObjectsDeleted: 0,
      refusal: result.refusal,
      failures: [],
    });
    return result;
  }

  const fail = (auditId: string, step: string, error: unknown) => {
    result.failures.push({
      auditId,
      step,
      message: error instanceof Error ? error.message : String(error),
    });
  };
  const reclaim = (bytes: number, mirrored: boolean) => {
    result.bytesReclaimed.local += bytes;
    if (mirrored) result.bytesReclaimed.remote += bytes;
  };

  /** Removes files inside one audit: local first, then the bucket mirror.
   *  `pages` is a directory, so its mirror is a key prefix. */
  const removeAuditFiles = async (auditId: string, relativePaths: readonly string[]) => {
    const location = locations.get(auditId)!;
    const audit = audits.find((row) => row.auditId === auditId)!;
    for (const relativePath of relativePaths) {
      const localPath = path.join(location.auditDir, relativePath);
      const bytes = await pathBytes(localPath);
      await fs.rm(localPath, { recursive: true, force: true });
      if (store !== undefined) {
        const key = buildArtifactBucketKey(location.hostname, audit.startedAt, relativePath);
        result.remoteObjectsDeleted +=
          relativePath === 'pages'
            ? await deletePrefix(store, `${key}/`)
            : await deleteKey(store, key);
      }
      reclaim(bytes, store !== undefined);
    }
  };

  for (const summary of result.deleteAudits) {
    const audit = audits.find((row) => row.auditId === summary.auditId)!;
    try {
      const removed = await deleteAuditArtifacts(
        { siteUrl: audit.siteUrl, startedAt: audit.startedAt, auditId: audit.auditId },
        { artifactsRoot, store },
      );
      result.remoteObjectsDeleted += removed.remoteObjectsDeleted ?? 0;
      reclaim(summary.bytes, removed.remoteObjectsDeleted !== null);
    } catch (error) {
      fail(summary.auditId, 'audit-storage', error);
      continue;
    }
    try {
      await deleteAuditCascade(connection, summary.auditId);
      await deleteFinishedScanJobsForAudit(connection, summary.auditId);
      counts.auditsDeleted += 1;
    } catch (error) {
      fail(summary.auditId, 'audit-records', error);
    }
  }

  for (const summary of result.slimAudits) {
    try {
      await removeAuditFiles(summary.auditId, SLIMMED_PATHS);
      await markAuditSlimmed(connection, summary.auditId, new Date());
      counts.auditsSlimmed += 1;
    } catch (error) {
      fail(summary.auditId, 'slim', error);
    }
  }

  for (const report of plan.deleteReports) {
    try {
      await removeAuditFiles(report.auditId, reportFiles(report));
      counts.reportsDeleted += await deleteReportsById(connection, [report.rowId]);
    } catch (error) {
      fail(report.auditId, 'report', error);
    }
  }

  for (const analysis of plan.deleteAnalyses) {
    try {
      const relativePath = analysisPaths.get(analysis);
      if (relativePath !== undefined) {
        await removeAuditFiles(analysis.auditId, analysisFiles(relativePath));
      }
      counts.analysesDeleted += await deleteAnalysesById(connection, [analysis.analysisId]);
    } catch (error) {
      fail(analysis.auditId, 'analysis', error);
    }
  }

  for (const file of plan.deleteStructureFiles) {
    try {
      await removeAuditFiles(file.auditId, [path.join('analyses', file.fileName)]);
      counts.structureFilesDeleted += 1;
    } catch (error) {
      fail(file.auditId, 'structure', error);
    }
  }

  for (const set of plan.deleteQualityCandidates) {
    try {
      if (store !== undefined) {
        result.remoteObjectsDeleted += await deletePrefix(
          store,
          `${reportQualityCandidatesPrefix(set.auditId)}${set.qualityRunId}/`,
        );
      }
      counts.qualityCandidateSetsDeleted += 1;
    } catch (error) {
      fail(set.auditId, 'quality-candidates', error);
    }
  }

  for (const bundle of plan.deleteReportBundles) {
    try {
      counts.reportBundlesDeleted += await deleteReportBundlesById(connection, [bundle.bundleId]);
    } catch (error) {
      fail(bundle.auditId, 'report-bundle', error);
    }
  }

  result.record = await persistRetentionRun(connection, {
    trigger: options.trigger,
    startedAt,
    finishedAt: new Date(),
    counts,
    bytesReclaimed: result.bytesReclaimed,
    remoteObjectsDeleted: result.remoteObjectsDeleted,
    failures: result.failures,
  });
  return result;
}
