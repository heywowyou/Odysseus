import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  clientAddressOf,
  createOptOutStore,
  createSubmissionLimiter,
  isPlausibleEmail,
  isSameOriginPost,
  OPT_OUT_SUBMISSIONS_PER_WINDOW,
  OPT_OUT_WINDOW_MS,
  optOutLinkKeyForToken,
} from './opt-out';

interface KeyFixture {
  malformedTokens: string[];
  cases: { token: string; tokenHash: string }[];
}

const fixture = JSON.parse(
  readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      '..',
      'fixtures',
      'outreach-preview-keys.json',
    ),
    'utf8',
  ),
) as KeyFixture;

function fakeBucket() {
  const objects = new Map<string, string>();
  const fetchImpl = (async (input: unknown): Promise<Response> => {
    const request = input as Request;
    const key = decodeURIComponent(new URL(request.url).pathname.slice(1));
    if (request.method === 'PUT') {
      objects.set(key, await request.text());
      return new Response(null, { status: 200 });
    }
    const stored = objects.get(key);
    return stored === undefined ? new Response('', { status: 404 }) : new Response(stored);
  }) as typeof globalThis.fetch;
  return { objects, fetchImpl };
}

function storeWith(fetchImpl: typeof globalThis.fetch, now = new Date('2026-09-15T10:00:00Z')) {
  return createOptOutStore({
    bucket: 'b',
    endpoint: 'https://s3.fr-par.scw.cloud',
    region: 'fr-par',
    readAccessKeyId: 'r',
    readSecretAccessKey: 'r',
    writeAccessKeyId: 'w',
    writeSecretAccessKey: 'w',
    fetchImpl,
    now: () => now,
  });
}

describe('opt-out keys (site copy)', () => {
  it.each(fixture.cases)('derives the link key from the pinned hash for $token', (testCase) => {
    expect(optOutLinkKeyForToken(testCase.token)).toBe(`opt-out-links/${testCase.tokenHash}.json`);
  });

  it.each(fixture.malformedTokens)('refuses malformed token %j', (token) => {
    expect(optOutLinkKeyForToken(token)).toBeNull();
  });
});

describe('opt-out store', () => {
  const token = fixture.cases[0]!.token;
  const linkKey = `opt-out-links/${fixture.cases[0]!.tokenHash}.json`;

  it('prefills the address behind a live link token', async () => {
    const bucket = fakeBucket();
    bucket.objects.set(
      linkKey,
      JSON.stringify({ address: 'contact@hotel.fr', expiresAt: '2027-01-01T00:00:00Z' }),
    );
    await expect(storeWith(bucket.fetchImpl).addressForToken(token)).resolves.toBe(
      'contact@hotel.fr',
    );
  });

  it('does not prefill from an expired, unknown or malformed token', async () => {
    const bucket = fakeBucket();
    bucket.objects.set(
      linkKey,
      JSON.stringify({ address: 'contact@hotel.fr', expiresAt: '2026-01-01T00:00:00Z' }),
    );
    const store = storeWith(bucket.fetchImpl);
    await expect(store.addressForToken(token)).resolves.toBeNull();
    await expect(store.addressForToken(fixture.cases[1]?.token ?? 'x')).resolves.toBeNull();
    await expect(store.addressForToken('../x')).resolves.toBeNull();
  });

  it('drops a request object under the requests prefix', async () => {
    const bucket = fakeBucket();
    await storeWith(bucket.fetchImpl).submit({ address: 'contact@hotel.fr', token });
    const [key, body] = [...bucket.objects.entries()][0]!;
    expect(key.startsWith('opt-out-requests/')).toBe(true);
    expect(JSON.parse(body)).toEqual({
      address: 'contact@hotel.fr',
      token,
      receivedAt: '2026-09-15T10:00:00.000Z',
    });
  });

  it('checks email shape', () => {
    expect(isPlausibleEmail('contact@hotel.fr')).toBe(true);
    expect(isPlausibleEmail('not an email')).toBe(false);
  });
});

describe('opt-out form abuse bounds', () => {
  const post = (headers: Record<string, string>) =>
    new Request('https://www.odysseusaudit.com/desinscription/envoyer', {
      method: 'POST',
      headers,
    });

  it('accepts a post from the site itself or with no Origin, and refuses another site', () => {
    expect(isSameOriginPost(post({ origin: 'https://www.odysseusaudit.com' }))).toBe(true);
    expect(isSameOriginPost(post({}))).toBe(true);
    expect(isSameOriginPost(post({ origin: 'https://attacker.example' }))).toBe(false);
    expect(isSameOriginPost(post({ origin: 'null' }))).toBe(false);
  });

  it('limits one client per window and resets after it', () => {
    let now = 0;
    const limiter = createSubmissionLimiter(() => now);
    for (let n = 0; n < OPT_OUT_SUBMISSIONS_PER_WINDOW; n++) {
      expect(limiter.allow('198.51.100.1')).toBe(true);
    }
    expect(limiter.allow('198.51.100.1')).toBe(false);
    expect(limiter.allow('198.51.100.2')).toBe(true);
    now += OPT_OUT_WINDOW_MS;
    expect(limiter.allow('198.51.100.1')).toBe(true);
  });

  it('reads the first forwarded address', () => {
    expect(clientAddressOf(post({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }))).toBe(
      '203.0.113.9',
    );
    expect(clientAddressOf(post({}))).toBe('unknown');
  });
});
