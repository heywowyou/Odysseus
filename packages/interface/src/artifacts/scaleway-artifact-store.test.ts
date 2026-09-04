import { describe, expect, it } from 'vitest';
import { createScalewayArtifactStore } from './scaleway-artifact-store.js';
import type { ArtifactStore } from './artifact-store.js';

const BYTES = Buffer.from('%PDF-1.7 fake report bytes');

/** A fake S3 that stores bodies, mirroring preview-publisher.test.ts's own
 *  fakeS3 shape - the real adapter is driven through the same contract as
 *  a hand-rolled in-memory store would be, with no credentials and no
 *  network, and every signed request is recorded for the signing
 *  assertions below. */
function fakeS3(): { fetchImpl: typeof globalThis.fetch; requests: Request[] } {
  const objects = new Map<string, Buffer>();
  const requests: Request[] = [];

  const fetchImpl = (async (input: unknown): Promise<Response> => {
    const request = input as Request;
    requests.push(request.clone());
    const key = new URL(request.url).pathname;

    if (request.method === 'PUT') {
      objects.set(key, Buffer.from(await request.arrayBuffer()));
      return new Response(null, { status: 200 });
    }
    if (request.method === 'GET') {
      const stored = objects.get(key);
      if (stored === undefined) return new Response('', { status: 404 });
      return new Response(stored, { status: 200 });
    }
    return new Response(null, { status: 405 });
  }) as typeof globalThis.fetch;

  return { fetchImpl, requests };
}

function scalewayUnderTest(fetchImpl: typeof globalThis.fetch): ArtifactStore {
  return createScalewayArtifactStore({
    bucket: 'odysseus-artifacts-test',
    endpoint: 'https://s3.fr-par.scw.cloud',
    region: 'fr-par',
    accessKeyId: 'AKIATESTTESTTEST',
    secretAccessKey: 'secret-not-a-real-key',
    fetchImpl,
  });
}

describe('ArtifactStore contract: scaleway', () => {
  const key = 'example.com/2026-09-04T00-00-00Z/manifest.json';

  it('returns null for an object that was never written', async () => {
    const store = scalewayUnderTest(fakeS3().fetchImpl);
    await expect(store.get(key)).resolves.toBeNull();
  });

  it('round-trips bytes exactly', async () => {
    const store = scalewayUnderTest(fakeS3().fetchImpl);
    await store.put(key, BYTES);
    const stored = await store.get(key);
    expect(stored).not.toBeNull();
    expect(Buffer.compare(stored!, BYTES)).toBe(0);
  });

  it('overwrites on a repeated put rather than accumulating', async () => {
    const store = scalewayUnderTest(fakeS3().fetchImpl);
    await store.put(key, BYTES);
    const second = Buffer.from('replacement content');
    await store.put(key, second);
    const stored = await store.get(key);
    expect(Buffer.compare(stored!, second)).toBe(0);
  });
});

describe('scaleway artifact store adapter specifics', () => {
  const key = 'example.com/2026-09-04T00-00-00Z/pages/root-abc123/scan.json';

  it('addresses the bucket virtual-host style and signs every request', async () => {
    const s3 = fakeS3();
    await scalewayUnderTest(s3.fetchImpl).put(key, BYTES);

    const request = s3.requests[0];
    expect(request).toBeDefined();
    expect(request?.url).toBe(`https://odysseus-artifacts-test.s3.fr-par.scw.cloud/${key}`);
    expect(request?.method).toBe('PUT');
    const authorization = request?.headers.get('authorization') ?? '';
    expect(authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIATESTTESTTEST\/\d{8}\/fr-par\/s3\/aws4_request/u,
    );
  });

  it('reads a 403 as absent, because a private bucket hides keys it will not list', async () => {
    const store = scalewayUnderTest((() =>
      Promise.resolve(new Response('', { status: 403 }))) as typeof globalThis.fetch);
    await expect(store.get(key)).resolves.toBeNull();
  });

  it('throws on a provider error without quoting the bytes', async () => {
    const store = scalewayUnderTest((() =>
      Promise.resolve(new Response('', { status: 500 }))) as typeof globalThis.fetch);
    await expect(store.put(key, BYTES)).rejects.toThrow(/write failed with status 500/u);
  });

  it('throws on a read error rather than returning null, so a real outage is never mistaken for absence', async () => {
    const store = scalewayUnderTest((() =>
      Promise.resolve(new Response('', { status: 500 }))) as typeof globalThis.fetch);
    await expect(store.get(key)).rejects.toThrow(/read failed with status 500/u);
  });
});
