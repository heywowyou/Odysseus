/**
 * Shared helper for store's Docker-gated integration tests. Not named
 * *.test.ts/*.spec.ts, so Vitest's glob does not pick this up as a suite.
 */

import mongoose, { type Connection } from 'mongoose';

export const MONGODB_TEST_URI =
  process.env['MONGODB_TEST_URI'] ?? 'mongodb://localhost:27018/odysseus_test';

export interface MongoProbeResult {
  available: boolean;
  connection?: Connection;
}

/** Attempts a short-timeout connection so callers can decide
 *  describe.skipIf during test collection (top-level await), rather than
 *  discovering unavailability inside a beforeAll hook, which runs too
 *  late to affect which describe blocks were collected. */
export async function probeMongoAvailability(uri: string = MONGODB_TEST_URI): Promise<MongoProbeResult> {
  try {
    const connection = await mongoose
      .createConnection(uri, { serverSelectionTimeoutMS: 2000 })
      .asPromise();
    return { available: true, connection };
  } catch {
    console.warn(
      `[store tests] Docker MongoDB not reachable at ${uri}. Skipping store integration tests. Run "pnpm test:store:up" first.`,
    );
    return { available: false };
  }
}
