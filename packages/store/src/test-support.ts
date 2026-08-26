/**
 * Shared helper for store's Docker-gated integration tests. Not named
 * *.test.ts/*.spec.ts, so Vitest's glob does not pick this up as a suite.
 */

import { appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mongoose, { type Connection } from 'mongoose';

export const MONGODB_TEST_URI =
  process.env['MONGODB_TEST_URI'] ?? 'mongodb://localhost:27018/odysseus_test';

export interface MongoProbeResult {
  available: boolean;
  connection?: Connection;
}

/** Read by scripts/vitest-global-setup.mjs, which prints one summary line
 *  for however many store integration test files skip in a run instead of
 *  each file warning separately. The literal path is duplicated there
 *  rather than imported, to keep that script plain JS outside the tsc -b
 *  project-reference graph; keep the two in sync if this changes. */
export const MONGO_SKIP_MARKER_PATH = join(tmpdir(), 'odysseus-store-mongo-skip.log');

function getWorkerMongoUri(uri: string): string {
  const workerId = process.env['VITEST_POOL_ID'];
  if (workerId === undefined) return uri;

  const parsed = new URL(uri);
  const databaseName = parsed.pathname.slice(1) || 'odysseus_test';
  const safeWorkerId = workerId.replace(/[^a-zA-Z0-9_-]/gu, '_');
  parsed.pathname = `/${databaseName}_worker_${safeWorkerId}`;
  return parsed.toString();
}

/** Attempts a short-timeout connection so callers can decide
 *  describe.skipIf during test collection (top-level await), rather than
 *  discovering unavailability inside a beforeAll hook, which runs too
 *  late to affect which describe blocks were collected. */
export async function probeMongoAvailability(
  uri: string = getWorkerMongoUri(MONGODB_TEST_URI),
): Promise<MongoProbeResult> {
  try {
    const connection = await mongoose
      .createConnection(uri, { serverSelectionTimeoutMS: 2000 })
      .asPromise();
    return { available: true, connection };
  } catch {
    try {
      appendFileSync(MONGO_SKIP_MARKER_PATH, `${uri}\n`);
    } catch {
      // Marker file unwritable for some reason - fall back to the old
      // per-file warning rather than skipping silently.
      console.warn(
        `[store tests] Docker MongoDB not reachable at ${uri}. Skipping store integration tests. Run "pnpm test:store:up" first.`,
      );
    }
    return { available: false };
  }
}
