/**
 * Consumes opt-out requests the public site dropped in the bucket.
 *
 * Each request is applied fully before its object is deleted, so a crash or a
 * provider error leaves it in place for the next pass. Every step is
 * idempotent (suppression upserts, revocation and thread closing are no-ops a
 * second time), which is what makes that retry safe.
 *
 * Whatever address the visitor submits is blacklisted, token or not: an
 * opt-out never needs proof of identity. What the token decides is the
 * reach (trade-off 89, amended for issue #341). The whole email domain is
 * suppressed only when the request came through a link we sent to an
 * address on that same domain and the domain is not a free-mail provider.
 * Otherwise only the address is: an anonymous form post must not let anyone
 * block a business they do not speak for, and one objection from a Gmail
 * user must not silence every prospect whose contact uses Gmail. A matching
 * prospect is still opted out, its previews revoked and its threads closed,
 * without widening suppression beyond the reach decided above.
 */

import {
  addSuppressionEntry,
  AutomaticStatusTransitionError,
  closeOutreachThreadsForDomain,
  findProspectsByEmail,
  listLivePreviewsForDomain,
  recordProspectOutcome,
  revokeOutreachPreview,
} from '@odysseus/store';
import { isFreeMailDomain, emailDomain, primaryWebsite } from '@odysseus/core';
import type { Connection } from 'mongoose';
import { logger } from '../logger.js';
import { createConfiguredMailboxDraftAdapter } from './configured-mailbox-draft-adapter.js';
import { withdrawOutreachForProspect } from './withdraw-prospect-outreach.js';
import {
  deriveOptOutLinkKey,
  OPT_OUT_REQUEST_PREFIX,
  type OptOutBucket,
} from './opt-out-bucket.js';
import type { PreviewPublisher } from './preview-publisher.js';
import { hashPreviewToken, isValidPreviewToken } from './preview-token.js';

const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u;
const OPT_OUT_REASON = 'opt-out form on the public site';
const ACTOR = 'public-opt-out';

export function isPlausibleOptOutAddress(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 254 && EMAIL_PATTERN.test(value.trim());
}

export interface ProcessOptOutRequestsOptions {
  connection: Connection;
  bucket: OptOutBucket;
  publisher: PreviewPublisher;
}

export interface ProcessOptOutRequestsResult {
  applied: number;
  discarded: number;
  failed: number;
}

/** The address our emailed link was issued to, when the request carries a
 *  token whose link object still exists. */
async function linkedAddressFor(bucket: OptOutBucket, token: unknown): Promise<string | undefined> {
  if (typeof token !== 'string' || !isValidPreviewToken(token)) return undefined;
  const link = (await bucket.getJson(deriveOptOutLinkKey(hashPreviewToken(token)))) as {
    address?: unknown;
  } | null;
  return typeof link?.address === 'string' ? link.address : undefined;
}

async function applyOptOut(
  connection: Connection,
  publisher: PreviewPublisher,
  rawAddress: string,
  linkedAddress: string | undefined,
): Promise<void> {
  const address = rawAddress.trim().toLowerCase();
  const domain = emailDomain(address);
  const domainWide =
    domain !== undefined &&
    linkedAddress !== undefined &&
    emailDomain(linkedAddress) === domain &&
    !isFreeMailDomain(domain);
  await addSuppressionEntry(connection, {
    domain: domain ?? '',
    address,
    addressOnly: !domainWide,
    reasonCode: 'objection',
    reason: OPT_OUT_REASON,
  });

  for (const prospect of await findProspectsByEmail(connection, address)) {
    try {
      await recordProspectOutcome(connection, prospect.prospectId, 'opt-out', ACTOR, {
        suppression: 'already-applied',
      });
    } catch (error) {
      // A won or lost prospect keeps its result; the suppression above
      // already stops any further contact.
      if (!(error instanceof AutomaticStatusTransitionError)) throw error;
    }
    await withdrawOutreachForProspect(connection, prospect.prospectId, 'opted-out', {
      publisher: () => publisher,
      mailbox: createConfiguredMailboxDraftAdapter(),
    });
    const website = primaryWebsite(prospect.websites);
    if (website === undefined) continue;
    for (const preview of await listLivePreviewsForDomain(connection, website.registrableDomain)) {
      // Object first, record second, as in every other revocation.
      await publisher.delete(preview.objectKey);
      await revokeOutreachPreview(connection, preview.previewId, OPT_OUT_REASON);
    }
    await closeOutreachThreadsForDomain(connection, website.registrableDomain, OPT_OUT_REASON);
  }
}

export async function processOptOutRequests(
  options: ProcessOptOutRequestsOptions,
): Promise<ProcessOptOutRequestsResult> {
  const { connection, bucket, publisher } = options;
  const result: ProcessOptOutRequestsResult = { applied: 0, discarded: 0, failed: 0 };

  for (const key of await bucket.list(OPT_OUT_REQUEST_PREFIX)) {
    try {
      const request = (await bucket.getJson(key)) as Record<string, unknown> | null;
      if (request === null) continue;
      if (!isPlausibleOptOutAddress(request['address'])) {
        await bucket.delete(key);
        result.discarded += 1;
        continue;
      }
      const token = request['token'];
      await applyOptOut(
        connection,
        publisher,
        request['address'],
        await linkedAddressFor(bucket, token),
      );
      if (typeof token === 'string' && isValidPreviewToken(token)) {
        await bucket.delete(deriveOptOutLinkKey(hashPreviewToken(token)));
      }
      await bucket.delete(key);
      result.applied += 1;
    } catch (error) {
      // The key only, never the address.
      logger.error({ err: error, key }, 'opt-out request could not be applied; will retry');
      result.failed += 1;
    }
  }
  return result;
}
