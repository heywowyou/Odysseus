import type { Connection } from 'mongoose';
import type { DirectoryEntry } from '@odysseus/core';
import { createAuditModel } from './schemas/audit.schema.js';
import { createDirectoryEntryModel } from './schemas/directory-entry.schema.js';

/**
 * Issue #559: the catalogue entry of the prospect an audit belongs to, the
 * source of the establishment facts the writing pass may state. Null for an
 * audit with no prospect, or a prospect not imported from the catalogue.
 */
export async function findDirectoryEntryForAudit(
  connection: Connection,
  auditId: string,
): Promise<DirectoryEntry | null> {
  const audit = await createAuditModel(connection)
    .findOne({ auditId }, { prospectId: 1, _id: 0 })
    .lean<{ prospectId?: string }>();
  if (audit?.prospectId === undefined) return null;
  return createDirectoryEntryModel(connection)
    .findOne({ prospectId: audit.prospectId }, { _id: 0 })
    .lean<DirectoryEntry>();
}
