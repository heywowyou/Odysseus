/**
 * Mongoose schema for the `outreach_previews` collection, milestone 9c plan
 * 009. One document per published preview: what was published, for which
 * prospect and audit, when it stops being reachable, and whether it was
 * withdrawn.
 *
 * **The token is looked up by hash; the link is kept only while live.** Lookups
 * and the object key use the token's SHA-256. Issue #288: the operator needs
 * the published link again after leaving the page, so `previewUrl` holds it
 * while the row is live and revoke unsets it. The Touch 1 draft already stored
 * the same URL, so this adds no new exposure, and a revoked row still cannot
 * produce a working URL.
 *
 * **Two expiries, deliberately.** `publicExpiresAt` at 30 days is when the
 * document stops being served - the lifetime the recipient was promised.
 * `expiresAt` at 90 days is the operational retention this milestone applies to
 * everything (`docs/rules/prospect-qualification.md` section 7), enforced by the same
 * precomputed-`expiresAt` TTL pattern the sibling 9c collections use rather
 * than a raw TTL on `createdAt`. The private record therefore outlives the
 * public document by design: revocation and objection handling need to know a
 * preview existed after it stopped being reachable.
 *
 * **Inserted, then transitioned once.** A publish inserts; a revoke flips
 * `status` and stamps `revokedAt`. That is the only mutation, and it is
 * idempotent - see `revokeOutreachPreview`. Republishing is a new token, a new
 * object and a new document, never an edit of this one, which is what keeps
 * "which URL was live when" answerable.
 */

import { Schema, type Connection, type Model } from 'mongoose';

export type OutreachPreviewStatus = 'live' | 'revoked';

/** Full-scan public previews. Historical v1/v2 rows keep their stored shape;
 * Plan 069 adds optional semantic-lineage fields used only by v3 rows. */
export type OutreachPreviewSourceKind = 'full-audit';

export interface OutreachPreviewDocumentFields {
  previewId: string;
  prospectId: string;
  /** SHA-256 of the raw token, lowercase hex. Unique: two previews cannot
   *  share a token, and a collision would mean one hotel's link serving
   *  another's evidence. */
  tokenHash: string;
  objectKey: string;
  /** The public link, present only while `status` is 'live'. Rows published
   *  before issue #288 never carry it. */
  previewUrl?: string;
  domain: string;
  language: 'fr' | 'en';
  previewContentVersion: string;
  sourceKind?: OutreachPreviewSourceKind;
  /** full-audit rows only: the one audit the document aggregates. A rerun
   *  or a later audit of the same domain can never substitute for it. */
  auditId?: string;
  /** Plan 069 v3: private semantic lineage. Never rendered by the public site. */
  sourceAnalysisId?: string;
  sourceFindingsDigest?: string;
  publishedFacts?: {
    distinctFindingCount: number;
    affectedPageCount: number;
    severityTotals: {
      critical: number;
      serious: number;
      moderate: number;
      minor: number;
    };
    priorityCardCategories: Array<
      'accessibility' | 'seo' | 'geo' | 'performance' | 'rendering' | 'privacy'
    >;
  };
  publishedAt: Date;
  publicExpiresAt: Date;
  expiresAt: Date;
  status: OutreachPreviewStatus;
  revokedAt?: Date;
  revokedReason?: string;
  createdAt: Date;
}

export type OutreachPreviewDocument = OutreachPreviewDocumentFields;

const outreachPreviewSchema = new Schema<OutreachPreviewDocument>(
  {
    previewId: { type: String, required: true, unique: true },
    prospectId: { type: String, required: true },
    tokenHash: { type: String, required: true, unique: true },
    objectKey: { type: String, required: true },
    previewUrl: { type: String },
    domain: { type: String, required: true },
    language: { type: String, required: true, enum: ['fr', 'en'] },
    previewContentVersion: { type: String, required: true },
    sourceKind: { type: String, required: true, enum: ['full-audit'] },
    auditId: { type: String },
    sourceAnalysisId: { type: String },
    sourceFindingsDigest: { type: String },
    publishedFacts: {
      type: new Schema(
        {
          distinctFindingCount: { type: Number, required: true },
          affectedPageCount: { type: Number, required: true },
          severityTotals: {
            type: new Schema(
              {
                critical: { type: Number, required: true },
                serious: { type: Number, required: true },
                moderate: { type: Number, required: true },
                minor: { type: Number, required: true },
              },
              { _id: false },
            ),
            required: true,
          },
          priorityCardCategories: {
            type: [String],
            required: true,
            enum: ['accessibility', 'seo', 'geo', 'performance', 'rendering', 'privacy'],
          },
        },
        { _id: false },
      ),
    },
    publishedAt: { type: Date, required: true },
    publicExpiresAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    status: { type: String, required: true, enum: ['live', 'revoked'] },
    revokedAt: { type: Date },
    revokedReason: { type: String },
    createdAt: { type: Date, required: true },
  },
  { collection: 'outreach_previews', minimize: false },
);

outreachPreviewSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Revoking every live preview for a domain is what an objection triggers, and
// it must be one indexed query rather than a scan of the collection.
outreachPreviewSchema.index({ domain: 1, status: 1 });
outreachPreviewSchema.index({ prospectId: 1, publishedAt: -1 });

export function createOutreachPreviewModel(connection: Connection): Model<OutreachPreviewDocument> {
  return (
    connection.models['OutreachPreview'] ??
    connection.model<OutreachPreviewDocument>('OutreachPreview', outreachPreviewSchema)
  );
}
