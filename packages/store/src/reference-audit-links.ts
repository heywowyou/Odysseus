import { randomUUID } from 'node:crypto';
import type { Connection } from 'mongoose';
import {
  createReferenceAuditLinkModel,
  type ReferenceAuditLinkDocument,
} from './schemas/reference-audit-link.schema.js';
import { createOutreachDraftModel } from './schemas/outreach-draft.schema.js';
import { appendProspectEvent } from './prospect-hub.js';
import { isSuppressed } from './suppression.js';

export const REFERENCE_AUDIT_ATTRIBUTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface CreateReferenceAuditLinkInput {
  tokenHash: string;
  prospectId: string;
  threadId: string;
  draftId?: string;
  registrableDomain: string;
  roleAddress: string;
  referenceVersion: string;
  createdAt: Date;
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
}

export async function createReferenceAuditLink(
  connection: Connection,
  input: CreateReferenceAuditLinkInput,
): Promise<ReferenceAuditLinkDocument> {
  if (!/^[0-9a-f]{64}$/u.test(input.tokenHash)) {
    throw new Error('reference audit token hash is malformed');
  }
  const document: ReferenceAuditLinkDocument = {
    linkId: randomUUID(),
    tokenHash: input.tokenHash,
    prospectId: input.prospectId,
    threadId: input.threadId,
    ...(input.draftId === undefined ? {} : { draftId: input.draftId }),
    registrableDomain: input.registrableDomain,
    roleAddress: input.roleAddress,
    referenceVersion: input.referenceVersion,
    createdAt: input.createdAt,
    expiresAt: new Date(input.createdAt.getTime() + REFERENCE_AUDIT_ATTRIBUTION_DAYS * DAY_MS),
    requestCount: 0,
  };
  try {
    await createReferenceAuditLinkModel(connection).create(document);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new Error('reference audit token already exists', { cause: error });
    }
    throw error;
  }
  return document;
}

export async function attachReferenceAuditDraft(
  connection: Connection,
  tokenHash: string,
  draftId: string,
): Promise<void> {
  await createReferenceAuditLinkModel(connection).updateOne({ tokenHash }, { $set: { draftId } });
}

/** Remove a mapping created speculatively for a draft that never reached the
 * provider. The public receipt path is optional, so a failed draft must not
 * leave a private prospect mapping behind until the TTL merely happens to
 * expire. */
export async function deleteReferenceAuditLink(
  connection: Connection,
  tokenHash: string,
): Promise<void> {
  await createReferenceAuditLinkModel(connection).deleteOne({ tokenHash }).exec();
}

export interface RecordReferenceAuditRequestResult {
  accepted: boolean;
  first: boolean;
  requestCount?: number;
  reason?: 'unknown-or-expired' | 'suppressed';
}

/** Consume one bounded public receipt. A missing/expired mapping is a normal
 * outcome: the public redirect remains useful even after private attribution
 * has aged out. */
export async function recordReferenceAuditRequest(
  connection: Connection,
  input: { tokenHash: string; referenceVersion: string; requestedAt: Date },
): Promise<RecordReferenceAuditRequestResult> {
  const Links = createReferenceAuditLinkModel(connection);
  const link = await Links.findOne({
    tokenHash: input.tokenHash,
    expiresAt: { $gt: input.requestedAt },
  }).lean<ReferenceAuditLinkDocument>();
  if (link === null) {
    return { accepted: false, first: false, reason: 'unknown-or-expired' };
  }
  if (await isSuppressed(connection, link.registrableDomain, link.roleAddress)) {
    return { accepted: false, first: false, reason: 'suppressed' };
  }

  const firstUpdate = await Links.updateOne(
    { tokenHash: link.tokenHash, expiresAt: { $gt: input.requestedAt }, requestCount: 0 },
    {
      $set: { firstRequestedAt: input.requestedAt, lastRequestedAt: input.requestedAt },
      $inc: { requestCount: 1 },
    },
  );
  const first = firstUpdate.modifiedCount === 1;
  let requestCount: number;
  if (first) {
    requestCount = 1;
  } else {
    const repeated = await Links.findOneAndUpdate(
      {
        tokenHash: link.tokenHash,
        expiresAt: { $gt: input.requestedAt },
        requestCount: { $gt: 0 },
      },
      { $set: { lastRequestedAt: input.requestedAt }, $inc: { requestCount: 1 } },
      { new: true },
    ).lean<ReferenceAuditLinkDocument>();
    if (repeated === null) return { accepted: false, first: false, reason: 'unknown-or-expired' };
    requestCount = repeated.requestCount;
  }

  if (link.draftId !== undefined) {
    await createOutreachDraftModel(connection).updateOne(
      { draftId: link.draftId },
      {
        ...(first
          ? {
              $set: {
                referenceAuditFirstRequestedAt: input.requestedAt,
                referenceAuditLastRequestedAt: input.requestedAt,
                referenceAuditRequestCount: requestCount,
              },
            }
          : {
              $set: { referenceAuditLastRequestedAt: input.requestedAt },
              $inc: { referenceAuditRequestCount: 1 },
            }),
      },
    );
  }

  if (first) {
    await appendProspectEvent(connection, {
      eventId: randomUUID(),
      prospectId: link.prospectId,
      type: 'reference-audit-requested',
      payload: { referenceVersion: input.referenceVersion, requestCount },
      actor: 'automation',
      at: input.requestedAt,
    });
  }
  return { accepted: true, first, requestCount };
}
