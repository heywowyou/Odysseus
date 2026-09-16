import { Schema, type Connection, type Model } from 'mongoose';
import type { Prospect } from '@odysseus/core';

export type ProspectHubDocumentFields = Prospect;
export type ProspectHubDocument = ProspectHubDocumentFields;

const websiteSchema = new Schema(
  {
    url: { type: String, required: true },
    registrableDomain: { type: String, required: true },
    kind: { type: String, required: true, enum: ['own', 'vendor-hosted', 'unknown'] },
    primary: { type: Boolean, required: true },
  },
  { _id: false },
);
const emailSchema = new Schema(
  {
    address: { type: String, required: true },
    origin: {
      type: String,
      required: true,
      enum: ['atout-france', 'site-discovery', 'sirene', 'operator'],
    },
    attestation: { type: String },
  },
  { _id: false },
);
const stakeholderSchema = new Schema(
  {
    name: { type: String, required: true },
    position: { type: String },
  },
  { _id: false },
);
const hotelSchema = new Schema(
  {
    stars: { type: Number, min: 1, max: 5 },
    rooms: { type: Number, min: 0 },
    capacity: { type: Number, min: 0 },
    groupStatus: {
      type: String,
      enum: ['independent', 'group-member', 'vendor-hosted', 'unknown'],
    },
    groupDomain: { type: String },
  },
  { _id: false },
);
const directoryRefSchema = new Schema(
  { source: { type: String, required: true }, sourceId: { type: String, required: true } },
  { _id: false },
);

const prospectSchema = new Schema<ProspectHubDocument>(
  {
    prospectId: { type: String, required: true, unique: true },
    sector: { type: String, required: true },
    name: { type: String, required: true },
    websites: { type: [websiteSchema], required: true },
    address: { type: String },
    postcode: { type: String },
    commune: { type: String },
    department: { type: String },
    phone: { type: String },
    emails: { type: [emailSchema], required: true },
    // Absent on prospects created before stakeholders existed.
    stakeholders: { type: [stakeholderSchema], default: undefined },
    siren: { type: String },
    siret: { type: String },
    // Issue #289: prospect-level identity (nom commercial, dénomination
    // sociale), independent of any scan. Absent on prospects created
    // before the fields existed - no migration needed for optional keys.
    tradingName: { type: String },
    legalName: { type: String },
    notes: { type: String },
    outreachLanguage: { type: String, enum: ['fr', 'en'] },
    status: {
      type: String,
      required: true,
      enum: [
        'new',
        'audited',
        'contacted',
        'follow-up',
        'replied',
        'call',
        'quoted',
        'won',
        'lost',
        'opted-out',
      ],
    },
    hotel: { type: hotelSchema },
    fieldOrigins: { type: Schema.Types.Mixed, required: true },
    directoryRef: { type: directoryRefSchema },
    // Plan 050: absent on every active prospect, so no migration is needed.
    archivedAt: { type: Date },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    lastActivityAt: { type: Date, required: true },
  },
  { collection: 'prospects', minimize: false },
);

prospectSchema.index({ 'websites.registrableDomain': 1 });
prospectSchema.index({ status: 1, lastActivityAt: -1 });
prospectSchema.index({ sector: 1, 'hotel.stars': 1, 'hotel.groupStatus': 1, 'websites.kind': 1 });
prospectSchema.index({ department: 1, commune: 1, 'hotel.rooms': 1 });

export function createProspectHubModel(connection: Connection): Model<ProspectHubDocument> {
  return (
    connection.models['ProspectHub'] ??
    connection.model<ProspectHubDocument>('ProspectHub', prospectSchema)
  );
}
