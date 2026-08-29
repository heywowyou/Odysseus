/**
 * The `PreviewPublisher` port, milestone 9c plan 009.
 *
 * Deliberately three methods over one object. The publisher's whole job is to
 * put one already-validated, already-linted HTML document somewhere the public
 * site can read it, and to take it away again. It knows nothing about hotels,
 * prescans, tokens or Mongo, which is what lets the in-memory adapter be a
 * `Map` and the production adapter be forty lines of signed `fetch`.
 *
 * Provider configuration never crosses this boundary: a caller receives an
 * adapter, never a bucket name, an endpoint or a key. That is what makes the
 * seam real rather than decorative, and it is why switching Scaleway for any
 * other S3-compatible provider is an adapter change and nothing else.
 *
 * `publicExpiresAt` is stored *on the object*, not only in Mongo. The public
 * site cannot read Mongo, so without it the route could not tell an expired
 * preview (410 Gone) from an unknown one (404), and telling those apart is
 * required. Mongo remains the private record of truth; this copy exists so the
 * public half can answer correctly on its own.
 */

export interface PreviewObject {
  html: string;
  publicExpiresAt: Date;
}

export interface PutPreviewObjectInput {
  objectKey: string;
  html: string;
  publicExpiresAt: Date;
}

export interface PreviewPublisher {
  put(input: PutPreviewObjectInput): Promise<void>;
  get(objectKey: string): Promise<PreviewObject | null>;
  /** Idempotent: deleting an object that is already gone is a success, because
   *  revocation must not fail on its second attempt or on a lifecycle rule
   *  having got there first. */
  delete(objectKey: string): Promise<void>;
}

/** The header the expiry rides in. S3 user metadata, so it round-trips through
 *  any S3-compatible provider without a sidecar object. */
export const PREVIEW_EXPIRY_METADATA_HEADER = 'x-amz-meta-public-expires-at';

export const PREVIEW_CONTENT_TYPE = 'text/html; charset=utf-8';
