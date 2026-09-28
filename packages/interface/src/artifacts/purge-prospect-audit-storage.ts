/**
 * Issue #381: archive retention. Archiving keeps the prospect's CRM record
 * and correspondence but removes every audit it owns: the audit's local and
 * bucket artifacts (`deleteAuditArtifacts`, issue #384), its documents
 * (`deleteAuditCascade`) and the finished scan jobs that produced it.
 *
 * Per audit, storage goes before records, so a failure leaves the audit
 * listed on the archived prospect and a retry of the archive (or the
 * `odysseus artifacts archived-prospects` reconciliation) resumes where it
 * stopped. An archived prospect that still owns audits IS the durable
 * "cleanup incomplete" state; no second flag can disagree with it.
 *
 * Issue #560: an audit retention counts as delivered (an approval, an
 * active or approved bundle, a finalized report, a live preview; trade-off
 * 117) is slimmed, not deleted, as a retention run would treat it: a won
 * client's approved report and the baseline a paid re-audit compares
 * against survive the archive. A slimmed audit stays on the archived
 * prospect and is not pending cleanup.
 *
 * Outreach previews are untouched: a published preview is a self-contained
 * document in the previews bucket and does not read audit artifacts.
 * The caller must refuse first while a job for the prospect is queued or
 * running, while a stopped job is still finishing its stage in this
 * process, or while one of its audits is in report production, since any of
 * that work could recreate what is removed here.
 */

import type { Connection } from 'mongoose';
import {
  deleteAuditCascade,
  deleteFinishedScanJobsForAudit,
  listProspectAudits,
  loadRetentionSnapshot,
} from '@odysseus/store';
import { slimAuditStorage } from '../retention/apply-retention.js';
import { isDeliveredAudit } from '../retention/retention-policy.js';
import type { ArtifactStore } from './artifact-store.js';
import { deleteAuditArtifacts } from './delete-audit-artifacts.js';

export interface ProspectAuditPurge {
  /** Audits deleted with their files. */
  audits: number;
  /** Delivered audits kept, slimmed (including ones already slimmed). */
  auditsKept: number;
  remoteObjectsDeleted: number;
}

export async function purgeProspectAuditStorage(
  connection: Connection,
  prospectId: string,
  options: { artifactsRoot: string; store: ArtifactStore | undefined },
): Promise<ProspectAuditPurge> {
  const purge: ProspectAuditPurge = { audits: 0, auditsKept: 0, remoteObjectsDeleted: 0 };
  const now = new Date();
  const snapshot = await loadRetentionSnapshot(connection, now);
  const slimmed = new Set(
    snapshot.audits.filter((audit) => audit.slimmedAt !== undefined).map((audit) => audit.auditId),
  );
  for (const audit of await listProspectAudits(connection, prospectId)) {
    if (isDeliveredAudit(audit.auditId, snapshot)) {
      if (!slimmed.has(audit.auditId)) {
        const kept = await slimAuditStorage(connection, audit, { ...options, now });
        purge.remoteObjectsDeleted += kept.remoteObjectsDeleted;
      }
      purge.auditsKept += 1;
      continue;
    }
    const removed = await deleteAuditArtifacts(audit, options);
    purge.remoteObjectsDeleted += removed.remoteObjectsDeleted ?? 0;
    await deleteAuditCascade(connection, audit.auditId);
    await deleteFinishedScanJobsForAudit(connection, audit.auditId);
    purge.audits += 1;
  }
  return purge;
}
