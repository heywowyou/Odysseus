/**
 * Read/write helpers around the `hotel_contacts` collection, milestone 9c
 * plan 007.
 *
 * The population question this file answers is narrow on purpose: contacts are
 * discovered for the members of the latest score cohort, and for nobody else.
 * Plan 007's own scope line is "no contact before scoring selection", and the
 * cheapest way to keep that true is to make the only available reader take a
 * cohort. There is deliberately no "list every qualified hotel" entry point
 * here for a contact pass to reach for.
 *
 * Plan 045 adds one operator-entered candidate-scoped override. It lives in the
 * same collection under the fixed `manual-v1` version so precedence stays a
 * single deterministic read: manual first, otherwise the exact discovered
 * version the caller asked for. There is intentionally no "latest discovered"
 * fallback.
 */

import { randomUUID } from 'node:crypto';
import type { Connection } from 'mongoose';
import type {
  HotelContactAddressOrigin,
  HotelContactRecord,
  HotelContactState,
  OutreachSelectionState,
} from '@odysseus/core';
import { createHotelCandidateModel } from './schemas/hotel-candidate.schema.js';
import {
  createHotelContactModel,
  type HotelContactDocument,
} from './schemas/hotel-contact.schema.js';
import { createHotelScoreCohortModel } from './schemas/score-cohort.schema.js';

const HOTEL_CONTACT_RETENTION_DAYS = 90;
export const MANUAL_CONTACT_VERSION = 'manual-v1';

