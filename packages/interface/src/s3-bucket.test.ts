import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createS3Bucket } from './s3-bucket.js';

const CREDENTIALS = {
  bucket: 'odysseus-test',
  region: 'fr-par',
  accessKeyId: 'SCWTESTKEY',
  secretAccessKey: 'test-secret',
};

let server: Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

describe('createS3Bucket (issue #531)', () => {
  it('rejects a request the endpoint never answers once the deadline passes', async () => {
    server = createServer(() => {
      // Accept the connection and never respond.
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const bucket = createS3Bucket({
      ...CREDENTIALS,
      endpoint: `http://localhost:${port}`,
      timeoutMs: 200,
      // Virtual-host addressing names odysseus-test.localhost; send
      // the signed request to the local server instead.
      fetchImpl: (input) => {
        const request = input as Request;
        const url = new URL(request.url);
        url.hostname = '127.0.0.1';
        return fetch(new Request(url, request));
      },
    });

    const started = Date.now();
    await expect(bucket.send(bucket.objectUrl('stalled.json'), { method: 'GET' })).rejects.toThrow(
      /abort|timeout/iu,
    );
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('returns every key of a listing that spans two pages', async () => {
    const requested: string[] = [];
    const bucket = createS3Bucket({
      ...CREDENTIALS,
      endpoint: 'https://s3.fr-par.scw.cloud',
      fetchImpl: (input) => {
        const url = new URL((input as Request).url);
        requested.push(url.search);
        const secondPage = url.searchParams.get('continuation-token') === 'page-2';
        const xml = secondPage
          ? '<ListBucketResult><IsTruncated>false</IsTruncated><Key>opt-out/c.json</Key></ListBucketResult>'
          : '<ListBucketResult><IsTruncated>true</IsTruncated><Key>opt-out/a.json</Key>' +
            '<Key>opt-out/b&amp;c.json</Key><NextContinuationToken>page-2</NextContinuationToken></ListBucketResult>';
        return Promise.resolve(new Response(xml, { status: 200 }));
      },
    });

    expect(await bucket.listKeys('opt-out/', 'opt-out')).toEqual([
      'opt-out/a.json',
      'opt-out/b&c.json',
      'opt-out/c.json',
    ]);
    expect(requested).toHaveLength(2);
    expect(requested[1]).toContain('continuation-token=page-2');
  });

  it('names the bucket when a listing fails', async () => {
    const bucket = createS3Bucket({
      ...CREDENTIALS,
      endpoint: 'https://s3.fr-par.scw.cloud',
      fetchImpl: () => Promise.resolve(new Response('', { status: 500 })),
    });
    await expect(bucket.listKeys('x/', 'reference receipt')).rejects.toThrow(
      'reference receipt listing failed with status 500',
    );
  });
});
