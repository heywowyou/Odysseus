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

/** The database name in a MongoDB URI's path, or undefined when the URI
 *  names none: "mongodb://host:27017/odysseus" names "odysseus", while an
 *  Atlas-style "mongodb+srv://host/?appName=x" names nothing. A plain
 *  string scan rather than new URL(): the mongo schemes are not WHATWG
 *  schemes, and multi-host URIs do not parse as URLs. Never throws. */
export function parseUriDatabaseName(uri: string): string | undefined {
  const schemeEnd = uri.indexOf('://');
  if (schemeEnd === -1) return undefined;
  const afterScheme = uri.slice(schemeEnd + 3);
  const pathStart = afterScheme.indexOf('/');
  if (pathStart === -1) return undefined;
  const path = afterScheme.slice(pathStart + 1);
  const queryStart = path.indexOf('?');
  const name = queryStart === -1 ? path : path.slice(0, queryStart);
  return name === '' ? undefined : name;
}

/** MONGODB_DB_NAME, or undefined when unset or blank. Blank matters: the
 *  operator's .env keeps unused knobs as empty assignments. */
function envDatabaseName(): string | undefined {
  const name = process.env['MONGODB_DB_NAME'];
  if (name === undefined || name === '') return undefined;
  return name;
}

/** Chooses the database a connection writes into: a database named in the
 *  URI's path always wins, then MONGODB_DB_NAME, then undefined. The URI
 *  winning is load-bearing: MONGODB_TEST_URI's per-worker test databases
 *  must stay exact even when .env sets MONGODB_DB_NAME. Undefined is not
 *  completed with a default; connectToMongo refuses instead (issue #38). */
export function resolveMongoDbName(uri: string): string | undefined {
  return parseUriDatabaseName(uri) ?? envDatabaseName();
}

export async function connectToMongo(uri: string = getMongoUri()): Promise<Connection> {
  const dbName = resolveMongoDbName(uri);
  if (dbName === undefined) {
    throw new Error(
      'odysseus: MONGODB_URI names no database in its path and MONGODB_DB_NAME is not set. Set MONGODB_DB_NAME in .env to a database this machine owns (see .env.example): a scan must not fall into whatever database the driver defaults to, or its records surface on a dashboard whose artifacts live somewhere else.',
    );
  }
  const connection = mongoose.createConnection(uri, { dbName });
  await connection.asPromise();
  return connection;
}

export async function disconnectFromMongo(connection: Connection): Promise<void> {
  await connection.close();
}
