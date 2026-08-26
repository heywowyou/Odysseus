/**
 * Read/write helpers around the `prospects` collection. Insert-only - see
 * schemas/prospect.schema.ts's doc comment for why - so this file has no
 * upsert helper, unlike persist-sirene-cache.ts.
 */

import { randomUUID } from 'node:crypto';
import type { Connection } from 'mongoose';
import {
  createProspectModel,
  type ProspectDocument,
  type ProspectDocumentFields,
} from './schemas/prospect.schema.js';

const PROSPECT_RETENTION_DAYS = 90;

export type NewProspectInput = Omit<
  ProspectDocumentFields,
  'prospectId' | 'createdAt' | 'expiresAt'
>;

export async function createProspect(
  connection: Connection,
  input: NewProspectInput,
): Promise<ProspectDocument> {
  const ProspectModel = createProspectModel(connection);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + PROSPECT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const doc: ProspectDocumentFields = {
    ...input,
    prospectId: randomUUID(),
    createdAt,
    expiresAt,
  };
  await ProspectModel.create(doc);
  return doc;
}

export async function getProspect(
  connection: Connection,
  prospectId: string,
): Promise<ProspectDocument | null> {
  const ProspectModel = createProspectModel(connection);
  return ProspectModel.findOne({ prospectId }).lean<ProspectDocument>();
}

export async function listQualifiedProspects(
  connection: Connection,
  limit = 200,
): Promise<ProspectDocument[]> {
  const ProspectModel = createProspectModel(connection);
  return ProspectModel.find({ 'qualification.qualified': true })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean<ProspectDocument[]>();
}
