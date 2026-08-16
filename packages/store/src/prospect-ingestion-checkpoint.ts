import type { Connection } from 'mongoose';
import {
  createProspectIngestionCheckpointModel,
  type ProspectIngestionCheckpointFields,
} from './schemas/prospect-ingestion-checkpoint.schema.js';

export async function getCheckpoint(
  connection: Connection,
  checkpointId: string,
): Promise<ProspectIngestionCheckpointFields | null> {
  const Model = createProspectIngestionCheckpointModel(connection);
  return Model.findOne({ checkpointId }).lean<ProspectIngestionCheckpointFields>();
}

export type CheckpointPatch = Partial<
  Pick<
    ProspectIngestionCheckpointFields,
    'sourceFilePath' | 'sourceFileVersion' | 'nextByteOffset' | 'rowsProcessed' | 'headerColumns'
  >
>;

export async function upsertCheckpoint(
  connection: Connection,
  checkpointId: string,
  patch: CheckpointPatch,
): Promise<void> {
  const Model = createProspectIngestionCheckpointModel(connection);
  await Model.findOneAndUpdate(
    { checkpointId },
    { $set: { checkpointId, ...patch, updatedAt: new Date() } },
    { upsert: true },
  );
}
