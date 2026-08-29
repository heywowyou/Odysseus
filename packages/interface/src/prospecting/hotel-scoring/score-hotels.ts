/**
 * Runs plan 006's scoring stage over the hotels a prescan has already measured:
 * assemble the facts, score them, persist an immutable score per hotel, and
 * report where the population sits.
 *
 * Behind a port for the reason qualify-hotels.ts states about its own: the risk
 * here is the batching, the resume behaviour, and the fact assembly, none of
 * which is database access, and all of which deserve a test that runs without
 * Docker.
 *
 * **This stage contacts nobody.** Every fact it reads was stored by an earlier
 * pass, so there is no browser, no origin lock, and no crawl delay to apply -
 * which is also why the CLI runs it inline rather than through the queue.
 *
 * **A dry run plans; it does not score.** The same rule qualify-hotels.ts
 * arrived at the hard way: a plan reports the population it would score and
 * leaves every distribution empty, rather than reporting numbers derived from
 * facts it never loaded.
 */

import {
  computeHotelOutreachScore,
  getHotelOutreachScoreConfig,
  type HotelOutreachScore,
  type HotelOutreachScoreInput,
  type HotelScoreEvidenceFacts,
  type HotelScorePageFacts,
} from '@odysseus/core';
import type {
  HotelCandidateDocument,
  PrescanDocument,
  RecordHotelScoreInput,
} from '@odysseus/store';
import type { HotelSireneJoin, HotelSiteFacts } from '@odysseus/core';

/** Bumped by hand when the weights or the components change, never edited in
 *  place - the same discipline, and the same reason, as
 *  CURRENT_QUALIFICATION_VERSION. Approval lives with the configuration in
 *  core, not here: an unapproved version still scores, it just cannot select. */
export { CURRENT_SCORING_VERSION } from '@odysseus/core';

export const SCORE_BATCH_SIZE = 200;

export interface HotelScoringStorePort {
  listCandidatesToScore(options: {
    resolutionVersion: string;
    qualificationVersion: string;
    prescanVersion: string;
    limit: number;
    after?: string;
    domain?: string;
  }): Promise<HotelCandidateDocument[]>;
  getPrescan(prescanId: string): Promise<PrescanDocument | null>;
  /** The stored verdict, for the facts a score's ability side reads. Both come
   *  from the same qualification document because both are that generation's:
   *  the site probe observed them together, and reading the effectif band from
   *  the candidate instead would pair one generation's company facts with
   *  another's site facts. */
  getQualificationFacts(
    qualificationVersion: string,
    candidateId: string,
  ): Promise<QualificationFacts | null>;
  findScoredCandidateIds(
    scoringVersion: string,
    candidateIds: readonly string[],
  ): Promise<Set<string>>;
  recordScores(inputs: RecordHotelScoreInput[]): Promise<{ inserted: number }>;
}

export interface ScoreHotelsOptions {
  store: HotelScoringStorePort;
  resolutionVersion: string;
  qualificationVersion: string;
  prescanVersion: string;
  scoringVersion: string;
  limit?: number;
  domain?: string;
  /** Score again where a score already exists at this version. Off by default,
   *  so an interrupted run continues rather than duplicating its own work. */
  rescoreAll: boolean;
  dryRun: boolean;
  onProgress?: (scored: number) => void;
}

export type HotelScoreSkipReason = 'prescan-missing' | 'already-scored';

export interface ScoreHotelsReport {
  resolutionVersion: string;
  qualificationVersion: string;
  prescanVersion: string;
  scoringVersion: string;
  /** False when the configuration has not been approved. Scoring still runs;
   *  selection is what approval gates. */
  approved: boolean;
  dryRun: boolean;
  candidatesConsidered: number;
  scored: number;
  worthy: number;
  skipped: Record<HotelScoreSkipReason, number>;
  brokennessBands: Record<string, number>;
  abilityBands: Record<string, number>;
  plan?: ScoreHotelsPlan;
  /** Reconciliation, so a report that does not add up is visible as an error
   *  rather than read as a result. */
  reconciles: boolean;
}

export interface ScoreHotelsPlan {
  candidatesConsidered: number;
  wouldScore: number;
  alreadyScored: number;
  prescanMissing: number;
}

function bandLabel(total: number): string {
  if (total >= 100) return '100';
  const floor = Math.floor(total / 10) * 10;
  return `${floor}-${floor + 9}`;
}

function pageFacts(prescan: PrescanDocument): HotelScorePageFacts[] {
  return prescan.pages.map((page) => ({
    missingPercent: page.missingPercent ?? null,
    axeCritical: page.axe?.byImpact.critical ?? null,
    axeSerious: page.axe?.byImpact.serious ?? null,
    consoleErrorCount: page.consoleErrorCount ?? null,
    largestContentfulPaintMs: page.metrics?.largestContentfulPaintMs ?? null,
    mainThreadBlockingMs: page.metrics?.mainThreadBlockingMs ?? null,
    cumulativeLayoutShift: page.metrics?.cumulativeLayoutShift ?? null,
  }));
}

function evidenceFacts(prescan: PrescanDocument): HotelScoreEvidenceFacts {
  const evidence = prescan.evidence;
  if (evidence === undefined) {
    // A v1 prescan predates the evidence contract. Absent evidence is not
    // incomplete evidence for scoring purposes either way: both mean nothing
    // photographable exists, which is what worthiness turns on.
    return { status: 'incomplete', specificFailureReason: null, summarySeverities: [] };
  }
  return {
    status: evidence.status,
    specificFailureReason:
      evidence.specificFailure.state === 'captured'
        ? evidence.specificFailure.selectionReason
        : null,
    summarySeverities: evidence.summaries.map((summary) => summary.severity),
  };
}

