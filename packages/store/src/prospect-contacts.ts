/**
 * Operator corrections to a prospect's contact points (issues #270, #271):
 * removing a wrong website or address and choosing which one drives
 * scans and outreach. The server owns the invariants instead of trusting a
 * client-rebuilt array: at most one primary website, a primary promoted
 * when the current one is removed, and the outreach recipient always being
 * `emails[0]`, which every draft path already reads.
 *
 * Nothing re-adds a removed contact: the directory import only creates
 * prospects for entries not yet linked to one, and site discovery / SIRENE
 * enrichment write addresses at creation only. A future refresh path that
 * rewrites an existing prospect must honour removals itself.
 */

import { randomUUID } from 'node:crypto';
import type { Connection } from 'mongoose';
import type { Prospect } from '@odysseus/core';
import {
  hashSuppressionValue,
  normalizeAddressForHash,
  prospectEventSchema,
  emailDomain,
} from '@odysseus/core';
import { createProspectEventModel } from './schemas/prospect-event.schema.js';
import { createProspectHubModel, type ProspectHubDocument } from './schemas/prospect-hub.schema.js';
import { createOutreachDraftModel } from './schemas/outreach-draft.schema.js';
import { addSuppressionEntry } from './suppression.js';

export type ProspectContactRefusal = 'prospect-not-found' | 'contact-not-found';

export type ProspectContactResult<Extra = object> =
  | ({ ok: true; prospect: ProspectHubDocument } & Extra)
  | { ok: false; refusal: ProspectContactRefusal };

function sameUrl(left: string, right: string): boolean {
  return left.trim() === right.trim();
}

function sameAddress(left: string, right: string): boolean {
  return normalizeAddressForHash(left) === normalizeAddressForHash(right);
}

async function load(
  connection: Connection,
  prospectId: string,
): Promise<ProspectHubDocument | null> {
  return createProspectHubModel(connection)
    .findOne({ prospectId })
    .select({ _id: 0, __v: 0 })
    .lean<ProspectHubDocument>();
}

async function save(
  connection: Connection,
  current: ProspectHubDocument,
  patch: Pick<Prospect, 'websites'> | Pick<Prospect, 'emails'>,
  payload: Record<string, unknown>,
  actor: string,
): Promise<ProspectHubDocument> {
  const now = new Date();
  const next: ProspectHubDocument = { ...current, ...patch, updatedAt: now, lastActivityAt: now };
  await createProspectHubModel(connection).updateOne(
    { prospectId: current.prospectId },
    { $set: { ...patch, updatedAt: now, lastActivityAt: now } },
  );
  const value = prospectEventSchema.parse({
    eventId: randomUUID(),
    prospectId: current.prospectId,
    type: 'field-edited',
    payload,
    actor,
    at: now,
  });
  await createProspectEventModel(connection).create(value);
  return next;
}

/** Exactly one primary when any website remains: the requested one, else the
 *  existing primary, else the first. */
function withSinglePrimary(
  websites: readonly Prospect['websites'][number][],
  primaryUrl?: string,
): Prospect['websites'] {
  if (websites.length === 0) return [];
  const requested =
    primaryUrl === undefined ? -1 : websites.findIndex((w) => sameUrl(w.url, primaryUrl));
  const chosen =
    requested >= 0
      ? requested
      : Math.max(
          0,
          websites.findIndex((w) => w.primary),
        );
  return websites.map((website, index) => ({ ...website, primary: index === chosen }));
}

export async function removeProspectWebsite(
  connection: Connection,
  prospectId: string,
  url: string,
  actor = 'operator',
): Promise<ProspectContactResult> {
  const current = await load(connection, prospectId);
  if (current === null) return { ok: false, refusal: 'prospect-not-found' };
  const removed = current.websites.find((website) => sameUrl(website.url, url));
  if (removed === undefined) return { ok: false, refusal: 'contact-not-found' };
  const websites = withSinglePrimary(current.websites.filter((website) => website !== removed));
  const prospect = await save(
    connection,
    current,
    { websites },
    {
      fields: ['websites'],
      action: 'website-removed',
      url: removed.url,
      wasPrimary: removed.primary,
      ...(websites[0] !== undefined
        ? { primaryUrl: websites.find((website) => website.primary)!.url }
        : {}),
    },
    actor,
  );
  return { ok: true, prospect };
}