function expiryFrom(createdAt: Date): Date {
  return new Date(createdAt.getTime() + HOTEL_CONTACT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

/** One cohort member ready to be looked at: who they are, which cohort put
 *  them here, and the domain to read. */
export interface CohortMemberToContact {
  candidateId: string;
  cohortId: string;
  domain: string;
}

export interface ListCohortMembersToContactOptions {
  scoringVersion: string;
  contactVersion: string;
  limit?: number;
  /** One hotel by its own registrable domain, for a bounded first run. */
  domain?: string;
  /** Look again at members already evaluated at this contact version. */
  recontact?: boolean;
}

/**
 * Cohort members that still need a contact evaluation.
 *
 * A member with no own registrable domain is not returned at all rather than
 * returned and parked: there is no site to read, and manufacturing a row for it
 * would report a contact failure where the real fact is a catalogue gap that
 * plan 003 already recorded.
 */
export async function listCohortMembersToContact(
  connection: Connection,
  options: ListCohortMembersToContactOptions,
): Promise<CohortMemberToContact[]> {
  const cohort = await createHotelScoreCohortModel(connection)
    .findOne({ scoringVersion: options.scoringVersion })
    .sort({ computedAt: -1, _id: -1 })
    .lean<{
      cohortId: string;
      members: { candidateId: string; state: OutreachSelectionState }[];
    }>();
  if (cohort === null) return [];

  const selectedIds = cohort.members
    .filter((member) => member.state === 'selected')
    .map((member) => member.candidateId);
  if (selectedIds.length === 0) return [];

  const alreadyDone =
    options.recontact === true
      ? new Set<string>()
      : await contactedCandidateIds(connection, options.contactVersion, selectedIds);

  const candidates = await createHotelCandidateModel(connection)
    .find({
      candidateId: { $in: selectedIds.filter((id) => !alreadyDone.has(id)) },
      ownRegistrableDomain: { $nin: [null, ''] },
      ...(options.domain === undefined ? {} : { ownRegistrableDomain: options.domain }),
    })
    .sort({ candidateId: 1 })
    .lean<{ candidateId: string; ownRegistrableDomain: string }[]>();

  const rows = candidates.map((candidate) => ({
    candidateId: candidate.candidateId,
    cohortId: cohort.cohortId,
    domain: candidate.ownRegistrableDomain,
  }));
  return options.limit === undefined ? rows : rows.slice(0, options.limit);
}

async function contactedCandidateIds(
  connection: Connection,
  contactVersion: string,
  candidateIds: readonly string[],
): Promise<Set<string>> {
  const rows = await createHotelContactModel(connection)
    .find({ contactVersion, candidateId: { $in: candidateIds } })
    .select({ candidateId: 1 })
    .lean<{ candidateId: string }[]>();
  return new Set(rows.map((row) => row.candidateId));
}

export interface RecordHotelContactInput extends HotelContactRecord {
  contactVersion: string;
}

export interface RecordHotelContactsResult {
  created: number;
  updated: number;
}

export async function recordHotelContacts(
  connection: Connection,
  inputs: readonly RecordHotelContactInput[],
): Promise<RecordHotelContactsResult> {
  if (inputs.length === 0) return { created: 0, updated: 0 };

  const Model = createHotelContactModel(connection);
  // The unique index is the idempotency mechanism and Mongoose builds indexes
  // in the background - the same race, and the same fix, as
  // recordHotelQualifications.
  await Model.init();

  const now = new Date();
  const result = await Model.bulkWrite(
    inputs.map((input) => {
      // Every optional field is either set or explicitly unset, never omitted.
      // A re-run after a site took its address down has to clear the old one:
      // omitting the field would leave a stale address standing beside a parked
      // state. Manual-v1 also uses this path, so its optional cohort and
      // attestation must clear just as deterministically on replacement.
      const optional = {
        cohortId: input.cohortId,
        address: input.address,
        localPart: input.localPart,
        source: input.source,
        sourceUrl: input.sourceUrl,
        addressOrigin: input.addressOrigin,
        freeMailAttestedAt: input.freeMailAttestedAt,
      };
      const set: Record<string, unknown> = {};
      const unset: Record<string, ''> = {};
      for (const [field, value] of Object.entries(optional)) {
        if (value === undefined) unset[field] = '';
        else set[field] = value;
      }

      return {
        updateOne: {
          filter: { contactVersion: input.contactVersion, candidateId: input.candidateId },
          update: {
            $set: {
              domain: input.domain,
              state: input.state,
              reason: input.reason,
              mxStatus: input.mxStatus,
              validatedAt: input.validatedAt,
              expiresAt: expiryFrom(now),
              ...set,
            },
            ...(Object.keys(unset).length === 0 ? {} : { $unset: unset }),
            $setOnInsert: {
              contactId: randomUUID(),
              contactVersion: input.contactVersion,
              candidateId: input.candidateId,
              createdAt: now,
            },
          },
          upsert: true,
        },
      };
    }),
    { ordered: false },
  );

  return { created: result.upsertedCount, updated: result.modifiedCount };
}

export async function getHotelContact(
  connection: Connection,
  contactVersion: string,
  candidateId: string,
): Promise<HotelContactDocument | null> {
  return createHotelContactModel(connection)
    .findOne({ contactVersion, candidateId })
    .lean<HotelContactDocument>();
}

export async function getManualHotelContact(
  connection: Connection,
  candidateId: string,
): Promise<HotelContactDocument | null> {
  return getHotelContact(connection, MANUAL_CONTACT_VERSION, candidateId);
}

/** Manual override first, otherwise exactly the discovered generation the
 *  caller requested. Never falls through to a newer or older discovery row. */
export async function getEffectiveHotelContact(
  connection: Connection,
  discoveredContactVersion: string,
  candidateId: string,
): Promise<HotelContactDocument | null> {
  const manual = await getManualHotelContact(connection, candidateId);
  if (manual !== null) return manual;
  return getHotelContact(connection, discoveredContactVersion, candidateId);
}

export interface RecordManualHotelContactInput {
  candidateId: string;
  domain: string;
  address: string;
  addressOrigin: HotelContactAddressOrigin;
  /** Preserve the discovered row's real cohort when one exists. */
  cohortId?: string;
  /** Present only for the explicit free-mail override. */
  freeMailAttestedAt?: Date;
  validatedAt?: Date;
}

/** Candidate-scoped operator override. Validation, suppression and the linked
 *  audit gate live at the route boundary; this helper only persists the already
 *  normalized decision and keeps the same 90-day retention as discovered
 *  contacts. */
export async function recordManualHotelContact(
  connection: Connection,
  input: RecordManualHotelContactInput,
): Promise<HotelContactDocument> {
  const address = input.address.trim().toLowerCase();
  const at = address.lastIndexOf('@');
  const localPart = at > 0 ? address.slice(0, at) : undefined;
  await recordHotelContacts(connection, [
    {
      candidateId: input.candidateId,
      ...(input.cohortId === undefined ? {} : { cohortId: input.cohortId }),
      contactVersion: MANUAL_CONTACT_VERSION,
      domain: input.domain.trim().toLowerCase(),
      state: 'found',
      reason: 'operator-entered',
      address,
      ...(localPart === undefined ? {} : { localPart }),
      addressOrigin: input.addressOrigin,
      ...(input.freeMailAttestedAt === undefined
        ? {}
        : { freeMailAttestedAt: input.freeMailAttestedAt }),
      // Manual entry deliberately does not perform an MX probe. `unknown` is
      // a factual "not checked", never a negative verdict.
      mxStatus: 'unknown',
      validatedAt: input.validatedAt ?? new Date(),
    },
  ]);
  const stored = await getManualHotelContact(connection, input.candidateId);
  if (stored === null) throw new Error('manual contact upsert did not persist');
  return stored;
}

/** Removes only the operator override. The exact discovered generation the
 *  caller was already using becomes effective again automatically. */
export async function deleteManualHotelContact(
  connection: Connection,
  candidateId: string,
): Promise<boolean> {
  const result = await createHotelContactModel(connection).deleteOne({
    contactVersion: MANUAL_CONTACT_VERSION,
    candidateId,
  });
  return result.deletedCount > 0;
}

export interface HotelContactSummary {
  contactVersion: string;
  total: number;
  byState: Record<string, number>;
  byReason: Record<string, number>;
  /** Which mailbox each found contact actually reaches. Reported because
   *  reservation@ and accueil@ are admissible but weaker than direction@, and
   *  the mix has to be readable before plan 011 drafts against it. */
  byLocalPart: Record<string, number>;
  byMxStatus: Record<string, number>;
}

export async function getHotelContactSummary(
  connection: Connection,
  contactVersion: string,
): Promise<HotelContactSummary> {
  const rows = await createHotelContactModel(connection)
    .find({ contactVersion })
    .select({ state: 1, reason: 1, localPart: 1, mxStatus: 1 })
    .lean<{ state: string; reason: string; localPart?: string; mxStatus: string }[]>();

  const byState: Record<string, number> = {};
  const byReason: Record<string, number> = {};
  const byLocalPart: Record<string, number> = {};
  const byMxStatus: Record<string, number> = {};
  for (const row of rows) {
    byState[row.state] = (byState[row.state] ?? 0) + 1;
    byReason[row.reason] = (byReason[row.reason] ?? 0) + 1;
    byMxStatus[row.mxStatus] = (byMxStatus[row.mxStatus] ?? 0) + 1;
    if (row.localPart !== undefined) {
      byLocalPart[row.localPart] = (byLocalPart[row.localPart] ?? 0) + 1;
    }
  }
  return { contactVersion, total: rows.length, byState, byReason, byLocalPart, byMxStatus };
}

export async function listHotelContacts(
  connection: Connection,
  options: { contactVersion: string; state?: HotelContactState; limit: number },
): Promise<HotelContactDocument[]> {
  return createHotelContactModel(connection)
    .find({
      contactVersion: options.contactVersion,
      ...(options.state === undefined ? {} : { state: options.state }),
    })
    .sort({ candidateId: 1 })
    .limit(options.limit)
    .lean<HotelContactDocument[]>();
}

export interface ContactableCohortMember {
  candidateId: string;
  cohortId: string;
  domain: string;
  address: string;
}

/**
 * Cohort members that actually have a usable discovered address, milestone 9c
 * plan 011. Manual overrides are resolved by the single-candidate drafting
 * adapter instead; a bounded discovery batch must still describe the cohort it
 * came from.
 */
export async function listContactableCohortMembers(
  connection: Connection,
  options: { contactVersion: string; limit?: number; candidateId?: string },
): Promise<ContactableCohortMember[]> {
  const query: Record<string, unknown> = {
    contactVersion: options.contactVersion,
    state: 'found',
    address: { $exists: true, $ne: '' },
    cohortId: { $exists: true, $ne: '' },
  };
  if (options.candidateId !== undefined) query['candidateId'] = options.candidateId;

  const cursor = createHotelContactModel(connection).find(query).sort({ candidateId: 1 });
  if (options.limit !== undefined) cursor.limit(options.limit);
  const rows = await cursor.lean<HotelContactDocument[]>();

  return rows.map((row) => ({
    candidateId: row.candidateId,
    cohortId: row.cohortId as string,
    domain: row.domain,
    address: row.address ?? '',
  }));
}
