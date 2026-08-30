/**
 * The `MailboxDraftAdapter` port, milestone 9c plan 011.
 *
 * Four methods, and the absence of a fifth is the point. Binding decision 14
 * (`plans/README.md`, and `docs/rules/outreach-rules.md`) stops automation at a
 * draft: the program prepares, a person reads, and a person sends. This port
 * is where that stops being a policy anyone could forget and becomes a shape
 * the code does not have.
 *
 * **Why the absence has to carry the whole weight.** Checked against Google's
 * published scope list on 2026-08-30: there is no OAuth scope that permits
 * creating a draft without also permitting sending one. `gmail.compose`, the
 * narrowest scope that can create a draft at all, is documented as "Manage
 * drafts and send emails", and `gmail.modify` is broader still. So the
 * credential this adapter holds is send-capable no matter how carefully it is
 * requested, and no permission sits behind this interface as a second line of
 * defence. If a send method ever appears here, nothing else stops it. That is
 * why `mailbox-draft-adapter.test.ts` asserts the method set statically rather
 * than trusting this comment.
 *
 * **Why the types name no provider.** Nothing here says Gmail. Callers move
 * `providerDraftId` and `providerThreadId` around as opaque strings and never
 * learn what issued them, which is the same discipline `PreviewPublisher`
 * applies to bucket names and keys. That is ordinary port hygiene rather than
 * preparation for a migration: it is what lets the in-memory adapter be a
 * `Map` and still be a real test double, so every contract test runs against
 * both implementations.
 *
 * The port also takes no URL, path, or endpoint from its caller. A method that
 * accepted one would be a generic request method wearing a narrower name, and
 * the endpoint allowlist in the Gmail adapter would stop meaning anything.
 */

/** A draft to be prepared. Deliberately not a MIME string: constructing the
 *  message is the adapter's job (`draft-mime.ts`), so no caller can smuggle
 *  headers past the builder by handing over pre-baked bytes.
 *
 *  There is no sender field either. Which mailbox a draft is composed from is
 *  adapter configuration, not something a caller chooses per draft: a message
 *  claiming a sender the mailbox is not authorized for is exactly what SPF and
 *  DMARC exist to reject, and the shortest way to never send one is to give
 *  callers no way to name a sender at all. */
export interface CreateMailboxDraftInput {
  /** The approved own-domain role address. Never a named individual: the
   *  allowlist in `@odysseus/core`'s `role-address.ts` is enforced long before
   *  here, but this field is the last place the value is readable. */
  to: string;
  subject: string;
  /** Plain text only. There is no HTML field and no attachment field, because
   *  outreach doctrine allows neither. */
  body: string;
  /** Touches 2 and 3 only: the provider thread this reply belongs to, so a
   *  follow-up lands in the conversation rather than starting a new one. */
  providerThreadId?: string;
}

export interface MailboxDraft {
  providerDraftId: string;
  providerMessageId: string;
  providerThreadId: string;
}

/** One message's metadata, for plan 012's reply reconciliation. There is no
 *  subject and no body field: `gmail.metadata` cannot read either, and this
 *  shape is what keeps that limit visible to callers instead of leaving it as
 *  a property of a scope string in a config file. `fromAddress` is not a new
 *  privacy category - the thread already stores `roleAddress` raw for its 90
 *  days, and the sender of a reply is the same class of fact. */
export interface MailboxMessageMetadata {
  providerMessageId: string;
  at: Date;
  fromAddress: string;
  labelIds: readonly string[];
  /** From the `Auto-Submitted` header (RFC 3834): a vacation responder or
   *  other automated reply, never a person answering. */
  autoSubmitted: boolean;
  inReplyTo?: string;
}

/** Metadata only, for plan 012's reply reconciliation. There is no field for
 *  message content: `gmail.metadata` cannot read a body, and this shape is
 *  what keeps that limit visible to callers instead of leaving it as a
 *  property of a scope string in a config file. */
export interface MailboxThreadMetadata {
  providerThreadId: string;
  messageCount: number;
  lastMessageAt: Date;
  /** Per-message metadata, oldest first. Added in plan 012 so
   *  `classifyMailboxThread` can tell a manual send from a reply from a bounce
   *  without reading a body - `messageCount` and `lastMessageAt` alone cannot
   *  distinguish those. */
  messages: readonly MailboxMessageMetadata[];
}

export interface MailboxDraftAdapter {
  createDraft(input: CreateMailboxDraftInput): Promise<MailboxDraft>;
  /** `null` when the draft is gone, which is not an error: a draft the
   *  operator sent by hand stops existing as a draft, and that is the expected
   *  end of its life rather than a fault. */
  getDraft(providerDraftId: string): Promise<MailboxDraft | null>;
  /** Idempotent, for the same reason `PreviewPublisher.delete` is: rejecting a
   *  draft must not fail on its second attempt or because the operator already
   *  discarded it in the mail client. */
  deleteDraft(providerDraftId: string): Promise<void>;
  getThreadMetadata(providerThreadId: string): Promise<MailboxThreadMetadata | null>;
}

/**
 * The complete method set, as data.
 *
 * Read by the capability test so that adding a method to the interface without
 * a deliberate decision fails a test rather than passing silently. A
 * `keyof MailboxDraftAdapter` check alone would not do this: TypeScript would
 * happily accept a widened interface, and the type-level assertion would still
 * hold. The list has to be written down separately for the two to disagree.
 */
export const MAILBOX_DRAFT_ADAPTER_METHODS = [
  'createDraft',
  'getDraft',
  'deleteDraft',
  'getThreadMetadata',
] as const;

/**
 * Substrings that must never name a member of this port or appear in a
 * provider adapter's endpoint table.
 *
 * `trash` and `untrash` are here alongside the obvious ones because Gmail
 * reaches them through the same `users.messages` surface, and a helper added
 * "just to clean up after a rejected draft" is how a mailbox-mutating endpoint
 * gets past review. Deletion of our own draft goes through `deleteDraft` and
 * nothing else.
 */
export const FORBIDDEN_MAILBOX_CAPABILITIES = [
  'send',
  'submit',
  'dispatch',
  'trash',
  'untrash',
  'import',
  'insert',
  'request',
] as const;
