/**
 * Runs plan 003's cheap stage across a resolution run's candidates: probe the
 * site, decide, persist, and report why everything that did not proceed did
 * not proceed.
 *
 * Behind a port for the same reason resolve-hotels.ts states about its own:
 * the risk here is the batching, the concurrency, and the loss-reason
 * arithmetic, none of which is database access, and all of which deserve a
 * test that runs without Docker. The site probe is injected for the same
 * reason - the interesting failures are a whole run's worth of mixed outcomes,
 * which is unreadable expressed as a fetch stub.
 *
 * **A dry run plans; it does not decide.** An earlier version ran the real
 * decision with a synthetic "not attempted" site fact, which reported 9,545
 * rejections against a catalogue nobody had looked at - `not-attempted` means
 * "no own domain to try", so every hotel that had a perfectly good domain was
 * counted as having none. A number that confident and that wrong is worse than
 * no number, so a dry run now reports the request budget and the population it
 * would spend it on, and leaves every outcome count at zero because no outcome
 * was observed.
 *
 * **Concurrency and politeness are separate mechanisms and both are needed.**
 * The lanes bound how many hotels are in flight; the shared OriginLock bounds
 * how many requests hit one origin. Only the second protects a site, and it is
 * the one that matters on a catalogue where a few hundred hotels sit behind one
 * vendor host: without it, twelve lanes would hit that host twelve times at
 * once while every one of them looked individually polite.
 */

import {
  decideOverpassNeed,
  qualifyHotelCandidate,
  type HotelQualificationOutcome,
  type HotelQualificationResult,
  type HotelSiteFacts,
  type OverpassDecision,
} from '@odysseus/core';
import type { HotelSireneJoin } from '@odysseus/core';
import type { HotelCandidateDocument } from '@odysseus/store';
import type { HotelSireneJoiner } from '../hotel-identity/hotel-sirene-join.js';
import { toLanes } from '../to-lanes.js';
import type { RecordHotelQualificationInput } from '@odysseus/store';

/** Bumped by hand when a qualification rule changes, never edited in place -
 *  the same discipline, and the same reason, as CURRENT_RESOLUTION_VERSION.
 *
 *  v2 changed what an off-domain redirect means: v1 rejected every one of
 *  them, which measured wrong for 312 of 384 real rows. A v2 generation is
 *  produced by two commands, not one - this pass, then
 *  `reconcile-redirects`, which is where the rename-versus-chain count lives
 *  because only it sees the whole run. A v2 generation that has not been
 *  reconciled still carries v1's redirect verdicts, so do not read one as
 *  final until the reconciliation has written it.
 *
 *  v3 asks INSEE about the SIREN this pass reads off the site. Until v3 the
 *  question was asked with an empty hand at resolve time, before any page had
 *  been fetched, so `effectifBandCode` was null for every hotel and the
 *  effectif rejection in `qualifyHotelCandidate` could never fire. Supplying
 *  it changes who qualifies, which is exactly why this is a new generation and
 *  not a v2 re-run. */
export const CURRENT_QUALIFICATION_VERSION = 'v3';

export const QUALIFY_BATCH_SIZE = 200;

/** The persistence this pass needs, and nothing more. */
export interface HotelQualificationStorePort {
  /** Candidates to evaluate, already filtered to this resolution version.
   *  `after` is the last candidateId of the previous page, which is what makes
   *  a 7,000-domain run resumable without holding the whole list in memory. */
  listCandidatesToQualify(options: {
    resolutionVersion: string;
    limit: number;
    after?: string;
    skipAlreadyQualified: boolean;
    qualificationVersion: string;
  }): Promise<HotelCandidateDocument[]>;
  record(inputs: RecordHotelQualificationInput[]): Promise<{ created: number; updated: number }>;
}

export interface HotelSiteChecker {
  (domain: string): Promise<HotelSiteFacts>;
}

export interface QualifyHotelsOptions {
  store: HotelQualificationStorePort;
  checkSite: HotelSiteChecker;
  resolutionVersion: string;
  qualificationVersion: string;
  /** Maximum candidates to evaluate this run. Undefined means the whole run. */
  limit?: number;
  concurrency: number;
  /** Asks INSEE about the SIREN the site probe recovered. Optional because a
   *  run without the operator-placed stock file must still produce verdicts:
   *  the joiner then reports `stock-file-unavailable` and the effectif rule
   *  stays silent, which is the honest outcome of not having looked. */
  sireneJoiner?: HotelSireneJoiner;
  /** Skip candidates already carrying a verdict at this qualification version,
   *  so an interrupted batch continues rather than restarting. */
  resume: boolean;
  dryRun: boolean;
  onProgress?: (evaluated: number) => void;
}

