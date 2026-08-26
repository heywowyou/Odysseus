/**
 * Mongoose schema for a singleton-per-source resume checkpoint into the
 * AFNIC Fichier A CSV. Byte offset, not row count: the AFNIC file is
 * static once downloaded, so resuming by "skip N rows" would re-read and
 * re-parse every prior row on every batch - O(n^2) I/O across a
 * multi-batch run through a ~4.2M row file. A byte offset lets
 * fs.createReadStream seek directly, O(1) per resume regardless of
 * progress. sourceFileVersion guards against silently resuming against a
 * stale checkpoint after the operator downloads a newer AFNIC file.
 *
 * headerColumns: the literal header row discovered on the first (byte
 * offset 0) read of this file, via csv-parse's own auto-detection - never
 * hardcoded guessed French column names. A resumed read starts mid-file,
 * past the header row, so it has no header to auto-detect from; it reuses
 * this persisted array instead.
 */

import { Schema, type Connection, type Model } from 'mongoose';

export interface ProspectIngestionCheckpointFields {
  checkpointId: string;
  sourceFilePath: string;
  sourceFileVersion: string;
  nextByteOffset: number;
  rowsProcessed: number;
  headerColumns?: string[];
  updatedAt: Date;
}

export type ProspectIngestionCheckpointDocument = ProspectIngestionCheckpointFields;

const checkpointSchema = new Schema<ProspectIngestionCheckpointDocument>(
  {
    checkpointId: { type: String, required: true, unique: true },
    sourceFilePath: { type: String, required: true },
    sourceFileVersion: { type: String, required: true },
    nextByteOffset: { type: Number, required: true },
    rowsProcessed: { type: Number, required: true },
    headerColumns: { type: [String] },
    updatedAt: { type: Date, required: true },
  },
  { collection: 'prospect_ingestion_checkpoints' },
);

export function createProspectIngestionCheckpointModel(
  connection: Connection,
): Model<ProspectIngestionCheckpointDocument> {
  return (
    connection.models['ProspectIngestionCheckpoint'] ??
    connection.model<ProspectIngestionCheckpointDocument>(
      'ProspectIngestionCheckpoint',
      checkpointSchema,
    )
  );
}
