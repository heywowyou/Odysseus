/**
 * Withdraws everything still pending for one prospect's outreach: public
 * preview objects, mailbox drafts, and the stored draft/preview/thread rows.
 *
 * Preview objects are deleted before their records are revoked, so a bucket
 * failure leaves the record live for a retry. Mailbox draft rows enter an
 * explicit retryable state before provider deletion; successful removals then
 * become deleted, while failures remain queued for the opt-out poller.
 */

import {
  listOutreachDrafts,
  listOutreachPreviews,
  markOutreachDraftDeleted,
  withdrawProspectOutreach,
  type OutreachDraftDocument,
  type WithdrawnProspectOutreach,
} from '@odysseus/store';
import type { Connection } from 'mongoose';
import type { MailboxDraftAdapter } from './mailbox-draft-adapter.js';
import type { PreviewPublisher } from './preview-publisher.js';

export const MAILBOX_DRAFT_DELETE_WARNING = 'mailbox-draft-deletion-pending' as const;

export interface WithdrawOutreachAdapters {
  /** Resolved lazily so a prospect without live previews never needs a bucket. */
  publisher: () => PreviewPublisher;
  mailbox: MailboxDraftAdapter | null;
}

export function mailboxDraftDeletionWarningFields(mailboxDraftsNotRemoved: number): {
  mailboxDraftsNotRemoved: number;
  warnings?: readonly (typeof MAILBOX_DRAFT_DELETE_WARNING)[];
} {
  return {
    mailboxDraftsNotRemoved,
    ...(mailboxDraftsNotRemoved > 0 ? { warnings: [MAILBOX_DRAFT_DELETE_WARNING] } : {}),
  };
}

export type WithdrawnOutreachSummary = Pick<
  WithdrawnProspectOutreach,
  'drafts' | 'previews' | 'threadClosed'
> & {
  mailboxDraftsNotRemoved: number;
  warnings?: readonly (typeof MAILBOX_DRAFT_DELETE_WARNING)[];
};

/** Remove pending drafts from Gmail and mark only confirmed removals as done. */
export async function deletePendingMailboxDraftRows(
  connection: Connection,
  drafts: readonly Pick<OutreachDraftDocument, 'draftId' | 'providerDraftId'>[],
  mailbox: MailboxDraftAdapter | null,
): Promise<number> {
  const results = await Promise.allSettled(
    drafts.map(async (draft) => {
      if (mailbox === null || draft.providerDraftId === undefined) {
        throw new Error('mailbox draft deletion is not configured');
      }
      await mailbox.deleteDraft(draft.providerDraftId);
      await markOutreachDraftDeleted(connection, draft.draftId);
    }),
  );
  return results.filter((result) => result.status === 'rejected').length;
}

/** Retry any provider deletions left pending by an earlier action. */
export async function retryPendingMailboxDraftDeletions(
  connection: Connection,
  mailbox: MailboxDraftAdapter | null,
): Promise<number> {
  const drafts = await listOutreachDrafts(connection, { status: 'mailbox-delete-pending' });
  return deletePendingMailboxDraftRows(connection, drafts, mailbox);
}

export async function withdrawOutreachForProspect(
  connection: Connection,
  prospectId: string,
  reason: 'opted-out' | 'prospect-deleted',
  adapters: WithdrawOutreachAdapters,
): Promise<WithdrawnOutreachSummary> {
  const livePreviews = await listOutreachPreviews(connection, { prospectId, status: 'live' });
  if (livePreviews.length > 0) {
    const publisher = adapters.publisher();
    await Promise.all(livePreviews.map((preview) => publisher.delete(preview.objectKey)));
  }
  const withdrawn = await withdrawProspectOutreach(connection, prospectId, reason);
  const mailboxDraftsNotRemoved = await deletePendingMailboxDraftRows(
    connection,
    withdrawn.providerDrafts,
    adapters.mailbox,
  );
  return {
    drafts: withdrawn.drafts,
    previews: withdrawn.previews,
    threadClosed: withdrawn.threadClosed,
    ...mailboxDraftDeletionWarningFields(mailboxDraftsNotRemoved),
  };
}
