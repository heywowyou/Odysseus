/**
 * Attaches the INSEE join to an already-qualified generation, offline, and
 * writes the result as a complete new generation.
 *
 * ## Why this exists rather than re-running the qualification pass
 *
 * `qualifyHotels` probes every candidate's live site. Running it again to
 * apply a stock file the operator has just downloaded would spend hours of
 * third-party requests re-measuring pages in order to attach data that never
 * came from those pages: INSEE's answer depends only on the SIREN, and the
 * SIREN is already stored on every row as `siteFacts.siren`. The rest of the
 * decision is equally on disk - the candidate carries star rating, capacity
 * and group status - and both `joinSireneFor` and `qualifyHotelCandidate` are
 * pure. So this pass contacts nobody.
 *
 * ## Why only some rows are re-decided
 *
 * `effectifBandCode` is the single join field `qualifyHotelCandidate` reads, so
 * a row whose join produced no band would decide identically and is copied
 * forward untouched. That is not just an optimization. Not every input to the
 * original decision is recoverable from the stored row: `domainAdoptedAfterRedirect`
 * is passed in by the reconciliation pass and never stored as a field. It only
 * adds a note and can never change an outcome, but re-deciding blindly would
 * erase, for every hotel the reconciliation adopted, the recorded fact that the
 * campaign is about to contact them at an address their catalogue never
 * published. Rows that are re-decided therefore recover it from their own
 * stored notes rather than losing it.
 *
 * ## Why every untouched verdict is still written
 *
 * The same reason `reconcileRedirects` gives: `listCandidatesToPrescan` filters
 * on `qualification.qualificationVersion`, so a generation containing only the
 * rows this pass changed would silently shrink the prescan population from
 * thousands to a few hundred, and would look like a correct filter rather than
 * a bug. A version means one complete pass over the catalogue.
 *
 * ## Why a dry run may report real outcomes here
 *
 * `qualifyHotels` deliberately refuses to: its dry run once reported 9,545
 * rejections against a catalogue nobody had looked at, because it decided using
 * a synthetic "not attempted" site fact. That rule is about not inventing
 * observations. This pass observes nothing in the first place - every input is
 * already stored, the decision is pure, and the only difference between a dry
 * run and a real one is whether the rows are persisted. Reporting the projected
 * outcomes is the entire point of dry-running it: seeing how many hotels the
 * effectif rule newly rejects before committing a generation.
 */

import {
  qualifyHotelCandidate,
  type HotelQualificationOutcome,
  type HotelSireneJoin,
} from '@odysseus/core';
import type {
  HotelCandidateDocument,
  HotelQualificationDocument,
  RecordHotelQualificationInput,
} from '@odysseus/store';
import type { HotelSireneJoiner } from '../hotel-identity/hotel-sirene-join.js';
import { factsFor, joinSireneFor } from './qualify-hotels.js';

export const BACKFILL_BATCH_SIZE = 200;

/** The persistence this pass needs, and nothing more. */
export interface BackfillSireneStorePort {
  /** One page of the source generation, ordered by candidateId. */
  listQualifications(options: {
    qualificationVersion: string;
    limit: number;
    after?: string;
  }): Promise<HotelQualificationDocument[]>;
  getCandidates(candidateIds: readonly string[]): Promise<HotelCandidateDocument[]>;
  record(inputs: RecordHotelQualificationInput[]): Promise<unknown>;
}

export interface BackfillSireneOptions {
  store: BackfillSireneStorePort;
  /** Required, unlike on `qualifyHotels`. See the throw below. */
  sireneJoiner: HotelSireneJoiner;
  resolutionVersion: string;
  /** Generation being read. */
  fromVersion: string;
  /** Generation being written. Must differ from `fromVersion`, for the reason
   *  `reconcileRedirects` states: a version is one rule set's complete verdict,
   *  and rewriting one in place would make an earlier comparison silently
   *  describe two different rules. */
  toVersion: string;
  dryRun: boolean;
  onProgress?: (rowsProcessed: number) => void;
}

export interface BackfillSireneReport {
  resolutionVersion: string;
  fromVersion: string;
  toVersion: string;
  dryRun: boolean;
  stockVersion: string;
  /** Rows read from the source generation. */
  rowsRead: number;
  /** Rows carrying an identifier the site probe recovered, and so the only
   *  rows INSEE was asked about. */
  rowsWithIdentifier: number;
  /** Every join status seen, so a run that matched nothing is legible as such
   *  rather than looking like a run that asked nothing. */
  byJoinStatus: Record<HotelSireneJoin['status'], number>;
  /** Rows whose verdict was recomputed, which is only ever those whose join
   *  returned a size band. */
  rowsRedecided: number;
  /** Verdicts that actually moved, keyed `from->to`. Empty when the size band
   *  changed nobody's outcome, which is a real and reportable result. */
  outcomeChanges: Record<string, number>;
  /** The new generation's outcome distribution, projected on a dry run. */
  byOutcome: Record<HotelQualificationOutcome, number>;
  /** Verdicts carried into the new generation unchanged. */
  copiedForward: number;
  /** Rows written. Zero on a dry run; otherwise equals `rowsRead`, which is
   *  the property that makes the new version complete. */
  rowsWritten: number;
}

function emptyOutcomes(): Record<HotelQualificationOutcome, number> {
  return { qualified: 0, parked: 0, rejected: 0, 'already-engaged': 0, 'group-routed': 0 };
}

