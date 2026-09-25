/**
 * Runs mailbox reconciliation for the dashboard: on a timer while the server
 * is up, and on demand from the operator's "sync mailbox" action. Without it
 * a draft sent from the mailbox never moves its thread, so follow-up and
 * reply work never appears.
 *
 * Off when no mailbox is configured, for the same reason the opt-out poller
 * is off without a bucket: there is nothing to read.
 */

import type { Connection } from 'mongoose';
import { getMailboxSenderAddress } from '../config.js';
import { logger } from '../logger.js';
import { createConfiguredMailboxDraftAdapter } from './configured-mailbox-draft-adapter.js';
import { createMongoMailboxReconciliationStore } from './mongo-mailbox-reconciliation-store.js';
import { reconcileMailbox } from './reconcile-mailbox.js';

const MAILBOX_SYNC_INTERVAL_MS = 10 * 60_000;

export type MailboxSyncResult =
  | { configured: false }
  | { configured: true; threads: number; sent: number; replies: number; review: number };

let inFlight: Promise<MailboxSyncResult> | null = null;

/** One reconciliation at a time: a manual sync during a scheduled one joins it. */
export function syncMailbox(connection: Connection, now = new Date()): Promise<MailboxSyncResult> {
  if (inFlight !== null) return inFlight;
  inFlight = (async (): Promise<MailboxSyncResult> => {
    const mailbox = createConfiguredMailboxDraftAdapter();
    if (mailbox === null) return { configured: false };
    const { results } = await reconcileMailbox({
      mailbox,
      senderAddress: getMailboxSenderAddress(),
      store: createMongoMailboxReconciliationStore(connection, mailbox),
      now,
    });
    const count = (kinds: readonly string[]): number =>
      results.filter((result) => kinds.includes(result.classification.kind)).length;
    return {
      configured: true,
      threads: results.length,
      sent: count(['sent']),
      replies: count(['reply', 'bounce']),
      review: count(['automated', 'needs-review']),
    };
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export function startMailboxSyncPoller(connection: Connection): () => void {
  if (createConfiguredMailboxDraftAdapter() === null) {
    logger.info('mailbox not configured; sent emails and replies are not synced');
    return () => undefined;
  }
  const tick = async (): Promise<void> => {
    try {
      const result = await syncMailbox(connection);
      if (result.configured && result.sent + result.replies + result.review > 0) {
        logger.info(result, 'synced outreach mailbox');
      }
    } catch (error) {
      logger.error({ err: error }, 'outreach mailbox could not be synced');
    }
  };
  const timer = setInterval(() => void tick(), MAILBOX_SYNC_INTERVAL_MS);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
