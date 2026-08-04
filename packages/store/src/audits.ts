/**
 * Read helpers over the `audits` and `findings` collections, for the
 * interface's audit detail view. Centralized here for the same reason
 * jobs.ts and severity-rollup.ts are: one place owns the query shape
 * rather than scattering Mongoose queries into the interface package.
 */

import type { Connection } from 'mongoose';
import { createAuditModel, type AuditDocument } from './schemas/audit.schema.js';
import { createFindingModel, type FindingDocument } from './schemas/finding.schema.js';

export async function getAudit(connection: Connection, auditId: string): Promise<AuditDocument | null> {
  const AuditModel = createAuditModel(connection);
  return AuditModel.findOne({ auditId }).lean<AuditDocument>();
}

export async function getFindingsForAudit(connection: Connection, auditId: string): Promise<FindingDocument[]> {
  const FindingModel = createFindingModel(connection);
  return FindingModel.find({ auditId }).lean<FindingDocument[]>();
}
