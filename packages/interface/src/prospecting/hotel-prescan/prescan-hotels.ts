/**
 * Runs plan 004's prescan across a qualification run's candidates: select,
 * measure, persist, and report what happened.
 *
 * Behind ports for the reason qualify-hotels.ts states about its own: the
 * risk here is the batching, the concurrency, the skip rule, and the
 * accounting, none of which is a browser or a database, and all of which
 * deserve a test that runs without either. The prescan itself is injected, so
 * a whole run's worth of mixed outcomes is expressible in a test rather than
 * only in a real browser against real sites.
 *
 * **A dry run plans; it does not measure.** The same correction
 * qualify-hotels.ts records: reporting outcomes for a batch nobody ran
 * produces a number that is confident and wrong, which is worse than no
 * number. A dry run reports the population and the page budget it would
 * spend, and leaves every outcome at zero.
 *
 * **Concurrency and politeness are separate mechanisms.** Lanes bound how
 * many hotels are in flight. The shared OriginLock bounds how many requests
 * reach one origin, and the crawl delay bounds how fast they arrive. Only the
 * second and third protect a site, and they are what non-negotiable rule 5
 * actually requires - lanes are throughput, and adding them never shortens a
 * delay.
 */

import type { HotelCandidateDocument, RecordPrescanInput } from '@odysseus/store';
import type { HotelEvidenceStatus, HotelPrescanStatus } from '@odysseus/core';

/** Bumped by hand when what a prescan measures changes, never edited in
 *  place - the same discipline, and the same reason, as
 *  CURRENT_QUALIFICATION_VERSION: a later comparison must not silently mix
 *  two definitions of the same number. */
export const CURRENT_PRESCAN_VERSION = 'v2';

export const PRESCAN_BATCH_SIZE = 100;

/** The persistence this pass needs, and nothing more. */
export interface HotelPrescanStorePort {
  listCandidatesToPrescan(options: {
    resolutionVersion: string;
    qualificationVersion: string;
    prescanVersion: string;
    limit: number;
    after?: string;
    skipAlreadyPrescanned: boolean;
  }): Promise<HotelCandidateDocument[]>;
  record(input: RecordPrescanInput): Promise<{ prescanId: string; pointerWritten: boolean }>;
}

/** One measured site. The interface deliberately takes a candidate rather
 *  than a URL: what a prescan records is a fact about a hotel, and the
 *  adapter that calls the scanner is what knows how to turn one into the
 *  other. */
export interface HotelPrescanner {
  (
    candidate: HotelCandidateDocument,
  ): Promise<
    Omit<
      RecordPrescanInput,
      'candidateId' | 'resolutionVersion' | 'qualificationVersion' | 'prescanVersion' | 'scanJobId'
    >
  >;
}

export interface PrescanHotelsOptions {
  store: HotelPrescanStorePort;
  prescan: HotelPrescanner;
  scanJobId: string;
  resolutionVersion: string;
  qualificationVersion: string;
  prescanVersion: string;
  /** Maximum candidates to prescan this run. Undefined means every one of
   *  them, which on the measured catalogue is 5,720 sites and hours of
   *  browser time - so the CLI requires an explicit limit rather than
   *  defaulting to the whole population. */
  limit?: number;
  concurrency: number;
  /** Measure again even where a prescan already exists at this version. */
  rescan: boolean;
  dryRun: boolean;
  onProgress?: (prescanned: number) => void;
}

export interface HotelPrescanReport {
  resolutionVersion: string;
  qualificationVersion: string;
  prescanVersion: string;
  scanJobId: string;
  dryRun: boolean;
  candidatesPrescanned: number;
  byStatus: Record<HotelPrescanStatus, number>;
  byEvidenceStatus: Record<HotelEvidenceStatus | 'missing', number>;
  /** Pages actually loaded, which is the cost this run imposed on other
   *  people's servers and the honest unit to report a batch in. */
  pagesLoaded: number;
  /** Candidates whose prescan threw outright. Distinct from a prescan that
   *  completed reporting the site unreachable: one is our failure, the other
   *  is a measurement. */
  failures: number;
  /** Prescans stored whose candidate pointer could not be written, meaning
   *  the catalogue was re-resolved underneath a running batch. */
  pointersMissed: number;
  plan?: HotelPrescanPlan;
  /** Reconciliation, so a report that does not add up is visible as an error
   *  rather than read as a result. */
  reconciles: boolean;
}

export interface HotelPrescanPlan {
  candidatesConsidered: number;
  /** Sites that would be visited. */
  wouldPrescan: number;
  /** Upper bound on pages loaded: three per site. Real runs land below it,
   *  since a site with no booking or rooms page has fewer roles to fill. */
  maxPagesLoaded: number;
}

