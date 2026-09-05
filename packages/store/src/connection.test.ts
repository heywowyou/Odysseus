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
import {
  connectToMongo,
  disconnectFromMongo,
  getMongoUri,
  parseUriDatabaseName,
  resolveMongoDbName,
} from './connection.js';
import { MONGODB_TEST_URI as TEST_URI, probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection: probeConnection } =
  await probeMongoAvailability(TEST_URI);

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

describe('parseUriDatabaseName', () => {
  it('reads the database from a URI path', () => {
    expect(parseUriDatabaseName('mongodb://localhost:27017/odysseus')).toBe('odysseus');
    expect(parseUriDatabaseName('mongodb+srv://host.example/odysseus?tls=true')).toBe('odysseus');
  });

  it('returns undefined when the URI names no database', () => {
    expect(parseUriDatabaseName('mongodb://localhost:27017')).toBeUndefined();
    expect(parseUriDatabaseName('mongodb://localhost:27017/')).toBeUndefined();
    expect(parseUriDatabaseName('mongodb+srv://host.example/?appName=x')).toBeUndefined();
    expect(parseUriDatabaseName('not-a-uri')).toBeUndefined();
  });
});

describe('resolveMongoDbName', () => {
  const originalDbName = process.env['MONGODB_DB_NAME'];

  afterAll(() => {
    if (originalDbName === undefined) delete process.env['MONGODB_DB_NAME'];
    else process.env['MONGODB_DB_NAME'] = originalDbName;
  });

  it('prefers the database named in the URI over MONGODB_DB_NAME', () => {
    process.env['MONGODB_DB_NAME'] = 'env-db';
    expect(resolveMongoDbName('mongodb://localhost:27017/uri-db')).toBe('uri-db');
  });

  it('falls back to MONGODB_DB_NAME when the URI names no database', () => {
    process.env['MONGODB_DB_NAME'] = 'env-db';
    expect(resolveMongoDbName('mongodb://localhost:27017/?appName=x')).toBe('env-db');
  });

  it('treats a blank MONGODB_DB_NAME as unset', () => {
    process.env['MONGODB_DB_NAME'] = '';
    expect(resolveMongoDbName('mongodb://localhost:27017')).toBeUndefined();
  });
});

describe('connectToMongo database naming (issue #38)', () => {
  const originalDbName = process.env['MONGODB_DB_NAME'];

  afterAll(() => {
    if (originalDbName === undefined) delete process.env['MONGODB_DB_NAME'];
    else process.env['MONGODB_DB_NAME'] = originalDbName;
  });

  it('refuses to connect when neither the URI nor MONGODB_DB_NAME names a database', async () => {
    delete process.env['MONGODB_DB_NAME'];
    await expect(connectToMongo('mongodb://localhost:27017')).rejects.toThrow(/MONGODB_DB_NAME/);
  });
});

describe.skipIf(!mongoAvailable)('connectToMongo / disconnectFromMongo', () => {
  it('isolates the default test database by Vitest worker', async () => {
    const originalPoolId = process.env['VITEST_POOL_ID'];
    process.env['VITEST_POOL_ID'] = '7';

    try {
      const { connection } = await probeMongoAvailability();
      expect(connection?.name).toBe('odysseus_test_worker_7');
      await connection?.close();
    } finally {
      if (originalPoolId === undefined) delete process.env['VITEST_POOL_ID'];
      else process.env['VITEST_POOL_ID'] = originalPoolId;
    }
  });

  it('connects to and cleanly closes an isolated connection', async () => {
    const connection = await connectToMongo(TEST_URI);
    expect(connection.readyState).toBe(1); // connected

    await disconnectFromMongo(connection);
    expect(connection.readyState).toBe(0); // disconnected
  });

  it('lands a database-less URI in the MONGODB_DB_NAME database', async () => {
    const originalDbName = process.env['MONGODB_DB_NAME'];
    const workerId = process.env['VITEST_POOL_ID'] ?? '0';
    process.env['MONGODB_DB_NAME'] = `odysseus_test_worker_dbname_${workerId}`;

    try {
      const parsed = new URL(TEST_URI);
      const connection = await connectToMongo(`mongodb://${parsed.host}/`);
      expect(connection.name).toBe(process.env['MONGODB_DB_NAME']);
      await disconnectFromMongo(connection);
    } finally {
      if (originalDbName === undefined) delete process.env['MONGODB_DB_NAME'];
      else process.env['MONGODB_DB_NAME'] = originalDbName;
    }
  });

  it('does not touch mongoose global connection state', async () => {
    const globalStateBefore = mongoose.connection.readyState;
    const connection = await connectToMongo(TEST_URI);
    expect(mongoose.connection.readyState).toBe(globalStateBefore);
    await disconnectFromMongo(connection);
  });
});
