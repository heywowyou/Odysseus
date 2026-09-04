/**
 * Report-artifact integrity sweep (issue #62): resolves every stored
 * `reports` row's fileRef against this machine's artifacts root and
 * classifies what is actually there. A reports row describes a paid
 * deliverable (trade-off 44), so a row whose file cannot be produced is
 * a defect worth surfacing proactively, not discovering at delivery
 * time - this sweep is what would have caught the Villas Foch phantom
 * pair immediately.
 *
 * The classification is a pure function over rows plus an fs adapter so
 * it is unit-testable without Mongo or a filesystem; the sweep below is
 * the thin IO wrapper. Verification reuses the same digest convention
 * routes/audits.ts's readVerifiedReport established (sha256 over the
 * file bytes, `sha256:` prefixed in the row's pdfDigest).
 *
 * Why a missing file is not automatically "lost": the artifacts root is
 * per-machine (the local workspace's artifacts/ vs the deployment's
 * /data/artifacts volume) while the database is shared between them, so
 * a file absent here usually lives on the host named in the row's
 * renderedOnHost. The entry's detail states that explicitly instead of
 * leaving the operator to re-derive it.
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { hostname } from 'node:os';
import path from 'node:path';
import type { Connection } from 'mongoose';
import { buildAuditDir, getArtifactsRoot } from '@odysseus/scanner';
import { createAuditModel, createReportModel, type ReportDocument } from '@odysseus/store';

export type ReportIntegrityStatus =
  | 'ok'
  | 'file-missing'
  | 'digest-mismatch'
  | 'digest-unrecorded'
  | 'audit-dir-unknown';

export interface ReportIntegrityInputRow {
  reportId?: string;
  auditId: string;
  language: string;
  generatedAt: Date;
  rendererBuild?: string;
  renderedOnHost?: string;
  fileRef: string;
  pdfDigest?: string;
}

export interface ReportIntegrityFs {
  exists(filePath: string): Promise<boolean>;
  read(filePath: string): Promise<Buffer>;
}

export const nodeReportIntegrityFs: ReportIntegrityFs = {
  exists: (filePath) => fs.stat(filePath).then(() => true, () => false),
  read: (filePath) => fs.readFile(filePath),
};

export interface ReportIntegrityEntry {
  reportId?: string;
  auditId: string;
  language: string;
  generatedAt: Date;
  rendererBuild?: string;
  renderedOnHost?: string;
  fileRef: string;
  status: ReportIntegrityStatus;
  /** Present for digest-mismatch: the sha256 the file on disk actually
   *  hashes to, prefixed to match pdfDigest's own convention. */
  actualDigest?: string;
  /** Operator-facing explanation of the status, including the
   *  rendered-elsewhere annotation when the row names a different host. */
  detail: string;
}

function digestOf(buffer: Buffer): string {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

function renderedElsewhereNote(row: ReportIntegrityInputRow, currentHost: string): string {
  if (row.renderedOnHost === undefined || row.renderedOnHost === currentHost) return '';
  return ` It was rendered on host "${row.renderedOnHost}", so the file may exist on that host's artifacts root rather than having been lost.`;
}

export async function classifyReportRows(
  rows: readonly ReportIntegrityInputRow[],
  auditDirByAuditId: ReadonlyMap<string, string>,
  currentHost: string,
  fsx: ReportIntegrityFs = nodeReportIntegrityFs,
): Promise<ReportIntegrityEntry[]> {
  const entries: ReportIntegrityEntry[] = [];
  for (const row of rows) {
    const base = {
      ...(row.reportId !== undefined ? { reportId: row.reportId } : {}),
      auditId: row.auditId,
      language: row.language,
      generatedAt: row.generatedAt,
      ...(row.rendererBuild !== undefined ? { rendererBuild: row.rendererBuild } : {}),
      ...(row.renderedOnHost !== undefined ? { renderedOnHost: row.renderedOnHost } : {}),
      fileRef: row.fileRef,
    };

    const auditDir = auditDirByAuditId.get(row.auditId);
    if (auditDir === undefined) {
      entries.push({
        ...base,
        status: 'audit-dir-unknown',
        detail:
          'No audits row could be resolved for this report, so its audit directory (and fileRef with it) cannot be derived on this machine.',
      });
      continue;
    }

    const filePath = path.join(auditDir, row.fileRef);
    if (!(await fsx.exists(filePath))) {
      entries.push({
        ...base,
        status: 'file-missing',
        detail:
          `The fileRef resolves to ${filePath}, which does not exist under this machine's artifacts root.` +
          renderedElsewhereNote(row, currentHost),
      });
      continue;
    }

    if (row.pdfDigest === undefined) {
      entries.push({
        ...base,
        status: 'digest-unrecorded',
        detail: 'The file exists but the row records no pdfDigest, so it cannot be verified.',
      });
      continue;
    }

    const actualDigest = digestOf(await fsx.read(filePath));
    const stored = row.pdfDigest.replace(/^sha256:/, '');
    if (actualDigest.replace(/^sha256:/, '') !== stored) {
      entries.push({
        ...base,
        status: 'digest-mismatch',
        actualDigest,
        detail: `The file on disk hashes to ${actualDigest}, not the row's ${row.pdfDigest}: it is not the document the row describes.`,
      });
      continue;
    }

    entries.push({
      ...base,
      status: 'ok',
      detail: 'File present and digest verified.',
    });
  }
  return entries;
}

/** Reads every reports row plus the audits rows needed to re-derive each
 *  audit directory, and classifies them all against this machine's
 *  artifacts root. Unbounded by design: the reports collection holds one
 *  row per rendered deliverable, small by construction, and the whole
 *  point is to look at all of them. */
export async function sweepReportIntegrity(
  connection: Connection,
  options?: { artifactsRoot?: string; currentHost?: string },
): Promise<ReportIntegrityEntry[]> {
  const reportModel = createReportModel(connection);
  const rows = await reportModel
    .find<ReportDocument>({})
    .sort({ auditId: 1, generatedAt: 1 })
    .lean<ReportDocument[]>();

  const auditModel = createAuditModel(connection);
  const audits = await auditModel
    .find({}, { auditId: 1, siteUrl: 1, startedAt: 1 })
    .lean<{ auditId: string; siteUrl: string; startedAt: Date }[]>();
  const artifactsRoot = options?.artifactsRoot ?? getArtifactsRoot();
  const auditDirByAuditId = new Map<string, string>();
  for (const audit of audits) {
    try {
      auditDirByAuditId.set(
        audit.auditId,
        buildAuditDir(artifactsRoot, new URL(audit.siteUrl).hostname, audit.startedAt),
      );
    } catch {
      // An unusable siteUrl leaves this audit's reports to classify as
      // audit-dir-unknown rather than crashing the sweep.
    }
  }

  return classifyReportRows(
    rows,
    auditDirByAuditId,
    options?.currentHost ?? hostname(),
    nodeReportIntegrityFs,
  );
}