function emptyJoinStatuses(): Record<HotelSireneJoin['status'], number> {
  return {
    matched: 0,
    'no-identifier': 0,
    'siren-not-in-qualifying-sirene-set': 0,
    'stock-file-unavailable': 0,
  };
}

/** Copies a stored row into the new generation exactly as it stands. */
function carryForward(
  row: HotelQualificationDocument,
  options: BackfillSireneOptions,
): RecordHotelQualificationInput {
  return {
    candidateId: row.candidateId,
    resolutionVersion: options.resolutionVersion,
    qualificationVersion: options.toVersion,
    domain: row.domain,
    outcome: row.outcome,
    reasons: row.reasons,
    notes: row.notes,
    siteFacts: row.siteFacts,
    ...(row.sireneJoin === undefined ? {} : { sireneJoin: row.sireneJoin }),
    evaluatedAt: row.evaluatedAt,
  };
}

export async function backfillSirene(
  options: BackfillSireneOptions,
): Promise<BackfillSireneReport> {
  if (options.fromVersion === options.toVersion) {
    throw new Error(
      'odysseus: backfill-sirene must write a new qualification version, not rewrite ' +
        `'${options.fromVersion}' in place`,
    );
  }
  // `createHotelSireneJoiner` degrades to `stock-file-unavailable` rather than
  // throwing, which is right for `qualifyHotels`: that run has site verdicts to
  // protect and must not lose them for want of an optional input. This pass has
  // no other output. Without the stock file it would write a complete
  // generation whose every row says "we asked and got nothing", which is
  // indistinguishable in shape from a real one and worth nothing.
  if (options.sireneJoiner.stockVersion === null) {
    throw new Error(
      'odysseus: backfill-sirene needs the INSEE stock file. Without it every row would ' +
        'record stock-file-unavailable, producing a generation that looks complete and ' +
        'answers nothing. Download the stock file or set ODYSSEUS_SIRENE_STOCK_PATH.',
    );
  }

  const byJoinStatus = emptyJoinStatuses();
  const byOutcome = emptyOutcomes();
  const outcomeChanges: Record<string, number> = {};
  let rowsRead = 0;
  let rowsWithIdentifier = 0;
  let rowsRedecided = 0;
  let copiedForward = 0;
  let rowsWritten = 0;

  let after: string | undefined;
  for (;;) {
    const page = await options.store.listQualifications({
      qualificationVersion: options.fromVersion,
      limit: BACKFILL_BATCH_SIZE,
      ...(after === undefined ? {} : { after }),
    });
    if (page.length === 0) break;

    // Only the rows a join could actually move need their candidate, but they
    // are not known until the join has run, so fetch the page's candidates once
    // rather than issuing a second query per row.
    const candidates = await options.store.getCandidates(page.map((row) => row.candidateId));
    const byId = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));

    const batch: RecordHotelQualificationInput[] = [];
    for (const row of page) {
      rowsRead += 1;
      const join = joinSireneFor(row.siteFacts, options.sireneJoiner);
      if (join === undefined) {
        // No identifier, so nobody was asked. An absent join says that better
        // than a join reporting an absence - see `joinSireneFor`.
        copiedForward += 1;
        byOutcome[row.outcome] += 1;
        batch.push(carryForward(row, options));
        continue;
      }
      rowsWithIdentifier += 1;
      byJoinStatus[join.status] += 1;

      const candidate = byId.get(row.candidateId);
      if (join.effectifBandCode === undefined || candidate === undefined) {
        // The join is still stored: "INSEE has no qualifying record for this
        // company" is a fact worth keeping, and scoring records an `unknown`
        // reason rather than a false one. Only the verdict is left alone.
        copiedForward += 1;
        byOutcome[row.outcome] += 1;
        batch.push({ ...carryForward(row, options), sireneJoin: join });
        continue;
      }

      const result = qualifyHotelCandidate({
        ...factsFor(candidate, row.siteFacts, join),
        // Recovered from the stored row rather than recomputed. Nothing else
        // knows it: the reconciliation pass passes it in and it is never
        // stored as a field of its own.
        ...(row.notes.includes('domain-adopted-after-redirect')
          ? { domainAdoptedAfterRedirect: true }
          : {}),
      });
      rowsRedecided += 1;
      byOutcome[result.outcome] += 1;
      if (result.outcome !== row.outcome) {
        const key = `${row.outcome}->${result.outcome}`;
        outcomeChanges[key] = (outcomeChanges[key] ?? 0) + 1;
      }
      batch.push({
        candidateId: row.candidateId,
        resolutionVersion: options.resolutionVersion,
        qualificationVersion: options.toVersion,
        domain: row.domain,
        outcome: result.outcome,
        reasons: result.reasons,
        notes: result.notes,
        siteFacts: row.siteFacts,
        sireneJoin: join,
        evaluatedAt: join.checkedAt,
      });
    }

    if (!options.dryRun && batch.length > 0) {
      await options.store.record(batch);
      rowsWritten += batch.length;
    }
    options.onProgress?.(rowsRead);

    after = page[page.length - 1]?.candidateId;
    if (page.length < BACKFILL_BATCH_SIZE) break;
  }

  return {
    resolutionVersion: options.resolutionVersion,
    fromVersion: options.fromVersion,
    toVersion: options.toVersion,
    dryRun: options.dryRun,
    stockVersion: options.sireneJoiner.stockVersion,
    rowsRead,
    rowsWithIdentifier,
    byJoinStatus,
    rowsRedecided,
    outcomeChanges,
    byOutcome,
    copiedForward,
    rowsWritten,
  };
}
