import { describe, expect, it } from 'vitest';
import {
  createPreviewToken,
  deriveObjectKey,
  hashPreviewToken,
  isValidPreviewToken,
  PREVIEW_TOKEN_PATTERN,
} from './preview-token.js';
import { createInMemoryPreviewPublisher } from './in-memory-preview-publisher.js';
import { createScalewayPreviewPublisher } from './scaleway-preview-publisher.js';
import { PREVIEW_EXPIRY_METADATA_HEADER, type PreviewPublisher } from './preview-publisher.js';

const HTML = '<!doctype html><title>Aperçu</title><p>Bonjour</p>';

/**
 * A fake S3 that stores bodies and metadata, so the production adapter can be
 * driven through the same contract as the in-memory one with no credentials and
 * no network. It also records every signed request, which is what lets the
 * signing assertions below be about the real `aws4fetch` output rather than
 * about a stub of it.
 */
function fakeS3(): { fetchImpl: typeof globalThis.fetch; requests: Request[] } {
  const objects = new Map<string, { body: string; expiry: string }>();
  const requests: Request[] = [];

  const fetchImpl = (async (input: unknown): Promise<Response> => {
    const request = input as Request;
    requests.push(request.clone());
    const key = new URL(request.url).pathname;

    if (request.method === 'PUT') {
      objects.set(key, {
        body: await request.text(),
        expiry: request.headers.get(PREVIEW_EXPIRY_METADATA_HEADER) ?? '',
      });
      return new Response(null, { status: 200 });
    }
    if (request.method === 'GET') {
      const stored = objects.get(key);
      if (stored === undefined) return new Response('', { status: 404 });
      return new Response(stored.body, {
        status: 200,
        headers: { [PREVIEW_EXPIRY_METADATA_HEADER]: stored.expiry },
      });
    }
    if (request.method === 'DELETE') {
      const existed = objects.delete(key);
      return new Response(null, { status: existed ? 204 : 404 });
    }
    return new Response(null, { status: 405 });
  }) as typeof globalThis.fetch;

  return { fetchImpl, requests };
}

function scalewayUnderTest(fetchImpl: typeof globalThis.fetch): PreviewPublisher {
  return createScalewayPreviewPublisher({
    bucket: 'odysseus-previews-test',
    endpoint: 'https://s3.fr-par.scw.cloud',
    region: 'fr-par',
    accessKeyId: 'AKIATESTTESTTEST',
    secretAccessKey: 'secret-not-a-real-key',
    fetchImpl,
  });
}

describe('preview tokens', () => {
  it('produces 43-character base64url tokens', () => {
    const token = createPreviewToken();
    expect(token).toMatch(PREVIEW_TOKEN_PATTERN);
    expect(token).toHaveLength(43);
  });

  it('does not repeat across many draws', () => {
    const drawn = new Set(Array.from({ length: 500 }, () => createPreviewToken()));
    expect(drawn.size).toBe(500);
  });

  it.each([
    ['empty', ''],
    ['too short', 'a'.repeat(42)],
    ['too long', 'a'.repeat(44)],
    ['base64 padding', `${'a'.repeat(42)}=`],
    ['path traversal', '../../etc/passwd'],
    ['slash', `${'a'.repeat(21)}/${'a'.repeat(21)}`],
    ['newline', `${'a'.repeat(42)}\n`],
  ])('rejects a malformed token: %s', (_name, candidate) => {
    expect(isValidPreviewToken(candidate)).toBe(false);
    expect(() => hashPreviewToken(candidate)).toThrow(/malformed/u);
  });

  it('hashes to lowercase hex and derives a key from the hash alone', () => {
    const token = createPreviewToken();
    const hash = hashPreviewToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/u);
    const key = deriveObjectKey(hash);
    expect(key).toBe(`previews/${hash}.html`);
    // The raw token must not be reconstructible from anything we persist.
    expect(key).not.toContain(token);
  });

  it('refuses to derive a key from anything that is not a hash', () => {
    expect(() => deriveObjectKey('not-a-hash')).toThrow(/malformed/u);
    expect(() => deriveObjectKey('A'.repeat(64))).toThrow(/malformed/u);
  });
});

