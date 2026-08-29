/**
 * Read/write helpers around the `outreach_previews` collection, milestone 9c
 * plan 009. Callers never issue their own operations against it, for the reason
 * `prescans.ts` gives about its own: the two retention windows and the
 * insert-then-transition-once rule live here, and a caller writing directly
 * would have to reimplement both.
 *
 * This module never sees a raw token. It is given a hash, which is the shape
 * that makes "the database cannot produce a working URL" a property of the
 * boundary rather than a discipline anyone has to remember.
 */

import { randomUUID } from 'node:crypto';
import type { Connection } from 'mongoose';
import {
  createOutreachPreviewModel,
  type OutreachPreviewDocument,
} from './schemas/outreach-preview.schema.js';

/** The lifetime promised to the recipient: the link stops working after this. */
export const PREVIEW_PUBLIC_LIFETIME_DAYS = 30;
/** Operational retention for the private record, per
 *  docs/prospect-qualification.md section 7. Longer than the public lifetime on
 *  purpose: handling an objection about a preview needs to know it existed
 *  after it stopped being served. */
export const PREVIEW_RETENTION_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RecordOutreachPreviewInput {
  tokenHash: string;
  objectKey: string;
  candidateId: string;
  prescanId: string;
  domain: string;
  language: 'fr' | 'en';
  prescanVersion: string;
  evidenceVersion: string;
  previewContentVersion: string;
  publishedAt: Date;
}

export interface RecordedOutreachPreview {
  previewId: string;
  publicExpiresAt: Date;
  expiresAt: Date;
}

export async function recordOutreachPreview(
  connection: Connection,
  input: RecordOutreachPreviewInput,
): Promise<RecordedOutreachPreview> {
  const PreviewModel = createOutreachPreviewModel(connection);
  await PreviewModel.init();

  const publicExpiresAt = new Date(
    input.publishedAt.getTime() + PREVIEW_PUBLIC_LIFETIME_DAYS * DAY_MS,
  );
  const expiresAt = new Date(input.publishedAt.getTime() + PREVIEW_RETENTION_DAYS * DAY_MS);
  const previewId = randomUUID();

  await PreviewModel.create({
    previewId,
    tokenHash: input.tokenHash,
    objectKey: input.objectKey,
    candidateId: input.candidateId,
    prescanId: input.prescanId,
    domain: input.domain,
    language: input.language,
    prescanVersion: input.prescanVersion,
    evidenceVersion: input.evidenceVersion,
    previewContentVersion: input.previewContentVersion,
    publishedAt: input.publishedAt,
    publicExpiresAt,
    expiresAt,
    status: 'live',
    createdAt: new Date(),
  });

  return { previewId, publicExpiresAt, expiresAt };
}

/** For private operator tooling only. The public site never reaches Mongo, and
 *  resolving a token there is exactly the import the package boundary forbids. */
export async function findOutreachPreviewByTokenHash(
  connection: Connection,
  tokenHash: string,
): Promise<OutreachPreviewDocument | null> {
  return createOutreachPreviewModel(connection)
    .findOne({ tokenHash })
    .lean<OutreachPreviewDocument>();
}

export async function getOutreachPreview(
  connection: Connection,
  previewId: string,
): Promise<OutreachPreviewDocument | null> {
  return createOutreachPreviewModel(connection)
    .findOne({ previewId })
    .lean<OutreachPreviewDocument>();
}

export interface RevokeOutreachPreviewResult {
  /** False when the preview was already revoked. Not an error: an objection
   *  handled twice, or a revoke retried after a partial failure, must reach the
   *  same end state without the second attempt looking like a problem. */
  changed: boolean;
  preview: OutreachPreviewDocument | null;
}

export async function revokeOutreachPreview(
  connection: Connection,
  previewId: string,
  reason: string,
): Promise<RevokeOutreachPreviewResult> {
  const PreviewModel = createOutreachPreviewModel(connection);
  const updated = await PreviewModel.findOneAndUpdate(
    { previewId, status: 'live' },
    { $set: { status: 'revoked', revokedAt: new Date(), revokedReason: reason } },
    { returnDocument: 'after' },
  ).lean<OutreachPreviewDocument>();

  if (updated !== null) return { changed: true, preview: updated };
  return { changed: false, preview: await getOutreachPreview(connection, previewId) };
}

export interface ListOutreachPreviewsOptions {
  domain?: string;
  candidateId?: string;
  status?: 'live' | 'revoked';
  limit?: number;
}

export async function listOutreachPreviews(
  connection: Connection,
  options: ListOutreachPreviewsOptions = {},
): Promise<OutreachPreviewDocument[]> {
  const filter: Record<string, unknown> = {};
  if (options.domain !== undefined) filter['domain'] = options.domain;
  if (options.candidateId !== undefined) filter['candidateId'] = options.candidateId;
  if (options.status !== undefined) filter['status'] = options.status;

  const query = createOutreachPreviewModel(connection).find(filter).sort({ publishedAt: -1 });
  if (options.limit !== undefined) query.limit(options.limit);
  return query.lean<OutreachPreviewDocument[]>();
}

/** Every preview for a domain that is still live. This is what an objection
 *  acts on: suppression stops future contact, and this stops the link that is
 *  already in someone's inbox. */
export async function listLivePreviewsForDomain(
  connection: Connection,
  domain: string,
): Promise<OutreachPreviewDocument[]> {
  return createOutreachPreviewModel(connection)
    .find({ domain, status: 'live' })
    .lean<OutreachPreviewDocument[]>();
}
