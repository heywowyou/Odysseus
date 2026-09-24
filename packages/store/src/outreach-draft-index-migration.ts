import type { Connection } from 'mongoose';
import { outreachDraftSchema } from './schemas/outreach-draft.schema.js';

const INDEX_NAME = 'threadId_1_touch_1';
const INDEX_KEY = { threadId: 1, touch: 1 } as const;

/** The scope before mailbox deletion became retryable (#422). A database
 *  created before that change still holds this index under the same name,
 *  and Mongoose refuses to build the wider one over it, so every draft
 *  insert failed after the Gmail draft had been created. */
const LEGACY_PARTIAL_FILTER = { status: 'created' };

function stable(value: unknown): string {
  return JSON.stringify(value, (_key, child: unknown) =>
    typeof child === 'object' && child !== null && !Array.isArray(child)
      ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => a.localeCompare(b)))
      : child,
  );
}

/** Read from the schema, never from a compiled model: compiling the model
 *  starts Mongoose's automatic index build, which fails over the legacy
 *  index and stays cached as failed for the life of the process. */
function currentPartialFilter(): unknown {
  const declared = outreachDraftSchema.indexes().find(([key]) => stable(key) === stable(INDEX_KEY));
  if (declared === undefined) throw new Error('outreach draft thread/touch index is not declared');
  return declared[1]['partialFilterExpression'];
}

export type OutreachDraftIndexMigration = 'absent' | 'current' | 'migrated';

/**
 * Replaces the legacy thread/touch unique index with the one the schema
 * declares. Must run before anything compiles the outreach draft model.
 * Idempotent, and it touches only an index whose scope is exactly the
 * legacy one. If the new index cannot be built, the legacy one is restored
 * so the draft table never stays without its uniqueness guard.
 */
export async function migrateOutreachDraftThreadTouchIndex(
  connection: Connection,
): Promise<OutreachDraftIndexMigration> {
  if (connection.db === undefined) throw new Error('MongoDB is not connected');
  const collection = connection.db.collection(outreachDraftSchema.get('collection') as string);

  let indexes: Array<{ name?: string; partialFilterExpression?: unknown }>;
  try {
    indexes = await collection.listIndexes().toArray();
  } catch (error) {
    if ((error as { codeName?: string }).codeName === 'NamespaceNotFound') return 'absent';
    throw error;
  }
  const existing = indexes.find((index) => index.name === INDEX_NAME);
  if (existing === undefined) return 'absent';
  if (stable(existing.partialFilterExpression) !== stable(LEGACY_PARTIAL_FILTER)) {
    return 'current';
  }

  await collection.dropIndex(INDEX_NAME);
  try {
    await collection.createIndex(INDEX_KEY, {
      name: INDEX_NAME,
      unique: true,
      partialFilterExpression: currentPartialFilter() as Record<string, unknown>,
    });
  } catch (error) {
    await collection.createIndex(INDEX_KEY, {
      name: INDEX_NAME,
      unique: true,
      partialFilterExpression: LEGACY_PARTIAL_FILTER,
    });
    throw error;
  }
  return 'migrated';
}