export interface HotelQualificationReport {
  resolutionVersion: string;
  qualificationVersion: string;
  dryRun: boolean;
  candidatesEvaluated: number;
  byOutcome: Record<HotelQualificationOutcome, number>;
  /** Every condition hit, counted independently. These sum to more than
   *  `candidatesEvaluated` on purpose: reasons accumulate per candidate, and
   *  the question a loss table answers is "how many hotels hit this", not "how
   *  many hotels hit only this". */
  byReason: Record<string, number>;
  byNote: Record<string, number>;
  /** The number binding decision 3 turns on: qualified hotels holding a usable
   *  own domain. */
  qualifiedUsableOwnDomains: number;
  /** Null on a dry run. A yield nothing measured cannot decide whether a second
   *  catalogue source is needed, and printing 'propose' from an empty run would
   *  be an argument for ingesting one on no evidence. */
  overpass: OverpassDecision | null;
  /** Present only on a dry run: what the real run would cost and cover. */
  plan?: HotelQualificationPlan;
  /** Reconciliation, so a report that does not add up is visible as an error
   *  rather than read as a result. */
  reconciles: boolean;
}

export interface HotelQualificationPlan {
  candidatesConsidered: number;
  /** Candidates that would be fetched. Exactly the request budget: one or two
   *  requests each, plus one robots.txt per origin. */
  wouldFetch: number;
  /** Decided without any request, because the catalogue alone already settles
   *  it: no own domain, a chain, a vendor platform, or below the star gate. */
  decidedWithoutRequest: number;
  /** Population facts a real run's outcomes will be read against. Counted, not
   *  concluded from: a chain member still needs its site looked at before its
   *  outcome is known, because a published accessibility statement outranks
   *  group routing. */
  population: {
    groupMember: number;
    vendorHosted: number;
    belowThreeStars: number;
    unknownStarRating: number;
    awaitingReview: number;
  };
}

function emptyOutcomes(): Record<HotelQualificationOutcome, number> {
  return { qualified: 0, parked: 0, rejected: 0, 'already-engaged': 0, 'group-routed': 0 };
}

/** Assembles the facts the pure decision reads. Kept separate so what the
 *  decision is given is inspectable, rather than being assembled inline inside
 *  a concurrency loop. */
export function factsFor(
  candidate: HotelCandidateDocument,
  site: HotelSiteFacts,
  sireneJoin?: HotelSireneJoin,
): Parameters<typeof qualifyHotelCandidate>[0] {
  return {
    starRating: candidate.starRating ?? null,
    groupStatus: candidate.groupStatus,
    ownRegistrableDomain: candidate.ownRegistrableDomain ?? null,
    reviewState: candidate.review.state,
    effectifBandCode: sireneJoin?.effectifBandCode ?? null,
    capacity: candidate.capacity ?? null,
    site,
  };
}

/** Asks INSEE only when this probe actually recovered an identifier.
 *
 *  Calling the joiner with nothing would record `no-identifier` against every
 *  hotel whose page we never fetched, which reads as "we looked and it has
 *  none" when nobody looked. An absent join says that better than a join that
 *  reports an absence. */
export function joinSireneFor(
  site: HotelSiteFacts,
  joiner: HotelSireneJoiner | undefined,
): HotelSireneJoin | undefined {
  if (joiner === undefined) return undefined;
  const siren = site.siren ?? undefined;
  if (siren === undefined || siren === '') return undefined;
  return joiner.join(siren);
}

/** A candidate with no own domain is decided without a request. Checking it
 *  anyway would be a fetch against a domain the catalogue already told us
 *  belongs to somebody else. */
const NOT_ATTEMPTED: HotelSiteFacts = { reachability: 'not-attempted' };

/** Excluded on catalogue facts alone, so no request is spent on it. */
const NOT_CHECKED: HotelSiteFacts = { reachability: 'not-checked' };

/**
 * Is this candidate's outcome still open enough to be worth a stranger's
 * bandwidth?
 *
 * A chain property is excluded from an SMB campaign whatever its website looks
 * like, and a hotel below the star gate is parked whatever its website looks
 * like. Fetching either one buys nothing and puts load on a third party for a
 * question already answered - the same reasoning behind non-negotiable rule 5,
 * applied to whether to make the request at all rather than to how politely to
 * make it. On the real national catalogue this is 2,411 requests not made,
 * 1,196 of them to one chain.
 *
 * The one thing this forgoes is discovering that an excluded hotel publishes an
 * accessibility statement, which would have outranked its exclusion. That is
 * not a loss: `already-engaged` exists to stop this campaign approaching a site
 * wrongly, and a candidate excluded before any approach is already not being
 * approached.
 */
function isWorthChecking(candidate: HotelCandidateDocument): boolean {
  if ((candidate.ownRegistrableDomain ?? '') === '') return false;
  if (candidate.groupStatus !== 'independent') return false;
  return candidate.campaignEligibility === 'eligible';
}

