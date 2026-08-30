/**
 * The one place mailbox configuration meets the mailbox adapter, milestone 9c
 * plan 011, mirroring `configured-preview-publisher.ts`.
 *
 * Callers ask for an adapter and get one; they never see a client secret, a
 * refresh token or a sender address, which is what the port's docblock means
 * by the seam being real rather than decorative.
 *
 * The `null` return is the part that matters while nothing is provisioned.
 * `createConfiguredMailboxDraftAdapter` does not throw on missing credentials
 * and does not silently substitute a double: it reports that no mailbox
 * exists, and the caller decides. The CLI turns that into a refusal to create
 * a real draft plus a line naming the unset variables. A factory that threw
 * would make every command that merely mentions drafts unusable on an
 * unprovisioned machine; one that silently returned the in-memory adapter
 * would let an operator believe a draft is waiting in a mailbox that has none.
 */

import {
  getMailboxClientId,
  getMailboxClientSecret,
  getMailboxRefreshToken,
  getMailboxSenderAddress,
  isMailboxConfigured,
} from '../config.js';
import { createGmailDraftAdapter } from './gmail-draft-adapter.js';
import type { MailboxDraftAdapter } from './mailbox-draft-adapter.js';

export function createConfiguredMailboxDraftAdapter(): MailboxDraftAdapter | null {
  if (!isMailboxConfigured()) return null;
  return createGmailDraftAdapter({
    clientId: getMailboxClientId(),
    clientSecret: getMailboxClientSecret(),
    refreshToken: getMailboxRefreshToken(),
    senderAddress: getMailboxSenderAddress(),
  });
}
