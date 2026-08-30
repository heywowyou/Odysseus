/**
 * Gmail `MailboxDraftAdapter`, milestone 9c plan 011.
 *
 * Built on the runtime's own `fetch` with no client library, following the
 * same reasoning that produced `scaleway-preview-publisher.ts`: signing and
 * transport stay injectable, so the contract tests exercise this adapter with
 * no account, no credentials and no network, which is the only reason a
 * production adapter could be written and verified before anything was
 * provisioned.
 *
 * **Why not `googleapis`.** The package would handle token refresh for us, and
 * it hands back a client carrying `users.messages.send` and
 * `users.drafts.send`. Because no OAuth scope can withhold send permission
 * (see `mailbox-draft-adapter.ts`), that would leave the entire no-send
 * guarantee resting on nobody ever calling a method that is present, reachable
 * and autocompleted. The refresh call this replaces it with is one `POST`.
 * That trade is the whole argument: fewer than forty lines of our own code buy
 * a guarantee that can be verified by reading one file.
 *
 * **The endpoint table is the security surface.** `GMAIL_ENDPOINTS` is the
 * only place in this module where a URL is constructed, it is frozen, and
 * `gmail-draft-adapter.test.ts` asserts that none of its values matches a
 * forbidden capability. There is no method taking a caller-supplied path: one
 * would be a generic request method wearing a narrower name, and this table
 * would stop meaning anything.
 *
 * Minimum scopes, checked against Google's published list on 2026-08-30:
 * `gmail.compose` for the three draft endpoints and `gmail.metadata` for the
 * thread read. `gmail.modify` would cover both in one scope while also
 * granting read access to every message body in the mailbox, so the pair is
 * the narrower request despite being two entries.
 */

import { buildDraftMime, encodeDraftMimeForTransport } from './draft-mime.js';
import type {
  CreateMailboxDraftInput,
  MailboxDraft,
  MailboxDraftAdapter,
  MailboxThreadMetadata,
} from './mailbox-draft-adapter.js';

const GMAIL_API_ORIGIN = 'https://gmail.googleapis.com';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/**
 * Every request this adapter can make, as data.
 *
 * `thread` reads metadata only. Google rejects an explicit `format` parameter
 * when the caller holds `gmail.metadata`, so the default is used rather than
 * asking for `format=metadata` and getting a 403 that reads like an auth
 * failure.
 */
export const GMAIL_ENDPOINTS = Object.freeze({
  createDraft: { method: 'POST', path: '/gmail/v1/users/me/drafts' },
  getDraft: { method: 'GET', path: '/gmail/v1/users/me/drafts/{id}' },
  deleteDraft: { method: 'DELETE', path: '/gmail/v1/users/me/drafts/{id}' },
  getThread: { method: 'GET', path: '/gmail/v1/users/me/threads/{id}' },
} as const);

export const GMAIL_REQUIRED_SCOPES = Object.freeze([
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.metadata',
] as const);

export interface GmailDraftAdapterOptions {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** The address drafts are composed from. Kept as configuration rather than
   *  read from the profile endpoint, which would be a fifth endpoint to
   *  justify for a value the operator already knows. */
  senderAddress: string;
  /** Injected so the adapter is testable without credentials or a network.
   *  Defaults to the runtime's own `fetch`. */
  fetchImpl?: typeof globalThis.fetch;
}

interface GmailDraftResponse {
  id?: string;
  message?: { id?: string; threadId?: string };
}

interface GmailThreadResponse {
  id?: string;
  messages?: { internalDate?: string }[];
}

/** Refresh a little before the token actually dies, so a long batch does not
 *  fail on a token that expired between the check and the request. */
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

function pathFor(template: string, id: string): string {
  // Encoded because a provider id reaches this from stored data, and a stored
  // value containing a slash would otherwise reach a different endpoint than
  // the table names.
  return template.replace('{id}', encodeURIComponent(id));
}

