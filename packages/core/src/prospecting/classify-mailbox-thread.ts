/**
 * Milestone 9c plan 012: turn a mailbox thread's metadata into one fact about
 * what happened since we last looked, with no body ever read.
 *
 * Pure, per this repository's convention for every legality or classification
 * decision in `core` (compare `outreach-thread-state.ts`,
 * `outreach-selection.ts`): the reconciliation orchestrator
 * (`packages/interface/src/outreach/reconcile-mailbox.ts`) asks this function
 * what a thread's metadata means, it never decides that itself.
 *
 * A send is a provider fact, not an absence. The one draft still outstanding
 * for a thread (its most recently drafted, not yet confirmed-sent touch) is
 * "sent" when its message id appears in the thread carrying `SENT` and not
 * `DRAFT`. Sending from the Gmail interface can instead replace the draft
 * with a new message id (observed 2026-09-24), so when the draft's id is gone
 * a `SENT` message from our own address in the same thread, dated after the
 * draft was created, is the send. It is never inferred from the draft merely
 * being gone, which is also what a manual deletion looks like.
 *
 * Everything else is read from messages after the last confirmed send only,
 * so a reply to touch 1 is never re-detected as a reply to touch 2 once touch
 * 2 has gone out. Order matters: an automated response (`Auto-Submitted`) is
 * never a reply and never a bounce, even if it happens to come from a
 * mail-system local part; a genuine bounce is checked next; anything else
 * inbound is a reply. An outstanding draft that has vanished from the thread
 * with no confirmed send and no inbound activity to explain it is flagged for
 * a person to look at, rather than guessed at.
 */

export interface MailboxClassifierMessage {
  providerMessageId: string;
  at: Date;
  fromAddress: string;
  labelIds: readonly string[];
  autoSubmitted: boolean;
  inReplyTo?: string;
}

/** The one draft still awaiting confirmation for a thread. Plan 011's
 *  one-live-draft-per-touch index means there is at most one of these per
 *  thread at any time; kept as an input rather than assumed so this function
 *  stays testable without that invariant. */
export interface OutstandingThreadDraft {
  touch: number;
  providerMessageId: string;
  /** When the draft was created: a replacement sent message can only come
   *  after it. Without it only the exact message id counts as a send. */
  draftedAt?: Date;
}

export interface ClassifyMailboxThreadInput {
  /** Every message on the thread the mailbox reports, oldest first or not -
   *  this function sorts. */
  messages: readonly MailboxClassifierMessage[];
  /** Our own configured sending address, so an inbound message can be told
   *  from our own confirmed send. */
  senderAddress: string;
  /** The touch whose draft has not yet been confirmed sent, if any. */
  outstandingDraft?: OutstandingThreadDraft;
  /** The most recent confirmed send, so an inbound message from before it
   *  (a stale copy, a delayed bounce for an earlier touch) is never
   *  re-attributed to the current one. Undefined before any touch has sent. */
  lastConfirmedSentAt?: Date;
}

export type MailboxThreadClassification =
  | { kind: 'sent'; touch: number; providerMessageId: string; sentAt: Date }
  | { kind: 'reply'; providerMessageId: string; at: Date }
  | { kind: 'bounce'; providerMessageId: string; at: Date }
  | { kind: 'automated'; providerMessageId: string; at: Date }
  | { kind: 'unchanged' }
  | { kind: 'needs-review'; reason: string };

/** Mail-system local parts a bounce notification arrives from. Not an
 *  exhaustive list of every provider's convention, only the two Gmail and
 *  most receiving systems use for a delivery failure landing back in the same
 *  thread. */
const BOUNCE_LOCAL_PARTS = new Set(['mailer-daemon', 'postmaster']);

function localPartOf(address: string): string {
  return (address.split('@')[0] ?? '').toLowerCase();
}

function isFromConfiguredSender(message: MailboxClassifierMessage, senderAddress: string): boolean {
  return message.fromAddress.toLowerCase() === senderAddress.toLowerCase();
}

export function classifyMailboxThread(
  input: ClassifyMailboxThreadInput,
): MailboxThreadClassification {
  const outstanding = input.outstandingDraft;

  if (outstanding !== undefined) {
    const sentMessage = input.messages.find(
      (message) =>
        message.providerMessageId === outstanding.providerMessageId &&
        message.labelIds.includes('SENT') &&
        !message.labelIds.includes('DRAFT'),
    );
    if (sentMessage !== undefined) {
      return {
        kind: 'sent',
        touch: outstanding.touch,
        providerMessageId: sentMessage.providerMessageId,
        sentAt: sentMessage.at,
      };
    }

    const draftStillPresent = input.messages.some(
      (message) => message.providerMessageId === outstanding.providerMessageId,
    );
    const draftedAt = outstanding.draftedAt;
    if (!draftStillPresent && draftedAt !== undefined) {
      const replacement = input.messages
        .filter(
          (message) =>
            isFromConfiguredSender(message, input.senderAddress) &&
            message.labelIds.includes('SENT') &&
            !message.labelIds.includes('DRAFT') &&
            message.at.getTime() >= draftedAt.getTime() &&
            (input.lastConfirmedSentAt === undefined ||
              message.at.getTime() > input.lastConfirmedSentAt.getTime()),
        )
        .sort((a, b) => a.at.getTime() - b.at.getTime())[0];
      if (replacement !== undefined) {
        return {
          kind: 'sent',
          touch: outstanding.touch,
          providerMessageId: replacement.providerMessageId,
          sentAt: replacement.at,
        };
      }
    }
  }

  const since = input.lastConfirmedSentAt;
  const inboundSinceLastSend = input.messages
    .filter((message) => since === undefined || message.at.getTime() > since.getTime())
    .filter((message) => !isFromConfiguredSender(message, input.senderAddress))
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  const inbound = inboundSinceLastSend[0];
  if (inbound !== undefined) {
    if (inbound.autoSubmitted) {
      return { kind: 'automated', providerMessageId: inbound.providerMessageId, at: inbound.at };
    }
    if (BOUNCE_LOCAL_PARTS.has(localPartOf(inbound.fromAddress))) {
      return { kind: 'bounce', providerMessageId: inbound.providerMessageId, at: inbound.at };
    }
    return { kind: 'reply', providerMessageId: inbound.providerMessageId, at: inbound.at };
  }

  if (outstanding !== undefined) {
    const stillPresent = input.messages.some(
      (message) => message.providerMessageId === outstanding.providerMessageId,
    );
    if (!stillPresent) {
      return { kind: 'needs-review', reason: 'draft-disappeared-with-no-matching-send' };
    }
  }

  return { kind: 'unchanged' };
}
