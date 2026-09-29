/**
 * Permanently deletes one prospect with everything it owns: pending outreach
 * (preview objects, mailbox drafts), every audit's local and bucket files,
 * then the records (`deleteProspectPermanently`). Suppression entries are a
 * separate collection of hashes and are never touched: an objection must
 * outlive the record (docs/rules/prospect-qualification.md).
 *
 * Shared by the dashboard's delete action and the 90-day prospect expiry
 * (issue #538). Storage goes before records, so a failure keeps the prospect
 * for a retry. The caller checks work it alone can see (a stopped job still
 * finishing in this process, report production) before calling.
 */

import type { Connection } from 'mongoose';
import {
  countActiveProspectDeletionJobs,
  deleteProspectPermanently,
  getProspectHub,
  listProspectAudits,
  listProspectScopeJobRuns,
  type ProspectCascadeCounts,
} from '@odysseus/store';
import type { MailboxDraftAdapter } from '../outreach/mailbox-draft-adapter.js';
import type { PreviewPublisher } from '../outreach/preview-publisher.js';
import { withdrawOutreachForProspect } from '../outreach/withdraw-prospect-outreach.js';
import type { ArtifactStore } from './artifact-store.js';
import {
  AuditArtifactDeletionError,
  deleteAuditArtifacts,
  jobRunArtifactLocation,
} from './delete-audit-artifacts.js';

export interface ProspectDeletionDeps {
  artifactsRoot: string;
  store: ArtifactStore | undefined;
  publisher: () => PreviewPublisher;
  mailbox: MailboxDraftAdapter | null;
}

export type ProspectDeletionOutcome =
  | { deleted: ProspectCascadeCounts }
  | {
      refusal:
        | 'not-found'
        | 'active-job'
        | 'mailbox-drafts-remain'
        | 'outreach-withdrawal-failed'
        | 'artifact-deletion-failed';
      detail: string;
    };

export async function deleteProspectWithStorage(
  connection: Connection,
  prospectId: string,
  deps: ProspectDeletionDeps,
): Promise<ProspectDeletionOutcome> {
  if ((await getProspectHub(connection, prospectId)) === null) {
    return { refusal: 'not-found', detail: 'prospect not found' };
  }
  if ((await countActiveProspectDeletionJobs(connection, prospectId)) > 0) {
    return {
      refusal: 'active-job',
      detail: 'prospect has an unfinished job; cancel it or wait for it to end',
    };
  }
  const audits = await listProspectAudits(connection, prospectId);

  try {
    // Issue #273: the mailbox draft is withdrawn too, not orphaned. A
    // provider failure keeps the prospect row available for retry.
    const withdrawn = await withdrawOutreachForProspect(
      connection,
      prospectId,
      'prospect-deleted',
      {
        publisher: deps.publisher,
        mailbox: deps.mailbox,
      },
    );
    if (withdrawn.mailboxDraftsNotRemoved > 0) {
      return {
        refusal: 'mailbox-drafts-remain',
        detail: `${withdrawn.mailboxDraftsNotRemoved} mailbox draft(s) remain; retry deletion after cleanup`,
      };
    }
  } catch {
    return {
      refusal: 'outreach-withdrawal-failed',
      detail: 'prospect previews or mailbox drafts could not be withdrawn',
    };
  }

  try {
    for (const audit of audits) {
      await deleteAuditArtifacts(audit, { artifactsRoot: deps.artifactsRoot, store: deps.store });
    }
    // The prospect's jobs are deleted with it, and a failed or stopped run
    // left a directory no audit names; once the jobs are gone nothing would.
    for (const job of await listProspectScopeJobRuns(connection, prospectId)) {
      const location = jobRunArtifactLocation(job);
      if (location !== null) {
        await deleteAuditArtifacts(location, {
          artifactsRoot: deps.artifactsRoot,
          store: deps.store,
        });
      }
    }
  } catch (error) {
    if (!(error instanceof AuditArtifactDeletionError)) throw error;
    return {
      refusal: 'artifact-deletion-failed',
      detail: `${error.message}; the prospect was kept, retry the deletion`,
    };
  }

  const deleted = await deleteProspectPermanently(connection, prospectId);
  if (deleted === null) return { refusal: 'not-found', detail: 'prospect not found' };
  return { deleted };
}
