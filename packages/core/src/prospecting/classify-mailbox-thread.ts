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
 * 2 has gone out. Because of that, a send found in this sync also reports a
 * human message that arrived between the previous send and this one
 * (`inboundBeforeSend`): the operator sent the follow-up after the prospect
 * had answered, and that answer would otherwise never be seen (issue #477).
 * Order matters: an automated response (`Auto-Submitted`) is never a reply
 * and never a bounce, even if it happens to come from a mail-system local
 * part, and it does not hide a human message that follows it: the first
 * non-automated inbound message decides; a genuine bounce is checked next;
 * anything else inbound is a reply. An outstanding draft that has vanished from the thread
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

/** A human message (reply or bounce) that arrived after the previous
 *  confirmed send and before the send this sync found. */
export interface InboundBeforeSend {
  kind: 'reply' | 'bounce';
  providerMessageId: string;
  at: Date;
}

export type MailboxThreadClassification =
  | {
      kind: 'sent';
      touch: number;
      providerMessageId: string;
      sentAt: Date;
      inboundBeforeSend?: InboundBeforeSend;
    }
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

function isBounce(message: MailboxClassifierMessage): boolean {
  return BOUNCE_LOCAL_PARTS.has(localPartOf(message.fromAddress));
}

/** Inbound messages strictly after `after` (when given) and strictly before
 *  `before` (when given), oldest first. */
function inboundBetween(
  input: ClassifyMailboxThreadInput,
  after: Date | undefined,
  before: Date | undefined,
): MailboxClassifierMessage[] {
  return input.messages
    .filter((message) => after === undefined || message.at.getTime() > after.getTime())
    .filter((message) => before === undefined || message.at.getTime() < before.getTime())
    .filter((message) => !isFromConfiguredSender(message, input.senderAddress))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** A send found in this sync, with any human answer to the previous touch
 *  that arrived before it. Only a follow-up has a previous touch to answer. */
function sentClassification(
  input: ClassifyMailboxThreadInput,
  touch: number,
  message: MailboxClassifierMessage,
): MailboxThreadClassification {
  const previousSend = input.lastConfirmedSentAt;
  const human =
    previousSend === undefined
      ? undefined
      : inboundBetween(input, previousSend, message.at).find((inbound) => !inbound.autoSubmitted);
  return {
    kind: 'sent',
    touch,
    providerMessageId: message.providerMessageId,
    sentAt: message.at,
    ...(human === undefined
      ? {}
      : {
          inboundBeforeSend: {
            kind: isBounce(human) ? 'bounce' : 'reply',
            providerMessageId: human.providerMessageId,
            at: human.at,
          },
        }),
  };
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
      return sentClassification(input, outstanding.touch, sentMessage);
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
        return sentClassification(input, outstanding.touch, replacement);
      }
    }
  }

  const inboundSinceLastSend = inboundBetween(input, input.lastConfirmedSentAt, undefined);
  const human = inboundSinceLastSend.find((message) => !message.autoSubmitted);
  if (human !== undefined) {
    if (isBounce(human)) {
      return { kind: 'bounce', providerMessageId: human.providerMessageId, at: human.at };
    }
    return { kind: 'reply', providerMessageId: human.providerMessageId, at: human.at };
  }
  const automated = inboundSinceLastSend[0];
  if (automated !== undefined) {
    return { kind: 'automated', providerMessageId: automated.providerMessageId, at: automated.at };
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