export async function qualifyHotels(
  options: QualifyHotelsOptions,
): Promise<HotelQualificationReport> {
  const byOutcome = emptyOutcomes();
  const byReason: Record<string, number> = {};
  const byNote: Record<string, number> = {};
  let candidatesEvaluated = 0;
  let qualifiedUsableOwnDomains = 0;
  let after: string | undefined;
  const plan: HotelQualificationPlan = {
    candidatesConsidered: 0,
    wouldFetch: 0,
    decidedWithoutRequest: 0,
    population: {
      groupMember: 0,
      vendorHosted: 0,
      belowThreeStars: 0,
      unknownStarRating: 0,
      awaitingReview: 0,
    },
  };

  const remaining = (): number =>
    options.limit === undefined ? QUALIFY_BATCH_SIZE : options.limit - candidatesEvaluated;

  while (options.limit === undefined || candidatesEvaluated < options.limit) {
    const pageSize = Math.min(QUALIFY_BATCH_SIZE, Math.max(0, remaining()));
    if (pageSize === 0) break;

    const page = await options.store.listCandidatesToQualify({
      resolutionVersion: options.resolutionVersion,
      limit: pageSize,
      ...(after === undefined ? {} : { after }),
      skipAlreadyQualified: options.resume,
      qualificationVersion: options.qualificationVersion,
    });
    if (page.length === 0) break;
    after = page[page.length - 1]?.candidateId;

    const evaluatedAt = new Date();

    if (options.dryRun) {
      for (const candidate of page) {
        candidatesEvaluated += 1;
        if (isWorthChecking(candidate)) plan.wouldFetch += 1;
        else plan.decidedWithoutRequest += 1;
        if (candidate.groupStatus === 'group-member') plan.population.groupMember += 1;
        if (candidate.groupStatus === 'vendor-hosted') plan.population.vendorHosted += 1;
        if (candidate.campaignEligibility === 'parked-below-three-stars') {
          plan.population.belowThreeStars += 1;
        }
        if (candidate.campaignEligibility === 'parked-unknown-rating') {
          plan.population.unknownStarRating += 1;
        }
        if (candidate.review.state === 'pending') plan.population.awaitingReview += 1;
      }
      options.onProgress?.(candidatesEvaluated);
      if (page.length < pageSize) break;
      continue;
    }

    const results = new Map<
      string,
      { site: HotelSiteFacts; sireneJoin?: HotelSireneJoin; result: HotelQualificationResult }
    >();

    await Promise.all(
      toLanes(page, options.concurrency).map(async (lane) => {
        for (const candidate of lane) {
          const domain = candidate.ownRegistrableDomain;
          const site =
            (domain ?? '') === ''
              ? NOT_ATTEMPTED
              : isWorthChecking(candidate)
                ? await options.checkSite(domain as string)
                : NOT_CHECKED;
          const sireneJoin = joinSireneFor(site, options.sireneJoiner);
          results.set(candidate.candidateId, {
            site,
            ...(sireneJoin !== undefined ? { sireneJoin } : {}),
            result: qualifyHotelCandidate(factsFor(candidate, site, sireneJoin)),
          });
        }
      }),
    );

    const inputs: RecordHotelQualificationInput[] = [];
    for (const candidate of page) {
      const entry = results.get(candidate.candidateId);
      if (entry === undefined) continue;
      const { site, sireneJoin, result } = entry;
      byOutcome[result.outcome] += 1;
      for (const reason of result.reasons) byReason[reason] = (byReason[reason] ?? 0) + 1;
      for (const note of result.notes) byNote[note] = (byNote[note] ?? 0) + 1;
      if (result.outcome === 'qualified' && (candidate.ownRegistrableDomain ?? '') !== '') {
        qualifiedUsableOwnDomains += 1;
      }
      candidatesEvaluated += 1;
      inputs.push({
        candidateId: candidate.candidateId,
        resolutionVersion: options.resolutionVersion,
        qualificationVersion: options.qualificationVersion,
        domain: candidate.ownRegistrableDomain ?? null,
        outcome: result.outcome,
        reasons: result.reasons,
        notes: result.notes,
        siteFacts: site,
        ...(sireneJoin !== undefined ? { sireneJoin } : {}),
        evaluatedAt,
      });
    }

    if (inputs.length > 0) await options.store.record(inputs);
    options.onProgress?.(candidatesEvaluated);

    if (page.length < pageSize) break;
  }

  const outcomeTotal = Object.values(byOutcome).reduce((sum, count) => sum + count, 0);

  return {
    resolutionVersion: options.resolutionVersion,
    qualificationVersion: options.qualificationVersion,
    dryRun: options.dryRun,
    candidatesEvaluated,
    byOutcome,
    byReason,
    byNote,
    qualifiedUsableOwnDomains,
    overpass: options.dryRun ? null : decideOverpassNeed(qualifiedUsableOwnDomains),
    reconciles: options.dryRun ? true : outcomeTotal === candidatesEvaluated,
    ...(options.dryRun ? { plan: { ...plan, candidatesConsidered: candidatesEvaluated } } : {}),
  };
}
