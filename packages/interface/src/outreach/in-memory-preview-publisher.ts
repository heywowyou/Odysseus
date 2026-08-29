/**
 * In-memory `PreviewPublisher`, milestone 9c plan 009.
 *
 * Exists for tests and for `--dry-run`, and it is half of what makes the port a
 * real seam rather than a single implementation wearing an interface. Every
 * contract test in `preview-publisher.test.ts` runs against both this and the
 * Scaleway adapter, so a behaviour the production adapter has and this one does
 * not is a test failure rather than a surprise in production.
 */

import type {
  PreviewObject,
  PreviewPublisher,
  PutPreviewObjectInput,
} from './preview-publisher.js';

export interface InMemoryPreviewPublisher extends PreviewPublisher {
  /** Test-only view of what is stored. Not on the port: no production caller
   *  may enumerate the bucket, which is why the port has no `list`. */
  keys(): string[];
}

export function createInMemoryPreviewPublisher(): InMemoryPreviewPublisher {
  const objects = new Map<string, PreviewObject>();

  return {
    put(input: PutPreviewObjectInput): Promise<void> {
      objects.set(input.objectKey, {
        html: input.html,
        publicExpiresAt: new Date(input.publicExpiresAt.getTime()),
      });
      return Promise.resolve();
    },
    get(objectKey: string): Promise<PreviewObject | null> {
      const stored = objects.get(objectKey);
      if (stored === undefined) return Promise.resolve(null);
      return Promise.resolve({
        html: stored.html,
        publicExpiresAt: new Date(stored.publicExpiresAt.getTime()),
      });
    },
    delete(objectKey: string): Promise<void> {
      objects.delete(objectKey);
      return Promise.resolve();
    },
    keys(): string[] {
      return [...objects.keys()].sort();
    },
  };
}