export function createGmailDraftAdapter(options: GmailDraftAdapterOptions): MailboxDraftAdapter {
  const doFetch = options.fetchImpl ?? globalThis.fetch;
  let accessToken: string | undefined;
  let accessTokenExpiresAt = 0;

  async function currentAccessToken(): Promise<string> {
    if (accessToken !== undefined && Date.now() < accessTokenExpiresAt - TOKEN_EXPIRY_MARGIN_MS) {
      return accessToken;
    }
    const response = await doFetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: options.clientId,
        client_secret: options.clientSecret,
        refresh_token: options.refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });
    if (!response.ok) {
      // The body of a token failure can echo the client secret back, so only
      // the status is reported. An operator debugging this needs to know the
      // refresh failed, not to have the credential copied into a log.
      throw new Error(`Gmail token refresh failed with status ${String(response.status)}`);
    }
    const payload = (await response.json()) as { access_token?: string; expires_in?: number };
    if (typeof payload.access_token !== 'string') {
      throw new Error('Gmail token refresh returned no access token');
    }
    accessToken = payload.access_token;
    accessTokenExpiresAt = Date.now() + (payload.expires_in ?? 3600) * 1000;
    return accessToken;
  }

  async function call(
    endpoint: { method: string; path: string },
    init?: { body?: unknown },
  ): Promise<Response> {
    const token = await currentAccessToken();
    const headers: Record<string, string> = { authorization: `Bearer ${token}` };
    if (init?.body !== undefined) headers['content-type'] = 'application/json';
    return doFetch(`${GMAIL_API_ORIGIN}${endpoint.path}`, {
      method: endpoint.method,
      headers,
      ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
  }

  async function failed(response: Response, action: string): Promise<never> {
    // Gmail error bodies are safe to surface (they carry a reason, not the
    // credential) and are the difference between a diagnosable quota problem
    // and an opaque 429.
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Gmail ${action} failed with status ${String(response.status)}${detail === '' ? '' : `: ${detail}`}`,
    );
  }

  return {
    async createDraft(input: CreateMailboxDraftInput): Promise<MailboxDraft> {
      const mime = buildDraftMime({
        to: input.to,
        from: options.senderAddress,
        subject: input.subject,
        body: input.body,
      });
      const message: Record<string, string> = { raw: encodeDraftMimeForTransport(mime) };
      if (input.providerThreadId !== undefined) message['threadId'] = input.providerThreadId;

      const response = await call(GMAIL_ENDPOINTS.createDraft, { body: { message } });
      if (!response.ok) await failed(response, 'draft creation');

      const payload = (await response.json()) as GmailDraftResponse;
      if (
        typeof payload.id !== 'string' ||
        typeof payload.message?.id !== 'string' ||
        typeof payload.message.threadId !== 'string'
      ) {
        // A draft may well exist at this point. Reported as an error rather
        // than swallowed so the caller runs its reconciliation path, since a
        // draft the database does not know about is the one failure mode that
        // could put an unreviewed message in front of the operator.
        throw new Error('Gmail draft creation returned an incomplete draft');
      }
      return {
        providerDraftId: payload.id,
        providerMessageId: payload.message.id,
        providerThreadId: payload.message.threadId,
      };
    },

    async getDraft(providerDraftId: string): Promise<MailboxDraft | null> {
      const response = await call({
        method: GMAIL_ENDPOINTS.getDraft.method,
        path: pathFor(GMAIL_ENDPOINTS.getDraft.path, providerDraftId),
      });
      if (response.status === 404) return null;
      if (!response.ok) await failed(response, 'draft read');

      const payload = (await response.json()) as GmailDraftResponse;
      if (
        typeof payload.id !== 'string' ||
        typeof payload.message?.id !== 'string' ||
        typeof payload.message.threadId !== 'string'
      ) {
        return null;
      }
      return {
        providerDraftId: payload.id,
        providerMessageId: payload.message.id,
        providerThreadId: payload.message.threadId,
      };
    },

    async deleteDraft(providerDraftId: string): Promise<void> {
      const response = await call({
        method: GMAIL_ENDPOINTS.deleteDraft.method,
        path: pathFor(GMAIL_ENDPOINTS.deleteDraft.path, providerDraftId),
      });
      // Idempotent by contract: a draft the operator already discarded, or one
      // this call already removed on an earlier attempt, is a success.
      if (response.status === 404) return;
      if (!response.ok) await failed(response, 'draft deletion');
    },

    async getThreadMetadata(providerThreadId: string): Promise<MailboxThreadMetadata | null> {
      const response = await call({
        method: GMAIL_ENDPOINTS.getThread.method,
        path: pathFor(GMAIL_ENDPOINTS.getThread.path, providerThreadId),
      });
      if (response.status === 404) return null;
      if (!response.ok) await failed(response, 'thread read');

      const payload = (await response.json()) as GmailThreadResponse;
      const messages = payload.messages ?? [];
      if (typeof payload.id !== 'string' || messages.length === 0) return null;

      const times = messages
        .map((message) => Number(message.internalDate))
        .filter((value) => Number.isFinite(value));
      return {
        providerThreadId: payload.id,
        messageCount: messages.length,
        // Gmail reports `internalDate` as epoch milliseconds in a string.
        lastMessageAt: new Date(times.length === 0 ? 0 : Math.max(...times)),
      };
    },
  };
}
