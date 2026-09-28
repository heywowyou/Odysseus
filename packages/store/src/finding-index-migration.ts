import type { Connection } from 'mongoose';

/**
 * Issue #549: `auditId_1` is a prefix of both remaining finding indexes, and
 * no query reads `siteUrl_1_dedupeKey_1`; each only added write cost to every
 * upsert. Mongoose builds the indexes a schema declares but never drops the
 * ones it stopped declaring, so startup does. Idempotent.
 */
const OBSOLETE_FINDING_INDEXES = ['auditId_1', 'siteUrl_1_dedupeKey_1'] as const;

export async function dropObsoleteFindingIndexes(connection: Connection): Promise<string[]> {
  if (connection.db === undefined) throw new Error('MongoDB is not connected');
  const collection = connection.db.collection('findings');
  let names: string[];
  try {
    names = (await collection.listIndexes().toArray()).map((index) => String(index['name']));
  } catch (error) {
    if ((error as { codeName?: string }).codeName === 'NamespaceNotFound') return [];
    throw error;
  }
  const dropped: string[] = [];
  for (const name of OBSOLETE_FINDING_INDEXES) {
    if (!names.includes(name)) continue;
    await collection.dropIndex(name);
    dropped.push(name);
  }
  return dropped;
}