function emptyStatuses(): Record<HotelPrescanStatus, number> {
  return { complete: 0, 'blocked-by-robots': 0, 'homepage-unreachable': 0 };
}

function emptyEvidenceStatuses(): Record<HotelEvidenceStatus | 'missing', number> {
  return { complete: 0, incomplete: 0, missing: 0 };
}

/** Round-robin lanes, the shape scan-site.ts and qualify-hotels.ts both use:
 *  a candidate list sorted by id must not put one slow host's neighbours all
 *  in one lane. */
function toLanes<T>(items: readonly T[], laneCount: number): T[][] {
  const lanes: T[][] = Array.from({ length: Math.max(1, laneCount) }, () => []);
  items.forEach((item, index) => {
    lanes[index % lanes.length]?.push(item);
  });
  return lanes;
}

export async function prescanHotels(options: PrescanHotelsOptions): Promise<HotelPrescanReport> {
  const byStatus = emptyStatuses();
  const byEvidenceStatus = emptyEvidenceStatuses();
  let candidatesPrescanned = 0;
  let pagesLoaded = 0;
  let failures = 0;
  let pointersMissed = 0;
  let after: string | undefined;
  const plan: HotelPrescanPlan = {
    candidatesConsidered: 0,
    wouldPrescan: 0,
    maxPagesLoaded: 0,
  };

  const remaining = (): number =>
    options.limit === undefined ? PRESCAN_BATCH_SIZE : options.limit - candidatesPrescanned;

  while (options.limit === undefined || candidatesPrescanned < options.limit) {
    const pageSize = Math.min(PRESCAN_BATCH_SIZE, Math.max(0, remaining()));
    if (pageSize === 0) break;

    const page = await options.store.listCandidatesToPrescan({
      resolutionVersion: options.resolutionVersion,
      qualificationVersion: options.qualificationVersion,
      prescanVersion: options.prescanVersion,
      limit: pageSize,
      ...(after === undefined ? {} : { after }),
      skipAlreadyPrescanned: !options.rescan,
    });
    if (page.length === 0) break;
    after = page[page.length - 1]?.candidateId;

    if (options.dryRun) {
      candidatesPrescanned += page.length;
      plan.wouldPrescan += page.length;
      plan.maxPagesLoaded += page.length * 3;
      options.onProgress?.(candidatesPrescanned);
      if (page.length < pageSize) break;
      continue;
    }

    // Results are collected per lane and written after the lanes finish, so
    // the store sees one ordered batch rather than interleaved writes from
    // however many lanes happen to be running.
    const measured: {
      candidate: HotelCandidateDocument;
      result: Awaited<ReturnType<HotelPrescanner>> | null;
    }[] = [];

    await Promise.all(
      toLanes(page, options.concurrency).map(async (lane) => {
        for (const candidate of lane) {
          try {
            measured.push({ candidate, result: await options.prescan(candidate) });
          } catch {
            // One hotel's browser failure must not end a batch of hundreds.
            // Counted as a failure rather than persisted: there is no
            // measurement to store, and storing an empty one would make
            // "we could not measure this" indistinguishable from "this site
            // is empty".
            measured.push({ candidate, result: null });
          }
        }
      }),
    );

    for (const { candidate, result } of measured) {
      candidatesPrescanned += 1;
      if (result === null) {
        failures += 1;
        continue;
      }
      byStatus[result.status] += 1;
      byEvidenceStatus[result.evidence?.status ?? 'missing'] += 1;
      pagesLoaded += result.pages.length;
      const written = await options.store.record({
        ...result,
        candidateId: candidate.candidateId,
        resolutionVersion: options.resolutionVersion,
        qualificationVersion: options.qualificationVersion,
        prescanVersion: options.prescanVersion,
        scanJobId: options.scanJobId,
      });
      if (!written.pointerWritten) pointersMissed += 1;
    }

    options.onProgress?.(candidatesPrescanned);
    if (page.length < pageSize) break;
  }

  const statusTotal = Object.values(byStatus).reduce((sum, count) => sum + count, 0);

  return {
    resolutionVersion: options.resolutionVersion,
    qualificationVersion: options.qualificationVersion,
    prescanVersion: options.prescanVersion,
    scanJobId: options.scanJobId,
    dryRun: options.dryRun,
    candidatesPrescanned,
    byStatus,
    byEvidenceStatus,
    pagesLoaded,
    failures,
    pointersMissed,
    reconciles: options.dryRun ? true : statusTotal + failures === candidatesPrescanned,
    ...(options.dryRun ? { plan: { ...plan, candidatesConsidered: candidatesPrescanned } } : {}),
  };
}
