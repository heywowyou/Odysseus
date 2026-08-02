/**
 * Docker-gated integration tests. Availability is checked once with a
 * short server-selection timeout at module load time (top-level await),
 * since describe.skip/skipIf must be decided during test collection,
 * before any beforeAll hook has a chance to run. If Docker Mongo isn't
 * reachable, the whole suite is skipped with a loud warning rather than
 * failing `pnpm test` for anyone who hasn't run `pnpm test:store:up`.
 */

import mongoose from 'mongoose';
import { afterAll, describe, expect, it } from 'vitest';
import { connectToMongo, disconnectFromMongo, getMongoUri } from './connection.js';
import { MONGODB_TEST_URI as TEST_URI, probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection: probeConnection } = await probeMongoAvailability(TEST_URI);

afterAll(async () => {
  if (probeConnection) await probeConnection.close();
});

describe('getMongoUri', () => {
  const originalUri = process.env['MONGODB_URI'];

  afterAll(() => {
    if (originalUri === undefined) delete process.env['MONGODB_URI'];
    else process.env['MONGODB_URI'] = originalUri;
  });

  it('throws a clear error when MONGODB_URI is unset', () => {
    delete process.env['MONGODB_URI'];
    expect(() => getMongoUri()).toThrow(/MONGODB_URI/);
  });

  it('returns the configured URI when set', () => {
    process.env['MONGODB_URI'] = 'mongodb://example.invalid/odysseus';
    expect(getMongoUri()).toBe('mongodb://example.invalid/odysseus');
  });
});

describe.skipIf(!mongoAvailable)('connectToMongo / disconnectFromMongo', () => {
  it('connects to and cleanly closes an isolated connection', async () => {
    const connection = await connectToMongo(TEST_URI);
    expect(connection.readyState).toBe(1); // connected

    await disconnectFromMongo(connection);
    expect(connection.readyState).toBe(0); // disconnected
  });

  it('does not touch mongoose global connection state', async () => {
    const globalStateBefore = mongoose.connection.readyState;
    const connection = await connectToMongo(TEST_URI);
    expect(mongoose.connection.readyState).toBe(globalStateBefore);
    await disconnectFromMongo(connection);
  });
});
