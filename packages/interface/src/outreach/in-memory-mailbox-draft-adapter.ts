/**
 * In-memory `MailboxDraftAdapter`, milestone 9c plan 011.
 *
 * The other half of what makes the port a seam rather than one implementation
 * wearing an interface, on the same reasoning as
 * `in-memory-preview-publisher.ts`: every contract test runs against this and
 * against the Gmail adapter, so a behaviour only one of them has is a test
 * failure instead of a surprise in production.
 *
 * It does one thing a bare `Map` would not: it builds the message through
 * `buildDraftMime` and keeps the result. That is deliberate. With no mailbox
 * provisioned, this adapter is the only place the whole draft path runs end to
 * end, and a double that skipped message construction would let a header
 * injection or an empty body reach the operator's first live run undetected.
 * Building it here means those bytes are validated on every dry run.
 *
 * Threading is modelled honestly rather than conveniently: a draft with no
 * `providerThreadId` starts a thread, one carrying an id joins it, and
 * `getThreadMetadata` counts what is actually there. A test asserting that a
 * follow-up landed on the same thread therefore fails here when the caller
 * forgot to pass the id, which is the mistake worth catching.
 */

import { OUTREACH_SENDER_DISPLAY_NAME } from '@odysseus/core';
import { buildDraftMime } from './draft-mime.js';
import type {
  CreateMailboxDraftInput,
  MailboxDraft,
  MailboxDraftAdapter,
  MailboxMessageMetadata,
  MailboxThreadMetadata,
} from './mailbox-draft-adapter.js';

export interface RecordedDraft extends MailboxDraft {
  to: string;
  from: string;
  subject: string;
  body: string;
  htmlBody: string;
  /** The exact message `buildDraftMime` produced, so a test can assert on
   *  headers and encoding rather than only on the structured input. */
  mime: string;
  createdAt: Date;
}

export interface InMemoryMailboxDraftAdapter extends MailboxDraftAdapter {
  /** Test-only. Not on the port: no production caller may enumerate the
   *  mailbox, which is why the port has no `list`. */
  recorded(): RecordedDraft[];
  /** Test-only fault injection, so orchestration tests can exercise the path
   *  where the provider accepts a draft and the caller then fails to persist
   *  it. */
  failNextCreate(error: Error): void;
  /** Test-only: simulates the operator sending a draft by hand. Drops the
   *  `DRAFT` label, adds `SENT`, and removes it from `getDraft`'s reach -
   *  matching Gmail's own behaviour, where a sent draft stops being a draft.
   *  Throws if the draft is unknown. */
  markDraftSent(providerDraftId: string, at?: Date): void;
  /** Test-only: injects an inbound message into a thread (a reply, a bounce,
   *  or an automated response), so `classifyMailboxThread` fixtures do not
   *  need a real mailbox. Returns the synthetic `providerMessageId`. */
  injectInboundMessage(
    providerThreadId: string,
    input: {
      fromAddress: string;
      at?: Date;
      autoSubmitted?: boolean;
      inReplyTo?: string;
    },
  ): string;
}

export interface InMemoryMailboxDraftAdapterOptions {
  /** The mailbox drafts are composed from, mirroring the Gmail adapter's own
   *  configured sender so both implementations answer the same way. */
  senderAddress?: string;
}

