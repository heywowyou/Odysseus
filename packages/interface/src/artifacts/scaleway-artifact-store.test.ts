import { describe, expect, it } from 'vitest';
import { createScalewayArtifactStore } from './scaleway-artifact-store.js';
import type { ArtifactStore } from './artifact-store.js';

const BYTES = Buffer.from('%PDF-1.7 fake report bytes');

/** A fake S3 that stores bodies, mirroring preview-publisher.test.ts's own
 *  fakeS3 shape - the real adapter is driven through the same contract as
 *  a hand-rolled in-memory store would be, with no credentials and no
 *  network, and every signed request is recorded for the signing
 *  assertions below. */
function fakeS3(options: { pageSize?: number; failDeleteStatus?: number } = {}): {
  fetchImpl: typeof globalThis.fetch;
  requests: Request[];
  objects: Map<string, Buffer>;
} {
  const objects = new Map<string, Buffer>();
  const requests: Request[] = [];
  const pageSize = options.pageSize ?? 1000;

  const fetchImpl = (async (input: unknown): Promise<Response> => {
    const request = input as Request;
    requests.push(request.clone());
    const url = new URL(request.url);
    const key = url.pathname.slice(1).split('/').map(decodeURIComponent).join('/');

    if (request.method === 'GET' && url.searchParams.get('list-type') === '2') {
      const prefix = url.searchParams.get('prefix') ?? '';
      const matching = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = Number(url.searchParams.get('continuation-token') ?? '0');
      const page = matching.slice(start, start + pageSize);
      const truncated = start + pageSize < matching.length;
      const escape = (value: string) => value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;');
      const body = [
        '<ListBucketResult>',
        ...page.map((k) => `<Contents><Key>${escape(k)}</Key></Contents>`),
        `<IsTruncated>${truncated}</IsTruncated>`,
        truncated ? `<NextContinuationToken>${start + pageSize}</NextContinuationToken>` : '',
        '</ListBucketResult>',
      ].join('');
      return new Response(body, { status: 200 });
    }
    if (request.method === 'PUT') {
      objects.set(key, Buffer.from(await request.arrayBuffer()));
      return new Response(null, { status: 200 });
    }
    if (request.method === 'GET') {
      const stored = objects.get(key);
      if (stored === undefined) return new Response('', { status: 404 });
      return new Response(stored, { status: 200 });
    }
    if (request.method === 'DELETE') {
      if (options.failDeleteStatus !== undefined) {
        return new Response('<Error>internal detail</Error>', { status: options.failDeleteStatus });
      }
      objects.delete(key);
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 405 });
  }) as typeof globalThis.fetch;

  return { fetchImpl, requests, objects };
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

describe('ArtifactStore list and delete: scaleway (issue #384)', () => {
  it('lists every key under a prefix across continuation pages', async () => {
    const s3 = fakeS3({ pageSize: 2 });
    const store = scalewayUnderTest(s3.fetchImpl);
    const prefix = 'hotel.example/2026-09-16T10-00-00Z/';
    const keys = ['a.json', 'b & c.json', 'pages/p1/scan.json', 'shots/x.png', 'z.json'].map(
      (rel) => `${prefix}${rel}`,
    );
    for (const k of keys) await store.put(k, BYTES);
    await store.put('hotel.example/2026-09-16T10-00-00Z-copy/other.json', BYTES);

    await expect(store.list(prefix)).resolves.toEqual([...keys].sort());
  });

  it('deletes a key, and deleting an absent key still succeeds', async () => {
    const s3 = fakeS3();
    const store = scalewayUnderTest(s3.fetchImpl);
    const key = 'hotel.example/2026-09-16T10-00-00Z/report.pdf';
    await store.put(key, BYTES);
    await store.delete(key);
    await expect(store.get(key)).resolves.toBeNull();
    await expect(store.delete(key)).resolves.toBeUndefined();
  });

  it('throws on a provider failure without quoting the provider body', async () => {
    const store = scalewayUnderTest(fakeS3({ failDeleteStatus: 500 }).fetchImpl);
    const failure = store.delete('hotel.example/2026-09-16T10-00-00Z/report.pdf');
    await expect(failure).rejects.toThrow('artifact object delete failed with status 500');
    await expect(failure).rejects.not.toThrow(/internal detail/u);
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
