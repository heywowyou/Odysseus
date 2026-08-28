/**
 * Plan 006's selection stage: turn a scored population into one cohort.
 *
 * Separate from scoring because the two answer different questions and are run
 * at different times. Scoring is per hotel and incremental - a batch scores
 * whatever is newly prescanned. Selection is a statement about the whole scored
 * set at one moment, so it always reads everything at the current version and
 * writes exactly one document.
 *
 * The approval gate lives here rather than in the pure selector's caller chain:
 * a configuration that has not been approved still ranks, so its weights can be
 * read against a real population, but nothing may be marked selected on its
 * strength and the cohort is recorded as calibration.
 */

import {
  getHotelOutreachScoreConfig,
  selectOutreachCohort,
  type OutreachSelection,
  type OutreachSelectionRow,
} from '@odysseus/core';
import type { HotelCandidateDocument, HotelScoreDocument } from '@odysseus/store';

export interface CohortSelectionStorePort {
  listLatestScores(scoringVersion: string): Promise<HotelScoreDocument[]>;
  getCandidates(candidateIds: readonly string[]): Promise<HotelCandidateDocument[]>;
  findSuppressedDomains(domains: readonly string[]): Promise<Set<string>>;
  recordCohort(selection: OutreachSelection): Promise<{ cohortId: string }>;
}

export interface SelectCohortOptions {
  store: CohortSelectionStorePort;
  scoringVersion: string;
  qualificationVersion: string;
  /** Compute and report the cohort without writing it. */
  dryRun: boolean;
}

export interface SelectCohortReport {
  scoringVersion: string;
  selectionRuleVersion: string;
  approved: boolean;
  dryRun: boolean;
  scoresRead: number;
  populationSize: number;
  abilityCutoff: number | null;
  brokennessCutoff: number | null;
  selectedCount: number;
  notSelectedByReason: Record<string, number>;
  /** The selected hotels, by domain, so an operator can read the cohort itself
   *  rather than only its size. */
  selectedDomains: string[];
  cohortId: string | null;
}

/** Assembles one selection row from the three facts it takes to build: the
 *  score, the candidate it belongs to, and whether the domain is suppressed. */
function toRow(
  score: HotelScoreDocument,
  candidate: HotelCandidateDocument | undefined,
  suppressed: boolean,
  qualificationVersion: string,
): OutreachSelectionRow {
  return {
    candidateId: score.candidateId,
    scoreId: score.scoreId,
    scoringVersion: score.scoringVersion,
    brokennessTotal: score.brokenness.total,
    abilityTotal: score.ability.total,
    worthy: score.worthy,
    evidenceComplete: score.evidenceComplete,
    // A candidate the catalogue no longer holds at this qualification version
    // fails both gates rather than defaulting to eligible: a re-resolution can
    // move a hotel out of the campaign under a score that is still on file.
    qualified:
      candidate?.qualification?.outcome === 'qualified' &&
      candidate.qualification.qualificationVersion === qualificationVersion,
    campaignEligible: candidate?.campaignEligibility === 'eligible',
    suppressed,
  };
}

export async function selectCohort(options: SelectCohortOptions): Promise<SelectCohortReport> {
  const config = getHotelOutreachScoreConfig(options.scoringVersion);
  const scores = await options.store.listLatestScores(options.scoringVersion);

  const candidates = await options.store.getCandidates(scores.map((score) => score.candidateId));
  const candidateById = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  const suppressedDomains = await options.store.findSuppressedDomains(
    scores.map((score) => score.domain),
  );

  const rows = scores.map((score) =>
    toRow(
      score,
      candidateById.get(score.candidateId),
      suppressedDomains.has(score.domain),
      options.qualificationVersion,
    ),
  );

  const selection = selectOutreachCohort(rows, {
    scoringVersion: options.scoringVersion,
    approved: config.approved,
  });

  const notSelectedByReason: Record<string, number> = {};
  for (const record of selection.records) {
    if (record.state !== 'not-selected') continue;
    notSelectedByReason[record.reason] = (notSelectedByReason[record.reason] ?? 0) + 1;
  }

  const domainByCandidateId = new Map(scores.map((score) => [score.candidateId, score.domain]));
  const selectedDomains = selection.records
    .filter((record) => record.state === 'selected')
    .map((record) => domainByCandidateId.get(record.candidateId) ?? record.candidateId);

  const recorded = options.dryRun ? null : await options.store.recordCohort(selection);

  return {
    scoringVersion: options.scoringVersion,
    selectionRuleVersion: selection.selectionRuleVersion,
    approved: selection.approved,
    dryRun: options.dryRun,
    scoresRead: scores.length,
    populationSize: selection.populationSize,
    abilityCutoff: selection.abilityCutoff,
    brokennessCutoff: selection.brokennessCutoff,
    selectedCount: selection.selectedCount,
    notSelectedByReason,
    selectedDomains,
    cohortId: recorded?.cohortId ?? null,
  };
}
