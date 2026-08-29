/**
 * Mongoose schema for the `outreach_previews` collection, milestone 9c plan
 * 009. One document per published preview: what was published, for which
 * hotel, from which prescan, when it stops being reachable, and whether it was
 * withdrawn.
 *
 * **The raw token is not here, and there is no field it could go in.** Only its
 * SHA-256 is stored, and the object key is derived from that hash. A preview
 * link is the only access control on one hotel's evidence, so a database that
 * held the token would turn a read of this collection into a set of working
 * public URLs.
 *
 * **Two expiries, deliberately.** `publicExpiresAt` at 30 days is when the
 * document stops being served - the lifetime the recipient was promised.
 * `expiresAt` at 90 days is the operational retention this milestone applies to
 * everything (`docs/prospect-qualification.md` section 7), enforced by the same
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

export interface OutreachPreviewDocumentFields {
  previewId: string;
  /** SHA-256 of the raw token, lowercase hex. Unique: two previews cannot
   *  share a token, and a collision would mean one hotel's link serving
   *  another's evidence. */
  tokenHash: string;
  objectKey: string;
  candidateId: string;
  prescanId: string;
  domain: string;
  language: 'fr' | 'en';
  /** The contract versions the document was built under, so a preview served
   *  today can be told apart from one built before an evidence or preview
   *  schema change, without reopening the object. */
  prescanVersion: string;
  evidenceVersion: string;
  previewContentVersion: string;
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
    tokenHash: { type: String, required: true, unique: true },
    objectKey: { type: String, required: true },
    candidateId: { type: String, required: true },
    prescanId: { type: String, required: true },
    domain: { type: String, required: true },
    language: { type: String, required: true, enum: ['fr', 'en'] },
    prescanVersion: { type: String, required: true },
    evidenceVersion: { type: String, required: true },
    previewContentVersion: { type: String, required: true },
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
outreachPreviewSchema.index({ candidateId: 1, publishedAt: -1 });

export function createOutreachPreviewModel(connection: Connection): Model<OutreachPreviewDocument> {
  return (
    connection.models['OutreachPreview'] ??
    connection.model<OutreachPreviewDocument>('OutreachPreview', outreachPreviewSchema)
  );
}