export async function setPrimaryProspectWebsite(
  connection: Connection,
  prospectId: string,
  url: string,
  actor = 'operator',
): Promise<ProspectContactResult> {
  const current = await load(connection, prospectId);
  if (current === null) return { ok: false, refusal: 'prospect-not-found' };
  if (!current.websites.some((website) => sameUrl(website.url, url))) {
    return { ok: false, refusal: 'contact-not-found' };
  }
  const websites = withSinglePrimary(current.websites, url);
  const prospect = await save(
    connection,
    current,
    { websites },
    { fields: ['websites'], action: 'website-primary-set', url: url.trim() },
    actor,
  );
  return { ok: true, prospect };
}

export interface RemoveProspectEmailOptions {
  /** Also suppress the address, for when the person objected. Removal alone
   *  is a data correction, not an opt-out. */
  suppress?: boolean;
  actor?: string;
}

export async function removeProspectEmail(
  connection: Connection,
  prospectId: string,
  address: string,
  options: RemoveProspectEmailOptions = {},
): Promise<ProspectContactResult<{ withdrawnProviderDraftIds: string[] }>> {
  const current = await load(connection, prospectId);
  if (current === null) return { ok: false, refusal: 'prospect-not-found' };
  const removed = current.emails.find((email) => sameAddress(email.address, address));
  if (removed === undefined) return { ok: false, refusal: 'contact-not-found' };

  // Unsent drafts addressed to it leave the review flow so nobody sends them
  // by hand; sent thread history is never touched.
  const Drafts = createOutreachDraftModel(connection);
  const liveDrafts = await Drafts.find({ prospectId, status: 'created' })
    .select({ draftId: 1, roleAddress: 1, providerDraftId: 1 })
    .lean();
  const withdrawn = liveDrafts.filter((draft) => sameAddress(draft.roleAddress, removed.address));
  if (withdrawn.length > 0) {
    await Drafts.updateMany(
      { draftId: { $in: withdrawn.map((draft) => draft.draftId) }, status: 'created' },
      { $set: { status: 'deleted', deletedAt: new Date() } },
    );
  }

  if (options.suppress === true) {
    await addSuppressionEntry(connection, {
      domain: emailDomain(removed.address) ?? '',
      address: removed.address,
      reasonCode: 'operator-request',
      reason: 'address removed from the prospect and blacklisted by the operator',
    });
  }

  const emails = current.emails.filter((email) => email !== removed);
  const prospect = await save(
    connection,
    current,
    { emails },
    {
      fields: ['emails'],
      action: 'email-removed',
      // The address itself is personal data; its hash still proves which one.
      addressHash: hashSuppressionValue(normalizeAddressForHash(removed.address)),
      origin: removed.origin,
      wasRecipient: current.emails[0] === removed,
      suppressed: options.suppress === true,
      withdrawnDrafts: withdrawn.length,
    },
    options.actor ?? 'operator',
  );
  return {
    ok: true,
    prospect,
    withdrawnProviderDraftIds: withdrawn.flatMap((draft) =>
      draft.providerDraftId !== undefined ? [draft.providerDraftId] : [],
    ),
  };
}

/** Moves the address to position 0, the recipient every outreach path uses. */
export async function setOutreachProspectEmail(
  connection: Connection,
  prospectId: string,
  address: string,
  actor = 'operator',
): Promise<ProspectContactResult> {
  const current = await load(connection, prospectId);
  if (current === null) return { ok: false, refusal: 'prospect-not-found' };
  const chosen = current.emails.find((email) => sameAddress(email.address, address));
  if (chosen === undefined) return { ok: false, refusal: 'contact-not-found' };
  const emails = [chosen, ...current.emails.filter((email) => email !== chosen)];
  const prospect = await save(
    connection,
    current,
    { emails },
    {
      fields: ['emails'],
      action: 'email-recipient-set',
      addressHash: hashSuppressionValue(normalizeAddressForHash(chosen.address)),
      origin: chosen.origin,
    },
    actor,
  );
  return { ok: true, prospect };
}
