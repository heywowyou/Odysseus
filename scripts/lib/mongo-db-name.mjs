/**
 * The database a script writes into, chosen exactly as the store's
 * `resolveMongoDbName` (packages/store/src/connection.ts) chooses it: a
 * database named in the URI's path wins, then MONGODB_DB_NAME, then nothing.
 * Nothing is not completed with the driver's default, which is how a
 * connection silently lands in production's `test` database (issues #38 and
 * #524). mongo-db-name.test.mjs holds the two rules equal.
 */

/** @param {string} uri */
function uriDatabaseName(uri) {
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

/**
 * @param {string} uri
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string | undefined}
 */
export function resolveMongoDbName(uri, env = process.env) {
  const fromEnv = env['MONGODB_DB_NAME'];
  return uriDatabaseName(uri) ?? (fromEnv === undefined || fromEnv === '' ? undefined : fromEnv);
}
