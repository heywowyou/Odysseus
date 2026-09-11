/**
 * Shared helper for store's Docker-gated integration tests. Not named
 * *.test.ts/*.spec.ts, so Vitest's glob does not pick this up as a suite.
 */

import { appendFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mongoose, { type Connection } from 'mongoose';

export const MONGODB_TEST_URI =
  process.env['MONGODB_TEST_URI'] ?? 'mongodb://localhost:27018/odysseus_test';

export interface MongoProbeResult {
  available: boolean;
  connection?: Connection;
}

/** Gives an integration suite a private base database while preserving an
 * optional URI query string. probeMongoAvailability adds its worker suffix
 * afterwards, so two concurrently scheduled copies of the suite remain
 * isolated as well. */
export function scopedMongoTestUri(scope: string, uri: string = MONGODB_TEST_URI): string {
  const parsed = new URL(uri);
  const databaseName = parsed.pathname.slice(1) || 'odysseus_test';
  const safeScope = scope.replace(/[^a-zA-Z0-9_-]/gu, '_');
  parsed.pathname = `/${databaseName}_${safeScope}`;
  return parsed.toString();
}

/** Read by scripts/vitest-global-setup.mjs, which prints one summary line
 *  for however many store integration test files skip in a run instead of
 *  each file warning separately. The literal path is duplicated there
 *  rather than imported, to keep that script plain JS outside the tsc -b
 *  project-reference graph; keep the two in sync if this changes. */
const MONGO_SKIP_MARKER_PATH = join(tmpdir(), 'odysseus-store-mongo-skip.log');

function getWorkerMongoUri(uri: string): string {
  const workerId = process.env['VITEST_POOL_ID'];
  if (workerId === undefined) return uri;

  const parsed = new URL(uri);
  const databaseName = parsed.pathname.slice(1) || 'odysseus_test';
  const safeWorkerId = workerId.replace(/[^a-zA-Z0-9_-]/gu, '_');
  parsed.pathname = `/${databaseName}_worker_${safeWorkerId}`;
  return parsed.toString();
}

/** Cheap reachability check so a Docker-down machine skips in a fraction
 *  of a second instead of paying the full server-selection timeout in
 *  every store test file. The mongoose connection below stays the
 *  authoritative gate; this only avoids a connect that cannot succeed. */
function isTcpPortReachable(uri: string, timeoutMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    const parsed = new URL(uri);
    const socket = createConnection({
      host: parsed.hostname,
      port: Number(parsed.port) || 27017,
    });
    const settle = (reachable: boolean) => {
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => settle(true));
    socket.once('timeout', () => settle(false));
    socket.once('error', () => settle(false));
  });
}

/** Records one skipped integration file, or warns out loud when the
 *  marker file cannot be written. */
function markMongoUnavailable(uri: string): void {
  try {
    appendFileSync(MONGO_SKIP_MARKER_PATH, `${uri}\n`);
  } catch {
    // Marker file unwritable for some reason - fall back to the old
    // per-file warning rather than skipping silently.
    console.warn(
      `[store tests] Docker MongoDB not reachable at ${uri}. Skipping store integration tests. Run "pnpm test:store:up" first.`,
    );
  }
}

/** Attempts a short-timeout connection so callers can decide
 *  describe.skipIf during test collection (top-level await), rather than
 *  discovering unavailability inside a beforeAll hook, which runs too
 *  late to affect which describe blocks were collected. */
export async function probeMongoAvailability(
  uri: string = getWorkerMongoUri(MONGODB_TEST_URI),
): Promise<MongoProbeResult> {
  if (!(await isTcpPortReachable(uri))) {
    markMongoUnavailable(uri);
    return { available: false };
  }
  try {
    const connection = await mongoose
      .createConnection(uri, { serverSelectionTimeoutMS: 2000 })
      .asPromise();
    return { available: true, connection };
  } catch {
    markMongoUnavailable(uri);
    return { available: false };
  }
}
