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

import { buildDraftMime } from './draft-mime.js';
import type {
  CreateMailboxDraftInput,
  MailboxDraft,
  MailboxDraftAdapter,
  MailboxThreadMetadata,
} from './mailbox-draft-adapter.js';

export interface RecordedDraft extends MailboxDraft {
  to: string;
  from: string;
  subject: string;
  body: string;
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
  const threadMessageIds = new Map<string, string[]>();
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
        subject: input.subject,
        body: input.body,
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
        mime,
        createdAt: new Date(),
      });

      const onThread = threadMessageIds.get(providerThreadId) ?? [];
      onThread.push(providerMessageId);
      threadMessageIds.set(providerThreadId, onThread);

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
      const remaining = (threadMessageIds.get(stored.providerThreadId) ?? []).filter(
        (id) => id !== stored.providerMessageId,
      );
      if (remaining.length === 0) threadMessageIds.delete(stored.providerThreadId);
      else threadMessageIds.set(stored.providerThreadId, remaining);
      return Promise.resolve();
    },

    getThreadMetadata(providerThreadId: string): Promise<MailboxThreadMetadata | null> {
      const onThread = threadMessageIds.get(providerThreadId);
      if (onThread === undefined || onThread.length === 0) return Promise.resolve(null);
      const times = [...drafts.values()]
        .filter((draft) => draft.providerThreadId === providerThreadId)
        .map((draft) => draft.createdAt.getTime());
      return Promise.resolve({
        providerThreadId,
        messageCount: onThread.length,
        lastMessageAt: new Date(Math.max(...times)),
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
  };
}
