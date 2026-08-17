/**
 * Read helpers over the `audits` and `findings` collections, for the
 * interface's audit detail view. Centralized here for the same reason
 * jobs.ts and severity-rollup.ts are: one place owns the query shape
 * rather than scattering Mongoose queries into the interface package.
 */

import type { Connection } from 'mongoose';
import { isValidSiren, type AuditManualFields } from '@odysseus/core';
import { createAuditModel, type AuditDocument } from './schemas/audit.schema.js';
import { createFindingModel, type FindingDocument } from './schemas/finding.schema.js';

export async function getAudit(connection: Connection, auditId: string): Promise<AuditDocument | null> {
  const AuditModel = createAuditModel(connection);
  return AuditModel.findOne({ auditId }).lean<AuditDocument>();
}

export async function getAuditManualFields(
  connection: Connection,
  auditId: string,
): Promise<AuditManualFields | undefined> {
  const AuditModel = createAuditModel(connection);
  const audit = await AuditModel.findOne({ auditId }, { manualFields: 1 }).lean<Pick<AuditDocument, 'manualFields'>>();
  return audit?.manualFields;
}

/** Merge semantics: only the keys present in `partial` are touched, every
 *  other previously saved field survives untouched - the operator edits
 *  one field at a time from the audit detail panel, not the whole
 *  document. `updatedAt` is always server-stamped on every call,
 *  regardless of which fields changed. Throws on an invalid SIREN
 *  checksum rather than persisting one, same fail-fast boundary rule
 *  routes/scans.ts already applies to the pre-scan siren option. */
export async function setAuditManualFields(
  connection: Connection,
  auditId: string,
  partial: Omit<AuditManualFields, 'updatedAt'>,
): Promise<AuditManualFields> {
  if (partial.siren !== undefined && !isValidSiren(partial.siren.value)) {
    throw new Error('odysseus: siren must be a valid SIREN (9 digits, passing the INSEE checksum)');
  }

  const AuditModel = createAuditModel(connection);
  const setFields: Record<string, unknown> = { 'manualFields.updatedAt': new Date() };
  for (const [key, value] of Object.entries(partial)) {
    if (value !== undefined) setFields[`manualFields.${key}`] = value;
  }

  const updated = await AuditModel.findOneAndUpdate(
    { auditId },
    { $set: setFields },
    { new: true, projection: { manualFields: 1 } },
  ).lean<Pick<AuditDocument, 'manualFields'>>();

  if (!updated?.manualFields) {
    throw new Error(`odysseus: audit ${auditId} not found`);
  }
  return updated.manualFields;
}

export async function getFindingsForAudit(connection: Connection, auditId: string): Promise<FindingDocument[]> {
  const FindingModel = createFindingModel(connection);
  return FindingModel.find({ auditId }).lean<FindingDocument[]>();
}
