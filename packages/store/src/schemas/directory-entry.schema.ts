import { Schema, type Connection, type Model } from 'mongoose';
import type { DirectoryEntry } from '@odysseus/core';

export type DirectoryEntryDocument = DirectoryEntry;

const sourceRefSchema = new Schema(
  { source: { type: String, required: true }, sourceId: { type: String, required: true } },
  { _id: false },
);
const directoryEntrySchema = new Schema<DirectoryEntryDocument>(
  {
    directoryId: { type: String, required: true, unique: true },
    sector: { type: String, required: true },
    name: { type: String, required: true },
    address: { type: String },
    postcode: { type: String },
    commune: { type: String },
    department: { type: String },
    phone: { type: String },
    websiteUrl: { type: String },
    registrableDomain: { type: String },
    websiteKind: { type: String, required: true, enum: ['own', 'vendor-hosted', 'unknown'] },
    stars: { type: Number, min: 1, max: 5 },
    rooms: { type: Number, min: 0 },
    capacity: { type: Number, min: 0 },
    groupStatus: {
      type: String,
      enum: ['independent', 'group-member', 'vendor-hosted', 'unknown'],
    },
    groupDomain: { type: String },
    sourceRefs: { type: [sourceRefSchema], required: true },
    prospectId: { type: String },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { collection: 'directory_entries', minimize: false },
);
directoryEntrySchema.index({ stars: 1, groupStatus: 1, websiteKind: 1, department: 1, name: 1 });
directoryEntrySchema.index({ department: 1, commune: 1, rooms: 1, name: 1 });
directoryEntrySchema.index({ registrableDomain: 1 });
directoryEntrySchema.index({ prospectId: 1 });
// The directory page's own sort, so an unfiltered or search page walks the
// index in order instead of sorting the whole directory in memory.
directoryEntrySchema.index({ name: 1, directoryId: 1 });

export function createDirectoryEntryModel(connection: Connection): Model<DirectoryEntryDocument> {
  return (
    connection.models['DirectoryEntry'] ??
    connection.model<DirectoryEntryDocument>('DirectoryEntry', directoryEntrySchema)
  );
}