describe.each([
  ['in-memory', (): PreviewPublisher => createInMemoryPreviewPublisher()],
  ['scaleway', (): PreviewPublisher => scalewayUnderTest(fakeS3().fetchImpl)],
])('PreviewPublisher contract: %s', (_name, build) => {
  const key = deriveObjectKey(hashPreviewToken(createPreviewToken()));
  const expiry = new Date('2026-09-28T10:00:00.000Z');

  it('returns null for an object that was never written', async () => {
    const publisher = build();
    await expect(publisher.get(key)).resolves.toBeNull();
  });

  it('round-trips the document and its public expiry', async () => {
    const publisher = build();
    await publisher.put({ objectKey: key, html: HTML, publicExpiresAt: expiry });
    const stored = await publisher.get(key);
    expect(stored?.html).toBe(HTML);
    expect(stored?.publicExpiresAt.toISOString()).toBe(expiry.toISOString());
  });

  it('returns null after a delete', async () => {
    const publisher = build();
    await publisher.put({ objectKey: key, html: HTML, publicExpiresAt: expiry });
    await publisher.delete(key);
    await expect(publisher.get(key)).resolves.toBeNull();
  });

  it('treats a repeated delete as a success, so revocation is idempotent', async () => {
    const publisher = build();
    await publisher.put({ objectKey: key, html: HTML, publicExpiresAt: expiry });
    await publisher.delete(key);
    await expect(publisher.delete(key)).resolves.toBeUndefined();
    await expect(publisher.delete(deriveObjectKey('0'.repeat(64)))).resolves.toBeUndefined();
  });

  it('overwrites on a repeated put rather than accumulating', async () => {
    const publisher = build();
    await publisher.put({ objectKey: key, html: HTML, publicExpiresAt: expiry });
    await publisher.put({ objectKey: key, html: '<p>second</p>', publicExpiresAt: expiry });
    const stored = await publisher.get(key);
    expect(stored?.html).toBe('<p>second</p>');
  });
});

describe('scaleway adapter specifics', () => {
  const key = deriveObjectKey(hashPreviewToken(createPreviewToken()));
  const expiry = new Date('2026-09-28T10:00:00.000Z');

  it('addresses the bucket virtual-host style and signs every request', async () => {
    const s3 = fakeS3();
    await scalewayUnderTest(s3.fetchImpl).put({
      objectKey: key,
      html: HTML,
      publicExpiresAt: expiry,
    });

    const request = s3.requests[0];
    expect(request).toBeDefined();
    expect(request?.url).toBe(`https://odysseus-previews-test.s3.fr-par.scw.cloud/${key}`);
    expect(request?.method).toBe('PUT');
    const authorization = request?.headers.get('authorization') ?? '';
    expect(authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIATESTTESTTEST\/\d{8}\/fr-par\/s3\/aws4_request/u,
    );
    // aws4fetch signs an https body as UNSIGNED-PAYLOAD: TLS already protects
    // the body in transit, and S3 accepts it. Asserted as the literal it is, so
    // a future change to real payload hashing shows up here rather than passing
    // silently under a looser pattern.
    expect(request?.headers.get('x-amz-content-sha256')).toBe('UNSIGNED-PAYLOAD');
    expect(request?.headers.get(PREVIEW_EXPIRY_METADATA_HEADER)).toBe(expiry.toISOString());
    expect(request?.headers.get('content-type')).toBe('text/html; charset=utf-8');
  });

  it('reads a 403 as absent, because a private bucket hides keys it will not list', async () => {
    const publisher = scalewayUnderTest((() =>
      Promise.resolve(new Response('', { status: 403 }))) as typeof globalThis.fetch);
    await expect(publisher.get(key)).resolves.toBeNull();
  });

  it('throws on a provider error without quoting the document', async () => {
    const publisher = scalewayUnderTest((() =>
      Promise.resolve(new Response(HTML, { status: 500 }))) as typeof globalThis.fetch);
    await expect(
      publisher.put({ objectKey: key, html: HTML, publicExpiresAt: expiry }),
    ).rejects.toThrow(/write failed with status 500/u);
    await expect(
      publisher.put({ objectKey: key, html: HTML, publicExpiresAt: expiry }),
    ).rejects.not.toThrow(new RegExp(HTML.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  });

  it('refuses an object whose expiry metadata is missing or unparseable', async () => {
    const missing = scalewayUnderTest((() =>
      Promise.resolve(new Response(HTML, { status: 200 }))) as typeof globalThis.fetch);
    await expect(missing.get(key)).rejects.toThrow(/missing its public expiry/u);

    const bad = scalewayUnderTest((() =>
      Promise.resolve(
        new Response(HTML, {
          status: 200,
          headers: { [PREVIEW_EXPIRY_METADATA_HEADER]: 'not-a-date' },
        }),
      )) as typeof globalThis.fetch);
    await expect(bad.get(key)).rejects.toThrow(/not a date/u);
  });
});
