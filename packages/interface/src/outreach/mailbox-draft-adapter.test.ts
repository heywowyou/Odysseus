/**
 * Contract and capability tests for the mailbox port, milestone 9c plan 011.
 *
 * Two jobs in one file, deliberately. The contract suite runs every behaviour
 * against both adapters, so an in-memory double that has drifted from the
 * Gmail adapter is a failure rather than a surprise on the first live run. The
 * capability suite is the one that carries policy: because no OAuth scope can
 * withhold send permission from a credential that creates drafts, these
 * assertions are the only thing standing between the codebase and a send path.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  createGmailDraftAdapter,
  GMAIL_ENDPOINTS,
  GMAIL_REQUIRED_SCOPES,
} from './gmail-draft-adapter.js';
import { createInMemoryMailboxDraftAdapter } from './in-memory-mailbox-draft-adapter.js';
import {
  FORBIDDEN_MAILBOX_CAPABILITIES,
  MAILBOX_DRAFT_ADAPTER_METHODS,
  type MailboxDraftAdapter,
} from './mailbox-draft-adapter.js';

const TOKEN_RESPONSE = { access_token: 'test-access-token', expires_in: 3600 };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** A Gmail double at the HTTP boundary: it answers the token endpoint and the
 *  four allowlisted paths, and records every request so a test can assert on
 *  what was actually sent rather than on what the adapter says it sent. */
