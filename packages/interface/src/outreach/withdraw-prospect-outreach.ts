/**
 * Withdraws everything still pending for one prospect's outreach: public
 * preview objects, mailbox drafts, and the stored draft/preview/thread rows.
 *
 * Preview objects are deleted before their records are revoked, as in every
 * other revocation, so a bucket failure leaves the record live for a retry.
 * Mailbox draft deletion is best effort: the stored draft has already left
 * review, and the operator sees how many were withdrawn.
 */

import {
  listOutreachPreviews,
  withdrawProspectOutreach,
  type WithdrawnProspectOutreach,
} from '@odysseus/store';
import type { Connection } from 'mongoose';
import type { MailboxDraftAdapter } from './mailbox-draft-adapter.js';
import type { PreviewPublisher } from './preview-publisher.js';

export interface WithdrawOutreachAdapters {
  /** Resolved lazily so a prospect without live previews never needs a bucket. */
  publisher: () => PreviewPublisher;
  mailbox: MailboxDraftAdapter | null;
}

export type WithdrawnOutreachSummary = Pick<
  WithdrawnProspectOutreach,
  'drafts' | 'previews' | 'threadClosed'
>;

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
  if (adapters.mailbox !== null) {
    const mailbox = adapters.mailbox;
    await Promise.all(
      withdrawn.providerDraftIds.map((id) => mailbox.deleteDraft(id).catch(() => undefined)),
    );
  }
  return {
    drafts: withdrawn.drafts,
    previews: withdrawn.previews,
    threadClosed: withdrawn.threadClosed,
  };
}
