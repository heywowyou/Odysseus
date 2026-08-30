/**
 * Mongoose schema for the `prospects` collection, milestone 9a. Insert-only,
 * not upserted - same rationale as analysis.schema.ts's insert-only
 * posture (persist-analysis.ts): a domain reappearing in a later AFNIC
 * ingestion pass is a legitimately distinct qualification event with its
 * own evaluatedAt, not a correction of an earlier one.
 *
 * Subject to the 90 day retention policy at docs/rules/prospect-qualification.md
 * section 7 - see the TTL index below. Contrast schemas/suppression.schema.ts,
 * which is architecturally exempt from that policy.
 */

import { Schema, type Connection, type Model } from 'mongoose';
import type { EffectifBand, Provenanced } from '@odysseus/core';

export type ProspectQualificationReason =
  | 'no-siren-extracted'
  | 'siren-not-in-qualifying-sirene-set'
  | 'domain-suppressed'
  | 'no-qualifying-contact-address';

export interface ProspectContactAddress {
  value: string;
  localPart: string;
  domain: string;
}

export interface ProspectDataOrigin {
  domainSource: 'afnic-fichier-a';
  domainListVersion: string;
  companyDataSource: 'sirene-stock';
  companyDataVersion: string;
  nafAllowlistVersion: string;
  contactAddressSource?: 'lcen-mentions-legales-fetch' | 'homepage-fetch';
}

export interface ProspectDocumentFields {
  prospectId: string;
  domain: string;
  siteUrl: string;
  siren: Provenanced<string>;
  denomination: Provenanced<string>;
  naf: Provenanced<string>;
  trancheEffectifs: Provenanced<EffectifBand | null>;
  etatAdministratif: Provenanced<string>;
  qualification: {
    qualified: boolean;
    reasons: ProspectQualificationReason[];
    evaluatedAt: Date;
  };
  scanJobId: string;
  /** Present only when it genuinely qualifies (own-domain, role local
   *  part, not a free-mail domain) - a rejected personal/free-mail
   *  address is used transiently for the check and discarded, never
   *  persisted. */
  contactAddress?: ProspectContactAddress;
  dataOrigin: ProspectDataOrigin;
  // Reserved, not populated by 9a - see docs/rules/llm-layer-rules.md section 10
  // / milestones 9b, 9c.
  brokennessScore?: number | null;
  outreachState?: string;
  createdAt: Date;
  /** createdAt + 90 days, precomputed at insert rather than a plain
   *  expireAfterSeconds on createdAt: self-documenting on a raw document,
   *  and a future retention-window change only affects new inserts, not
   *  a collMod against a live index. */
  expiresAt: Date;
}

export type ProspectDocument = ProspectDocumentFields;

const provenancedSchema = new Schema(
  {
    value: { type: Schema.Types.Mixed, required: true },
    source: { type: String, required: true },
    retrievedAt: { type: Date, required: true },
  },
  { _id: false },
);

const contactAddressSchema = new Schema(
  {
    value: { type: String, required: true },
    localPart: { type: String, required: true },
    domain: { type: String, required: true },
  },
  { _id: false },
);

const dataOriginSchema = new Schema(
  {
    domainSource: { type: String, required: true, enum: ['afnic-fichier-a'] },
    domainListVersion: { type: String, required: true },
    companyDataSource: { type: String, required: true, enum: ['sirene-stock'] },
    companyDataVersion: { type: String, required: true },
    nafAllowlistVersion: { type: String, required: true },
    contactAddressSource: { type: String, enum: ['lcen-mentions-legales-fetch', 'homepage-fetch'] },
  },
  { _id: false },
);

const qualificationSchema = new Schema(
  {
    qualified: { type: Boolean, required: true },
    reasons: {
      type: [String],
      required: true,
      enum: [
        'no-siren-extracted',
        'siren-not-in-qualifying-sirene-set',
        'domain-suppressed',
        'no-qualifying-contact-address',
      ],
    },
    evaluatedAt: { type: Date, required: true },
  },
  { _id: false },
);

const prospectSchema = new Schema<ProspectDocument>(
  {
    prospectId: { type: String, required: true, unique: true },
    domain: { type: String, required: true },
    siteUrl: { type: String, required: true },
    siren: { type: provenancedSchema, required: true },
    denomination: { type: provenancedSchema, required: true },
    naf: { type: provenancedSchema, required: true },
    trancheEffectifs: { type: provenancedSchema, required: true },
    etatAdministratif: { type: provenancedSchema, required: true },
    qualification: { type: qualificationSchema, required: true },
    scanJobId: { type: String, required: true },
    contactAddress: { type: contactAddressSchema },
    dataOrigin: { type: dataOriginSchema, required: true },
    brokennessScore: { type: Number },
    outreachState: { type: String },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'prospects' },
);

prospectSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
prospectSchema.index({ domain: 1 });
prospectSchema.index({ 'qualification.qualified': 1, createdAt: -1 });

export function createProspectModel(connection: Connection): Model<ProspectDocument> {
  return (
    connection.models['Prospect'] ?? connection.model<ProspectDocument>('Prospect', prospectSchema)
  );
}
