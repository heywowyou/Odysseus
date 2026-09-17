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
 * Outreach previews are untouched: a published preview is a self-contained
 * document in the previews bucket and does not read audit artifacts.
 * The caller must refuse first while a job for the prospect is queued or
 * running, since that job could recreate what is removed here.
 */

import type { Connection } from 'mongoose';
import {
  deleteAuditCascade,
  deleteFinishedScanJobsForAudit,
  listProspectAudits,
} from '@odysseus/store';
import type { ArtifactStore } from './artifact-store.js';
import { deleteAuditArtifacts } from './delete-audit-artifacts.js';

export interface ProspectAuditPurge {
  audits: number;
  remoteObjectsDeleted: number;
}

export async function purgeProspectAuditStorage(
  connection: Connection,
  prospectId: string,
  options: { artifactsRoot: string; store: ArtifactStore | undefined },
): Promise<ProspectAuditPurge> {
  const purge: ProspectAuditPurge = { audits: 0, remoteObjectsDeleted: 0 };
  for (const audit of await listProspectAudits(connection, prospectId)) {
    const removed = await deleteAuditArtifacts(audit, options);
    purge.remoteObjectsDeleted += removed.remoteObjectsDeleted ?? 0;
    await deleteAuditCascade(connection, audit.auditId);
    await deleteFinishedScanJobsForAudit(connection, audit.auditId);
    purge.audits += 1;
  }
  return purge;
}