/** Assembles the facts the pure score reads. Kept separate, and exported, for
 *  the reason `factsFor` is in qualify-hotels.ts: what the decision was given
 *  should be inspectable rather than assembled inline inside a loop. */
export interface QualificationFacts {
  site: HotelSiteFacts;
  sireneJoin?: HotelSireneJoin;
}

export function scoreInputFor(
  candidate: HotelCandidateDocument,
  prescan: PrescanDocument,
  qualification: QualificationFacts | null,
): HotelOutreachScoreInput {
  const site = qualification?.site ?? null;
  return {
    candidateId: candidate.candidateId,
    pages: pageFacts(prescan),
    evidence: evidenceFacts(prescan),
    starRating: candidate.starRating ?? null,
    capacity: candidate.capacity ?? null,
    roomCount: candidate.roomCount ?? null,
    groupStatus: candidate.groupStatus,
    effectifBandCode: qualification?.sireneJoin?.effectifBandCode ?? null,
    reservationUrl: site?.reservationUrl ?? null,
    offsiteBookingCount: site?.bookingVendors?.length ?? prescan.offsiteBookingLinks.length,
  };
}

export async function scoreHotels(options: ScoreHotelsOptions): Promise<ScoreHotelsReport> {
  const config = getHotelOutreachScoreConfig(options.scoringVersion);
  const brokennessBands: Record<string, number> = {};
  const abilityBands: Record<string, number> = {};
  const skipped: Record<HotelScoreSkipReason, number> = {
    'prescan-missing': 0,
    'already-scored': 0,
  };
  const plan: ScoreHotelsPlan = {
    candidatesConsidered: 0,
    wouldScore: 0,
    alreadyScored: 0,
    prescanMissing: 0,
  };
  let candidatesConsidered = 0;
  let scored = 0;
  let worthy = 0;
  let after: string | undefined;

  const remaining = (): number =>
    options.limit === undefined ? SCORE_BATCH_SIZE : options.limit - candidatesConsidered;

  while (options.limit === undefined || candidatesConsidered < options.limit) {
    const pageSize = Math.min(SCORE_BATCH_SIZE, Math.max(0, remaining()));
    if (pageSize === 0) break;

    const page = await options.store.listCandidatesToScore({
      resolutionVersion: options.resolutionVersion,
      qualificationVersion: options.qualificationVersion,
      prescanVersion: options.prescanVersion,
      limit: pageSize,
      ...(after === undefined ? {} : { after }),
      ...(options.domain === undefined ? {} : { domain: options.domain }),
    });
    if (page.length === 0) break;
    after = page[page.length - 1]?.candidateId;

    const alreadyScored = options.rescoreAll
      ? new Set<string>()
      : await options.store.findScoredCandidateIds(
          options.scoringVersion,
          page.map((candidate) => candidate.candidateId),
        );

    const computedAt = new Date();
    const inputs: RecordHotelScoreInput[] = [];

    for (const candidate of page) {
      candidatesConsidered += 1;
      plan.candidatesConsidered += 1;

      if (alreadyScored.has(candidate.candidateId)) {
        if (options.dryRun) plan.alreadyScored += 1;
        else skipped['already-scored'] += 1;
        continue;
      }

      const prescanId = candidate.prescan?.prescanId;
      if (prescanId === undefined) {
        if (options.dryRun) plan.prescanMissing += 1;
        else skipped['prescan-missing'] += 1;
        continue;
      }

      if (options.dryRun) {
        plan.wouldScore += 1;
        continue;
      }

      const prescan = await options.store.getPrescan(prescanId);
      if (prescan === null) {
        // The pointer names a prescan the retention sweep has already expired.
        // Worth counting rather than throwing: a 90 day window guarantees this
        // happens eventually, and it is a fact about the run, not a failure.
        skipped['prescan-missing'] += 1;
        continue;
      }

      const qualification = await options.store.getQualificationFacts(
        options.qualificationVersion,
        candidate.candidateId,
      );
      const score: HotelOutreachScore = computeHotelOutreachScore(
        scoreInputFor(candidate, prescan, qualification),
        config,
      );

      scored += 1;
      if (score.worthy) worthy += 1;
      const brokenness = bandLabel(score.brokenness.total);
      const ability = bandLabel(score.ability.total);
      brokennessBands[brokenness] = (brokennessBands[brokenness] ?? 0) + 1;
      abilityBands[ability] = (abilityBands[ability] ?? 0) + 1;

      inputs.push({
        candidateId: candidate.candidateId,
        prescanId: prescan.prescanId,
        domain: candidate.ownRegistrableDomain ?? prescan.domain,
        resolutionVersion: options.resolutionVersion,
        qualificationVersion: options.qualificationVersion,
        prescanVersion: options.prescanVersion,
        score,
        evidenceComplete: prescan.evidence?.status === 'complete',
        computedAt,
      });
    }

    if (inputs.length > 0) await options.store.recordScores(inputs);
    options.onProgress?.(candidatesConsidered);

    if (page.length < pageSize) break;
  }

  const accountedFor = scored + skipped['already-scored'] + skipped['prescan-missing'];

  return {
    resolutionVersion: options.resolutionVersion,
    qualificationVersion: options.qualificationVersion,
    prescanVersion: options.prescanVersion,
    scoringVersion: options.scoringVersion,
    approved: config.approved,
    dryRun: options.dryRun,
    candidatesConsidered,
    scored,
    worthy,
    skipped,
    brokennessBands,
    abilityBands,
    reconciles: options.dryRun
      ? plan.wouldScore + plan.alreadyScored + plan.prescanMissing === candidatesConsidered
      : accountedFor === candidatesConsidered,
    ...(options.dryRun ? { plan } : {}),
  };
}
