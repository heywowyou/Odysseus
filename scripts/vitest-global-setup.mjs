import { existsSync, readFileSync, rmSync } from 'node:fs';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Must match packages/store/src/test-support.ts's MONGO_SKIP_MARKER_PATH -
// duplicated rather than imported so this stays plain JS outside the
// tsc -b project-reference graph.
const MONGO_SKIP_MARKER_PATH = join(tmpdir(), 'odysseus-store-mongo-skip.log');
// Must match test-support.ts's default MONGODB_TEST_URI.
const DOCKER_MONGO_URI = 'mongodb://localhost:27018/odysseus_test';
// The Docker test service's server version (docker-compose.yml).
const IN_MEMORY_MONGO_VERSION = '7.0.14';

function isReachable(uri, timeoutMs = 500) {
  return new Promise((resolve) => {
    const parsed = new URL(uri);
    const socket = createConnection({ host: parsed.hostname, port: Number(parsed.port) || 27017 });
    const settle = (reachable) => {
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => settle(true));
    socket.once('timeout', () => settle(false));
    socket.once('error', () => settle(false));
  });
}

/**
 * Issue #572: the store's real-query tests no longer need Docker. When the
 * Docker test database is down and no MONGODB_TEST_URI was given, one
 * in-memory single-node replica set (like the Docker service and Atlas, so
 * the multi-document transaction runs) serves the whole run, and the workers
 * read its address from MONGODB_TEST_URI. ODYSSEUS_TEST_MONGO=docker keeps
 * the old behaviour: skip when Docker is down. The first start downloads a
 * mongod binary into the user cache.
 */
async function startInMemoryMongo() {
  if (process.env['MONGODB_TEST_URI'] !== undefined) return undefined;
  if (process.env['ODYSSEUS_TEST_MONGO'] === 'docker') return undefined;
  if (await isReachable(DOCKER_MONGO_URI)) return undefined;
  try {
    const { MongoMemoryReplSet } = await import('mongodb-memory-server-core');
    const replSet = await MongoMemoryReplSet.create({
      binary: { version: IN_MEMORY_MONGO_VERSION },
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    const uri = new URL(replSet.getUri());
    uri.pathname = '/odysseus_test';
    process.env['MONGODB_TEST_URI'] = uri.toString();
    return replSet;
  } catch (error) {
    console.warn(`[store tests] in-memory MongoDB could not start: ${error.message}`);
    return undefined;
  }
}

export default async function setup() {
  try {
    rmSync(MONGO_SKIP_MARKER_PATH, { force: true });
  } catch {
    // ignore - nothing to clear
  }
  const inMemoryMongo = await startInMemoryMongo();

  return async () => {
    await inMemoryMongo?.stop();
    if (!existsSync(MONGO_SKIP_MARKER_PATH)) return;

    const uris = readFileSync(MONGO_SKIP_MARKER_PATH, 'utf8').split('\n').filter(Boolean);
    if (uris.length > 0) {
      console.warn(
        `[store tests] ${uris.length} store integration test file(s) skipped: MongoDB not reachable at ${uris[0]}. Run "pnpm test:store:up", or unset ODYSSEUS_TEST_MONGO to use the in-memory server.`,
      );
    }

    rmSync(MONGO_SKIP_MARKER_PATH, { force: true });
  };
}
