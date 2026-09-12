/**
 * The wave roster: hotels the operator authorized by hand for one outreach
 * wave, beside the ones the selection rule picked (plan 041 slice B2).
 *
 * Writes refuse with a typed reason rather than throwing, the same shape
 * planOutreachFullScan uses, because every one of these refusals is a
 * normal operator situation (a domain nobody in the catalogue owns, a hotel
 * already on the roster) rather than a fault.
 *
 * Adding an entry authorizes nothing on its own: the scan gate still checks
 * qualification currency, current domain ownership, suppression, and
 * in-flight scans afterwards. This module answers only "did the operator
 * put this hotel in this wave".
 */

import { randomUUID } from 'node:crypto';
import type { Connection } from 'mongoose';
import {
  createWaveRosterEntryModel,
  type WaveRosterEntryDocument,
} from './schemas/wave-roster.schema.js';
import {
  getHotelCandidate,
  getLatestHotelCandidateByOwnRegistrableDomain,
} from './hotel-candidates.js';
import { getLatestScoreCohort } from './scores.js';

export type AddWaveRosterEntryRefusal =
  'candidate-unknown' | 'domain-unknown' | 'no-own-domain' | 'no-cohort' | 'already-on-roster';

export interface AddWaveRosterEntryInput {
  wave: string;
  /** Exactly one of these identifies the hotel. A domain is what the
   *  runbook's decisions are written in; a candidate id is what the
   *  dashboard and the rest of the pipeline speak. */
  candidateId?: string;
  domain?: string;
  rank?: number;
  scoringVersion: string;
  actor: string;
  note?: string;
}

export type AddWaveRosterEntryResult =
  | { added: true; entryId: string; candidateId: string; domain: string }
  | { added: false; refused: AddWaveRosterEntryRefusal };

export async function addWaveRosterEntry(
  connection: Connection,
  input: AddWaveRosterEntryInput,
): Promise<AddWaveRosterEntryResult> {
  const candidate =
    input.candidateId !== undefined
      ? await getHotelCandidate(connection, input.candidateId)
      : await getLatestHotelCandidateByOwnRegistrableDomain(connection, input.domain ?? '');
  if (candidate === null) {
    return {
      added: false,
      refused: input.candidateId !== undefined ? 'candidate-unknown' : 'domain-unknown',
    };
  }

  const domain = candidate.ownRegistrableDomain;
  if (domain === undefined || domain === '') return { added: false, refused: 'no-own-domain' };

  // Provenance, not membership: the selection run the decision was taken
  // against. Without one there is nothing to stamp on a resulting audit, so
  // the roster refuses rather than storing a scan that cannot be traced.
  const cohort = await getLatestScoreCohort(connection, input.scoringVersion);
  if (cohort === null) return { added: false, refused: 'no-cohort' };

  const EntryModel = createWaveRosterEntryModel(connection);
  await EntryModel.init();

  const existing = await EntryModel.findOne({
    wave: input.wave,
    candidateId: candidate.candidateId,
    state: 'active',
  }).lean<WaveRosterEntryDocument | null>();
  if (existing !== null) return { added: false, refused: 'already-on-roster' };

  const now = new Date();
  const entryId = randomUUID();
  await EntryModel.create({
    entryId,
    wave: input.wave,
    candidateId: candidate.candidateId,
    domain,
    rank: input.rank ?? null,
    cohortId: cohort.cohortId,
    scoringVersion: cohort.scoringVersion,
    decidedAt: now,
    actor: input.actor,
    note: input.note ?? null,
    state: 'active',
    revokedAt: null,
    revokedBy: null,
    createdAt: now,
  });
  return { added: true, entryId, candidateId: candidate.candidateId, domain };
}

export interface RevokeWaveRosterEntryInput {
  wave: string;
  candidateId?: string;
  domain?: string;
  actor: string;
}

export type RevokeWaveRosterEntryResult =
  | { revoked: true; entryId: string; candidateId: string }
  | { revoked: false; refused: 'not-on-roster' };

export async function revokeWaveRosterEntry(
  connection: Connection,
  input: RevokeWaveRosterEntryInput,
): Promise<RevokeWaveRosterEntryResult> {
  const EntryModel = createWaveRosterEntryModel(connection);
  const filter: Record<string, unknown> = { wave: input.wave, state: 'active' };
  if (input.candidateId !== undefined) filter['candidateId'] = input.candidateId;
  else filter['domain'] = input.domain ?? '';

  const updated = await EntryModel.findOneAndUpdate(
    filter,
    { $set: { state: 'revoked', revokedAt: new Date(), revokedBy: input.actor } },
    { returnDocument: 'after' },
  ).lean<WaveRosterEntryDocument | null>();
  if (updated === null) return { revoked: false, refused: 'not-on-roster' };
  return { revoked: true, entryId: updated.entryId, candidateId: updated.candidateId };
}

export interface ListWaveRosterOptions {
  wave?: string;
  /** Revoked entries are the history of the roster; the default answers
   *  "who is authorized now". */
  includeRevoked?: boolean;
}

export async function listWaveRoster(
  connection: Connection,
  options: ListWaveRosterOptions = {},
): Promise<WaveRosterEntryDocument[]> {
  const filter: Record<string, unknown> = {};
  if (options.wave !== undefined) filter['wave'] = options.wave;
  if (options.includeRevoked !== true) filter['state'] = 'active';
  return createWaveRosterEntryModel(connection)
    .find(filter)
    .sort({ wave: 1, rank: 1, decidedAt: 1 })
    .lean<WaveRosterEntryDocument[]>();
}

/** The gate's question: the hotel's active roster entry in any wave, newest
 *  decision first. Any wave, because a wave bounds what the operator was
 *  deciding at the time, not how long the decision lasts; revoking is how a
 *  decision ends. */
export async function findActiveWaveRosterEntry(
  connection: Connection,
  candidateId: string,
): Promise<WaveRosterEntryDocument | null> {
  return createWaveRosterEntryModel(connection)
    .findOne({ candidateId, state: 'active' })
    .sort({ decidedAt: -1 })
    .lean<WaveRosterEntryDocument | null>();
}
