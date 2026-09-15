/**
 * Read/write helpers around the `outreach_previews` collection, milestone 9c
 * plan 009. Callers never issue their own operations against it, for the reason
 * `prescans.ts` gives about its own: the two retention windows and the
 * insert-then-transition-once rule live here, and a caller writing directly
 * would have to reimplement both.
 *
 * Tokens are looked up by hash. The public link is stored only while a
 * preview is live (issue #288) and revoke unsets it, so a revoked record
 * never yields a working URL.
 */

import { randomUUID } from 'node:crypto';
import type { Connection } from 'mongoose';
import { normalizeDomainForHash } from '@odysseus/core';
import { isSuppressed } from './suppression.js';
import {
  createOutreachPreviewModel,
  type OutreachPreviewDocument,
  type OutreachPreviewSourceKind,
} from './schemas/outreach-preview.schema.js';

/** The lifetime promised to the recipient: the link stops working after this. */
const PREVIEW_PUBLIC_LIFETIME_DAYS = 30;
/** Operational retention for the private record, per
 *  docs/rules/prospect-qualification.md section 7. Longer than the public lifetime on
 *  purpose: handling an objection about a preview needs to know it existed
 *  after it stopped being served. */
const PREVIEW_RETENTION_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RecordOutreachPreviewInput {
  prospectId: string;
  tokenHash: string;
  objectKey: string;
  previewUrl: string;
  domain: string;
  language: 'fr' | 'en';
  previewContentVersion: string;
  publishedAt: Date;
  sourceKind: OutreachPreviewSourceKind;
  auditId: string;
}

export interface RecordedOutreachPreview {
  previewId: string;
  publicExpiresAt: Date;
  expiresAt: Date;
}

/** The two ways a record can end. `refused-suppressed` means the domain was
 *  suppressed by the time the row landed: the row this call created is already
 *  revoked again, and the caller must take the object it uploaded back down. */
export type OutreachPreviewRecordOutcome =
  | ({ outcome: 'recorded' } & RecordedOutreachPreview)
  | { outcome: 'refused-suppressed'; previewId: string };

export async function recordOutreachPreview(
  connection: Connection,
  input: RecordOutreachPreviewInput,
): Promise<OutreachPreviewRecordOutcome> {
  const PreviewModel = createOutreachPreviewModel(connection);
  await PreviewModel.init();

  const publicExpiresAt = new Date(
    input.publishedAt.getTime() + PREVIEW_PUBLIC_LIFETIME_DAYS * DAY_MS,
  );
  const expiresAt = new Date(input.publishedAt.getTime() + PREVIEW_RETENTION_DAYS * DAY_MS);
  const previewId = randomUUID();

  if (input.sourceKind !== 'full-audit') {
    throw new Error('outreach preview: only full-audit previews are supported');
  }

  await PreviewModel.create({
    previewId,
    prospectId: input.prospectId,
    tokenHash: input.tokenHash,
    objectKey: input.objectKey,
    previewUrl: input.previewUrl,
    domain: input.domain,
    language: input.language,
    previewContentVersion: input.previewContentVersion,
    sourceKind: input.sourceKind,
    auditId: input.auditId,
    publishedAt: input.publishedAt,
    publicExpiresAt,
    expiresAt,
    status: 'live',
    createdAt: new Date(),
  });

  // The publish path checks suppression before it uploads anything, but a
  // check that early cannot cover a record that lands after an objection's
  // suppression write. Re-checking here, after the insert, is the half of the
  // race this side of the boundary can close: a preview recorded once the
  // domain is suppressed is revoked in the same breath and reported as
  // refused. Insert-then-recheck is deliberate - conditioning the insert on
  // another collection would need a transaction - and is airtight only
  // combined with the objection path writing suppression before its sweep,
  // which catches everything recorded before the write.
  if (await isSuppressed(connection, input.domain)) {
    await revokeOutreachPreview(connection, previewId, 'domain-suppressed');
    return { outcome: 'refused-suppressed', previewId };
  }

  return { outcome: 'recorded', previewId, publicExpiresAt, expiresAt };
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

async function getOutreachPreview(
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
    {
      $set: { status: 'revoked', revokedAt: new Date(), revokedReason: reason },
      $unset: { previewUrl: 1 },
    },
    { returnDocument: 'after' },
  ).lean<OutreachPreviewDocument>();

  if (updated !== null) return { changed: true, preview: updated };
  return { changed: false, preview: await getOutreachPreview(connection, previewId) };
}

export interface ListOutreachPreviewsOptions {
  domain?: string;
  prospectId?: string;
  status?: 'live' | 'revoked';
  limit?: number;
}

export async function listOutreachPreviews(
  connection: Connection,
  options: ListOutreachPreviewsOptions = {},
): Promise<OutreachPreviewDocument[]> {
  const filter: Record<string, unknown> = {};
  if (options.domain !== undefined) filter['domain'] = options.domain;
  if (options.prospectId !== undefined) filter['prospectId'] = options.prospectId;
  if (options.status !== undefined) filter['status'] = options.status;

  const query = createOutreachPreviewModel(connection).find(filter).sort({ publishedAt: -1 });
  if (options.limit !== undefined) query.limit(options.limit);
  return query.lean<OutreachPreviewDocument[]>();
}

/** Every preview for a domain that is still live. This is what an objection
 *  acts on: suppression stops future contact, and this stops the link that is
 *  already in someone's inbox. The domain is normalized through the same
 *  core function the suppression collection uses on both of its paths (see
 *  ../suppression.ts), so the two halves of one `prospect object` run can
 *  never disagree about the spelling of the host: an objection arriving as
 *  `https://www.hotel-a.fr/` must both suppress and revoke against the bare
 *  registrable domain a prescan records. */
export async function listLivePreviewsForDomain(
  connection: Connection,
  domain: string,
): Promise<OutreachPreviewDocument[]> {
  return createOutreachPreviewModel(connection)
    .find({ domain: normalizeDomainForHash(domain), status: 'live' })
    .lean<OutreachPreviewDocument[]>();
}

/** The prospect's current live full-audit preview, if one exists and
 *  has not passed its public expiry. This is the readiness fact the audit
 *  page and the first-draft gate both read: a revoked or expired preview
 *  is absent here, which is exactly the fail-closed answer. */
