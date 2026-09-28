/**
 * Issue #553: an outreach draft row expires 90 days after it was created
 * (trade-off 121), but its copy in the mailbox does not. A first email left
 * unsent that long would lose its row, and the To do list would then offer a
 * second draft to the same address. The daily retention sweep withdraws a
 * draft from the mailbox a week before its row would expire, and keeps the
 * row as a pending deletion until the mailbox confirms.
 */

import type { Connection } from 'mongoose';
import { holdOutreachDraftForDeletion, listOutreachDraftsExpiringBefore } from '@odysseus/store';
import type { MailboxDraftAdapter } from './mailbox-draft-adapter.js';
import { deletePendingMailboxDraftRows } from './withdraw-prospect-outreach.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const DRAFT_EXPIRY_LEAD_DAYS = 7;
/** How long a row waiting for its mailbox deletion is kept, renewed on each
 *  sweep, so a mailbox outage never lets it expire first. */
const PENDING_DELETION_HOLD_DAYS = 30;

export interface ExpiringOutreachDraftSweep {
  withdrawn: number;
  notRemoved: number;
}

export async function withdrawExpiringOutreachDrafts(options: {
  connection: Connection;
  mailbox: MailboxDraftAdapter | null;
  now: Date;
}): Promise<ExpiringOutreachDraftSweep> {
  const { connection, mailbox, now } = options;
  const drafts = await listOutreachDraftsExpiringBefore(
    connection,
    new Date(now.getTime() + DRAFT_EXPIRY_LEAD_DAYS * DAY_MS),
  );
  const hold = new Date(now.getTime() + PENDING_DELETION_HOLD_DAYS * DAY_MS);
  for (const draft of drafts) await holdOutreachDraftForDeletion(connection, draft.draftId, hold);
  const notRemoved = await deletePendingMailboxDraftRows(connection, drafts, mailbox);
  return { withdrawn: drafts.length - notRemoved, notRemoved };
}