export function createInMemoryMailboxDraftAdapter(
  options: InMemoryMailboxDraftAdapterOptions = {},
): InMemoryMailboxDraftAdapter {
  const senderAddress = options.senderAddress ?? 'drafts@example.test';
  const drafts = new Map<string, RecordedDraft>();
  const threadMessages = new Map<string, MailboxMessageMetadata[]>();
  let sequence = 0;
  let pendingFailure: Error | undefined;

  function nextId(prefix: string): string {
    sequence += 1;
    return `${prefix}-${String(sequence).padStart(4, '0')}`;
  }

  return {
    // `async` so that a `buildDraftMime` rejection arrives as a rejected
    // promise. A method typed as returning one must never throw synchronously:
    // a caller that only attached `.catch` would miss it entirely, and the
    // orchestrator's refusal path is written around rejections.
    async createDraft(input: CreateMailboxDraftInput): Promise<MailboxDraft> {
      if (pendingFailure !== undefined) {
        const error = pendingFailure;
        pendingFailure = undefined;
        throw error;
      }

      // Before anything is stored, so an unbuildable message is refused rather
      // than recorded as a draft that could never have existed.
      const mime = buildDraftMime({
        to: input.to,
        from: senderAddress,
        fromName: OUTREACH_SENDER_DISPLAY_NAME,
        subject: input.subject,
        body: input.body,
        htmlBody: input.htmlBody,
      });

      const providerDraftId = nextId('draft');
      const providerMessageId = nextId('message');
      const providerThreadId = input.providerThreadId ?? nextId('thread');

      drafts.set(providerDraftId, {
        providerDraftId,
        providerMessageId,
        providerThreadId,
        to: input.to,
        from: senderAddress,
        subject: input.subject,
        body: input.body,
        htmlBody: input.htmlBody,
        mime,
        createdAt: new Date(),
      });

      const onThread = threadMessages.get(providerThreadId) ?? [];
      onThread.push({
        providerMessageId,
        at: new Date(),
        fromAddress: senderAddress,
        labelIds: ['DRAFT'],
        autoSubmitted: false,
      });
      threadMessages.set(providerThreadId, onThread);

      return { providerDraftId, providerMessageId, providerThreadId };
    },

    getDraft(providerDraftId: string): Promise<MailboxDraft | null> {
      const stored = drafts.get(providerDraftId);
      if (stored === undefined) return Promise.resolve(null);
      return Promise.resolve({
        providerDraftId: stored.providerDraftId,
        providerMessageId: stored.providerMessageId,
        providerThreadId: stored.providerThreadId,
      });
    },

    deleteDraft(providerDraftId: string): Promise<void> {
      const stored = drafts.get(providerDraftId);
      if (stored === undefined) return Promise.resolve();
      drafts.delete(providerDraftId);
      // An unsent draft that is deleted disappears from the thread entirely,
      // matching Gmail: nothing was ever sent, so no message remains.
      const remaining = (threadMessages.get(stored.providerThreadId) ?? []).filter(
        (message) => message.providerMessageId !== stored.providerMessageId,
      );
      if (remaining.length === 0) threadMessages.delete(stored.providerThreadId);
      else threadMessages.set(stored.providerThreadId, remaining);
      return Promise.resolve();
    },

    getThreadMetadata(providerThreadId: string): Promise<MailboxThreadMetadata | null> {
      const onThread = threadMessages.get(providerThreadId);
      if (onThread === undefined || onThread.length === 0) return Promise.resolve(null);
      const sorted = [...onThread].sort((a, b) => a.at.getTime() - b.at.getTime());
      return Promise.resolve({
        providerThreadId,
        messageCount: sorted.length,
        lastMessageAt: sorted[sorted.length - 1]?.at ?? new Date(0),
        messages: sorted,
      });
    },

    recorded(): RecordedDraft[] {
      return [...drafts.values()].sort((a, b) =>
        a.providerDraftId.localeCompare(b.providerDraftId),
      );
    },

    failNextCreate(error: Error): void {
      pendingFailure = error;
    },

    markDraftSent(providerDraftId: string, at?: Date): void {
      const stored = drafts.get(providerDraftId);
      if (stored === undefined) throw new Error(`markDraftSent: unknown draft ${providerDraftId}`);
      const onThread = threadMessages.get(stored.providerThreadId) ?? [];
      const message = onThread.find(
        (entry) => entry.providerMessageId === stored.providerMessageId,
      );
      if (message === undefined) {
        throw new Error(`markDraftSent: message for draft ${providerDraftId} not found on thread`);
      }
      message.labelIds = ['SENT'];
      message.at = at ?? new Date();
      // A sent draft stops being a draft, on the port's own documented
      // contract: `getDraft` must return null for it from this point on.
      drafts.delete(providerDraftId);
    },

    injectInboundMessage(
      providerThreadId: string,
      input: { fromAddress: string; at?: Date; autoSubmitted?: boolean; inReplyTo?: string },
    ): string {
      const providerMessageId = nextId('message');
      const onThread = threadMessages.get(providerThreadId) ?? [];
      onThread.push({
        providerMessageId,
        at: input.at ?? new Date(),
        fromAddress: input.fromAddress,
        labelIds: ['INBOX'],
        autoSubmitted: input.autoSubmitted ?? false,
        ...(input.inReplyTo === undefined ? {} : { inReplyTo: input.inReplyTo }),
      });
      threadMessages.set(providerThreadId, onThread);
      return providerMessageId;
    },
  };
}
