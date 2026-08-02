/**
 * Connection handling. Uses mongoose.createConnection() rather than the
 * global mongoose.connect(): an isolated Connection object means the CLI
 * can close exactly the connection it opened in a finally block, and
 * store's own tests can connect to a separate odysseus_test database
 * without touching global Mongoose state (or interfering with a test
 * runner that imports this package more than once).
 */

import mongoose, { type Connection } from 'mongoose';

/** Reads MONGODB_URI from the environment. Throws a clear, loud error if
 *  unset rather than defaulting to a local instance: a silent localhost
 *  fallback would make a misconfigured production run look like it
 *  succeeded while quietly writing nowhere real. */
export function getMongoUri(): string {
  const uri = process.env['MONGODB_URI'];
  if (!uri) {
    throw new Error(
      'odysseus: MONGODB_URI is not set. Set it in the environment or in .env before running a command that persists to MongoDB.',
    );
  }
  return uri;
}

export async function connectToMongo(uri: string = getMongoUri()): Promise<Connection> {
  const connection = mongoose.createConnection(uri);
  await connection.asPromise();
  return connection;
}

export async function disconnectFromMongo(connection: Connection): Promise<void> {
  await connection.close();
}
