/**
 * The one S3 client behind every bucket adapter (issue #531): the preview
 * publisher, the artifact store, the opt-out bucket, the reference-audit
 * store and its receipt bucket.
 *
 * Each adapter used to build its own `aws4fetch` client. None set a timeout,
 * so a stalled Scaleway request could hang preview publishing, an artifact
 * upload or opt-out processing indefinitely, and two of them read only the
 * first 1,000 keys of a listing. Here every request carries a deadline that
 * also covers reading the body, and a listing follows continuation tokens to
 * the end. Adapters keep their own status semantics (which codes mean
 * absent, which mean done) on top of `send`.
 *
 * Signing goes through `aws4fetch`'s `sign()` rather than its `fetch()`, so
 * the transport stays injectable for tests.
 */

import { AwsClient } from 'aws4fetch';

/** Enough for any small object on a slow link; large uploads pass their own. */
const DEFAULT_S3_TIMEOUT_MS = 30_000;

export interface S3BucketOptions {
  bucket: string;
  /** Region endpoint origin, e.g. `https://s3.fr-par.scw.cloud`. The bucket is
   *  addressed virtual-host style beneath it. */
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Deadline for one request, response body included. */
  timeoutMs?: number;
  /** Injected so adapters are testable without credentials or a network.
   *  Defaults to the runtime's own `fetch`. */
  fetchImpl?: typeof globalThis.fetch;
}

export interface S3Bucket {
  /** The object's URL, each path segment encoded on its own: the key's `/`
   *  is a delimiter, not data. */
  objectUrl(key: string): string;
  /** Signs and sends one request, aborted once the deadline passes. */
  send(url: string, init: RequestInit): Promise<Response>;
  /** Every key under `prefix`, across as many ListObjectsV2 pages as it
   *  takes. `label` names the bucket in an error message. */
  listKeys(prefix: string, label: string): Promise<string[]>;
}

export function createS3Bucket(options: S3BucketOptions): S3Bucket {
  const client = new AwsClient({
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
    service: 's3',
    region: options.region,
  });
  const doFetch = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_S3_TIMEOUT_MS;
  const endpoint = new URL(options.endpoint);
  const origin = `${endpoint.protocol}//${options.bucket}.${endpoint.host}`;

  const send = async (url: string, init: RequestInit): Promise<Response> => {
    const deadline = AbortSignal.timeout(timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
    return doFetch(await client.sign(url, { ...init, signal }));
  };

  return {
    objectUrl: (key) => `${origin}/${key.split('/').map(encodeURIComponent).join('/')}`,
    send,
    async listKeys(prefix, label) {
      const keys: string[] = [];
      let continuationToken: string | undefined;
      do {
        const url = new URL(`${origin}/`);
        url.searchParams.set('list-type', '2');
        url.searchParams.set('prefix', prefix);
        if (continuationToken !== undefined) {
          url.searchParams.set('continuation-token', continuationToken);
        }
        const response = await send(url.toString(), { method: 'GET' });
        if (!response.ok) {
          throw new Error(`${label} listing failed with status ${response.status}`);
        }
        const page = parseListObjectsV2(await response.text());
        keys.push(...page.keys);
        continuationToken = page.nextContinuationToken;
      } while (continuationToken !== undefined);
      return keys;
    },
  };
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&#(\d+);/gu, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/gu, '&');
}

/** The keys and the continuation token of one ListObjectsV2 page. The
 *  response is a flat, provider-generated document, so a tag match is
 *  enough and no XML dependency is added for it. */
function parseListObjectsV2(xml: string): { keys: string[]; nextContinuationToken?: string } {
  const keys = [...xml.matchAll(/<Key>([\s\S]*?)<\/Key>/gu)].map((match) =>
    decodeXmlText(match[1]!),
  );
  const truncated = /<IsTruncated>\s*true\s*<\/IsTruncated>/u.test(xml);
  const token = xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/u)?.[1];
  return truncated && token !== undefined
    ? { keys, nextContinuationToken: decodeXmlText(token) }
    : { keys };
}