function stubGmail(): { adapter: MailboxDraftAdapter; requests: Request[] } {
  const requests: Request[] = [];
  let sequence = 0;
  const threads = new Map<string, { internalDate: string }[]>();
  const drafts = new Map<string, { id: string; messageId: string; threadId: string }>();

  const fetchImpl: typeof globalThis.fetch = (input, init) => {
    const request = new Request(input as unknown as string, init);
    requests.push(request.clone());
    const url = new URL(request.url);

    if (url.href.startsWith('https://oauth2.googleapis.com/token')) {
      return Promise.resolve(jsonResponse(TOKEN_RESPONSE));
    }

    const draftMatch = /^\/gmail\/v1\/users\/me\/drafts\/(.+)$/.exec(url.pathname);
    const threadMatch = /^\/gmail\/v1\/users\/me\/threads\/(.+)$/.exec(url.pathname);

    if (url.pathname === '/gmail/v1/users/me/drafts' && request.method === 'POST') {
      sequence += 1;
      const id = `d${String(sequence)}`;
      const messageId = `m${String(sequence)}`;
      return request.json().then((body) => {
        const sent = body as { message: { raw: string; threadId?: string } };
        const threadId = sent.message.threadId ?? `t${String(sequence)}`;
        drafts.set(id, { id, messageId, threadId });
        const onThread = threads.get(threadId) ?? [];
        onThread.push({ internalDate: String(1_700_000_000_000 + sequence) });
        threads.set(threadId, onThread);
        return jsonResponse({ id, message: { id: messageId, threadId } });
      });
    }

    if (draftMatch !== null) {
      const stored = drafts.get(decodeURIComponent(draftMatch[1] as string));
      if (request.method === 'DELETE') {
        if (stored === undefined) return Promise.resolve(new Response(null, { status: 404 }));
        drafts.delete(stored.id);
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (stored === undefined) return Promise.resolve(new Response(null, { status: 404 }));
      return Promise.resolve(
        jsonResponse({
          id: stored.id,
          message: { id: stored.messageId, threadId: stored.threadId },
        }),
      );
    }

    if (threadMatch !== null) {
      const id = decodeURIComponent(threadMatch[1] as string);
      const messages = threads.get(id);
      if (messages === undefined) return Promise.resolve(new Response(null, { status: 404 }));
      return Promise.resolve(jsonResponse({ id, messages }));
    }

    throw new Error(`stub reached an unexpected URL: ${url.href}`);
  };

  return {
    adapter: createGmailDraftAdapter({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      refreshToken: 'refresh-token',
      senderAddress: 'contact@example-sending-domain.fr',
      fetchImpl,
    }),
    requests,
  };
}

const IMPLEMENTATIONS: { name: string; create: () => MailboxDraftAdapter }[] = [
  {
    name: 'in-memory',
    create: () =>
      createInMemoryMailboxDraftAdapter({ senderAddress: 'contact@example-sending-domain.fr' }),
  },
  { name: 'gmail', create: () => stubGmail().adapter },
];

const VALID_DRAFT = {
  to: 'contact@hotel-example.fr',
  subject: 'Votre site web',
  body: 'Bonjour,\n\nUn constat mesuré sur votre site.\n\nCordialement',
  htmlBody: '<div dir="ltr"><div>Bonjour,</div><div>Un constat mesuré sur votre site.</div></div>',
};

describe.each(IMPLEMENTATIONS)('$name adapter contract', ({ create }) => {
  it('creates a draft and returns provider identifiers', async () => {
    const draft = await create().createDraft(VALID_DRAFT);
    expect(draft.providerDraftId).not.toBe('');
    expect(draft.providerMessageId).not.toBe('');
    expect(draft.providerThreadId).not.toBe('');
  });

  it('reads back a created draft', async () => {
    const adapter = create();
    const created = await adapter.createDraft(VALID_DRAFT);
    await expect(adapter.getDraft(created.providerDraftId)).resolves.toEqual(created);
  });

  it('returns null for a draft that does not exist', async () => {
    await expect(create().getDraft('absent')).resolves.toBeNull();
  });

  it('deletes a draft, and deleting again is a success', async () => {
    const adapter = create();
    const created = await adapter.createDraft(VALID_DRAFT);
    await adapter.deleteDraft(created.providerDraftId);
    await expect(adapter.getDraft(created.providerDraftId)).resolves.toBeNull();
    await expect(adapter.deleteDraft(created.providerDraftId)).resolves.toBeUndefined();
  });

  it('joins an existing thread when given its id', async () => {
    const adapter = create();
    const first = await adapter.createDraft(VALID_DRAFT);
    const second = await adapter.createDraft({
      ...VALID_DRAFT,
      subject: 'Re: Votre site web',
      providerThreadId: first.providerThreadId,
    });
    expect(second.providerThreadId).toBe(first.providerThreadId);
    const metadata = await adapter.getThreadMetadata(first.providerThreadId);
    expect(metadata?.messageCount).toBe(2);
  });

  it('returns null metadata for an unknown thread', async () => {
    await expect(create().getThreadMetadata('absent')).resolves.toBeNull();
  });

  it('refuses a draft whose subject carries a line break', async () => {
    await expect(
      create().createDraft({ ...VALID_DRAFT, subject: 'Votre site\r\nBcc: someone@example.com' }),
    ).rejects.toThrow(/line break/);
  });

  it('refuses a draft with an empty body', async () => {
    await expect(create().createDraft({ ...VALID_DRAFT, body: '   ' })).rejects.toThrow(/empty/);
  });

  it('refuses a draft with an empty HTML part', async () => {
    await expect(create().createDraft({ ...VALID_DRAFT, htmlBody: ' ' })).rejects.toThrow(
      /HTML body is empty/,
    );
  });
});

describe('no send capability', () => {
  it('exposes exactly the four documented methods', () => {
    const adapter = createInMemoryMailboxDraftAdapter();
    const portMethods = MAILBOX_DRAFT_ADAPTER_METHODS.filter(
      (name) => typeof (adapter as unknown as Record<string, unknown>)[name] === 'function',
    );
    expect(portMethods).toEqual([...MAILBOX_DRAFT_ADAPTER_METHODS]);
    expect(MAILBOX_DRAFT_ADAPTER_METHODS).toHaveLength(4);
  });

  it('names no forbidden capability among the port methods', () => {
    for (const method of MAILBOX_DRAFT_ADAPTER_METHODS) {
      for (const forbidden of FORBIDDEN_MAILBOX_CAPABILITIES) {
        expect(method.toLowerCase()).not.toContain(forbidden);
      }
    }
  });

  it('allowlists four endpoints and none of them mutates or sends mail', () => {
    const endpoints = Object.values(GMAIL_ENDPOINTS);
    expect(endpoints).toHaveLength(4);
    for (const endpoint of endpoints) {
      expect(endpoint.path.startsWith('/gmail/v1/users/me/')).toBe(true);
      for (const forbidden of FORBIDDEN_MAILBOX_CAPABILITIES) {
        expect(endpoint.path.toLowerCase()).not.toContain(forbidden);
      }
    }
  });

  it('requests only the two minimum scopes', () => {
    expect([...GMAIL_REQUIRED_SCOPES]).toEqual([
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.metadata',
    ]);
    // gmail.modify would cover both in one entry while also granting read
    // access to every message body in the mailbox.
    expect(GMAIL_REQUIRED_SCOPES.join(' ')).not.toContain('gmail.modify');
    expect(GMAIL_REQUIRED_SCOPES.join(' ')).not.toContain('mail.google.com');
  });

  it('ignores a sender a caller tries to supply', async () => {
    const adapter = createInMemoryMailboxDraftAdapter({ senderAddress: 'real@sending-domain.fr' });
    // A message claiming a sender the mailbox is not authorized for is what
    // SPF and DMARC reject, so the port gives a caller no way to name one.
    await adapter.createDraft({
      ...VALID_DRAFT,
      ...({ from: 'spoofed@somebody-else.fr' } as Record<string, string>),
    });
    const [recorded] = adapter.recorded();
    expect(recorded?.from).toBe('real@sending-domain.fr');
    expect(recorded?.mime).not.toContain('spoofed@somebody-else.fr');
  });

  it('builds no send URL anywhere in the Gmail adapter source', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./gmail-draft-adapter.ts', import.meta.url)),
      'utf8',
    );
    // Google's send endpoints, spelled as they would have to appear.
    expect(source).not.toContain('/drafts/send');
    expect(source).not.toContain('messages/send');
    expect(source).not.toContain('sendAs');
  });

  it('only ever contacts Google over the allowlisted paths', async () => {
    const { adapter, requests } = stubGmail();
    const created = await adapter.createDraft(VALID_DRAFT);
    await adapter.getDraft(created.providerDraftId);
    await adapter.getThreadMetadata(created.providerThreadId);
    await adapter.deleteDraft(created.providerDraftId);

    const paths = requests
      .map((request) => new URL(request.url))
      .filter((url) => url.host !== 'oauth2.googleapis.com')
      .map((url) => url.pathname.replace(/\/(d|m|t)\d+$/, '/{id}'));

    expect([...new Set(paths)].sort()).toEqual([
      '/gmail/v1/users/me/drafts',
      '/gmail/v1/users/me/drafts/{id}',
      '/gmail/v1/users/me/threads/{id}',
    ]);
  });
});

describe('Gmail transport', () => {
  it('requests metadata rather than the full thread representation', async () => {
    const { adapter, requests } = stubGmail();
    const created = await adapter.createDraft(VALID_DRAFT);
    await adapter.getThreadMetadata(created.providerThreadId);

    const threadRequest = requests.find((request) => request.url.includes('/threads/'));
    expect(threadRequest).toBeDefined();
    expect(new URL(threadRequest?.url ?? '').searchParams.get('format')).toBe('metadata');
  });
});

describe('gmail adapter transport', () => {
  it('refreshes the token once and reuses it across calls', async () => {
    const { adapter, requests } = stubGmail();
    await adapter.createDraft(VALID_DRAFT);
    await adapter.createDraft(VALID_DRAFT);
    const tokenCalls = requests.filter((request) =>
      request.url.startsWith('https://oauth2.googleapis.com/token'),
    );
    expect(tokenCalls).toHaveLength(1);
  });

  it('reports a token failure without echoing the credential', async () => {
    const adapter = createGmailDraftAdapter({
      clientId: 'client-id',
      clientSecret: 'super-secret-value',
      refreshToken: 'refresh-token',
      senderAddress: 'contact@example-sending-domain.fr',
      fetchImpl: () =>
        Promise.resolve(
          new Response(JSON.stringify({ error: 'invalid_client', secret: 'super-secret-value' }), {
            status: 401,
          }),
        ),
    });
    await expect(adapter.createDraft(VALID_DRAFT)).rejects.toThrow(
      /token refresh failed with status 401/,
    );
    await expect(adapter.createDraft(VALID_DRAFT)).rejects.not.toThrow(/super-secret-value/);
  });

  it('aborts a Gmail request that never answers (issue #483)', async () => {
    const adapter = createGmailDraftAdapter({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      refreshToken: 'refresh-token',
      senderAddress: 'contact@example-sending-domain.fr',
      requestTimeoutMs: 20,
      fetchImpl: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    });
    await expect(adapter.getThreadMetadata('thread-1')).rejects.toThrow(/timeout|abort/i);
  });

  it('sends the message base64url encoded with the configured sender', async () => {
    const { adapter, requests } = stubGmail();
    await adapter.createDraft(VALID_DRAFT);
    const create = requests.find(
      (request) => request.method === 'POST' && request.url.endsWith('/drafts'),
    );
    const body = (await create?.json()) as { message: { raw: string } };
    const mime = Buffer.from(body.message.raw, 'base64url').toString('utf8');
    expect(mime).toContain('From: "Jules Fontaine (Odysseus)" <contact@example-sending-domain.fr>');
    expect(mime).toContain('To: contact@hotel-example.fr');
    expect(mime).toContain('Content-Type: multipart/alternative');
    expect(mime).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(mime).toContain('Content-Type: text/html; charset="UTF-8"');
  });
});
