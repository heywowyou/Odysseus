/**
 * Milestone 9c plan 006: which scored hotels become this cohort.
 *
 * The rule is top brokenness decile within the top ability half. Ability first
 * is deliberate and is not a tie-break preference: contacting the most broken
 * sites in the country would mostly mean contacting hotels that cannot act on
 * the report, so ability decides who is eligible to be ranked at all, and
 * brokenness then decides who is most worth the email among them.
 *
 * Pure, and pure over the *whole population* rather than one row at a time: a
 * decile is a property of a set, so this function is given every scored row and
 * returns a verdict for every one of them. Callers never filter first and rank
 * after - that would compute a decile of an already-filtered set and quietly
 * change the rule.
 */

export const SELECTION_RULE_VERSION = 'half-ability-decile-brokenness-v1';

/** Same ability-half gate, but the top brokenness quintile (20%) rather than
 *  the decile (10%). A separate version, never a mutation of the one above:
 *  a past cohort recorded under the decile rule must stay reproducible.
 *  Selecting under this version requires the caller to opt in explicitly. */
export const SELECTION_RULE_VERSION_QUINTILE = 'half-ability-quintile-brokenness-v1';

export type OutreachSelectionState =
  | 'selected'
  | 'not-selected'
  /** The scoring configuration is not approved, so nothing may be selected on
   *  its strength. Ranking still runs, so the weights can be read against a
   *  real population before anybody is contacted. */
  | 'calibration';

export type OutreachSelectionReason =
  | 'top-brokenness-decile'
  | 'top-brokenness-quintile'
  | 'below-brokenness-cutoff'
  | 'below-ability-cutoff'
  | 'not-qualified'
  | 'not-campaign-eligible'
  | 'evidence-incomplete'
  | 'not-worthy'
  | 'suppressed'
  | 'scoring-version-mismatch'
  | 'configuration-not-approved';

/** One scored candidate, resolved by the caller. Deliberately flat facts, not
 *  documents: this function must be testable without a database. */
export interface OutreachSelectionRow {
  candidateId: string;
  scoreId: string;
  scoringVersion: string;
  brokennessTotal: number;
  abilityTotal: number;
  worthy: boolean;
  evidenceComplete: boolean;
  qualified: boolean;
  campaignEligible: boolean;
  suppressed: boolean;
}

export interface OutreachSelectionRecord {
  candidateId: string;
  scoreId: string;
  state: OutreachSelectionState;
  reason: OutreachSelectionReason;
  /** Rank within the eligible population, 1-based, ordered by ability then
   *  brokenness. Absent for a row that never entered ranking. */
  rank?: number;
}

export interface OutreachSelectionOptions {
  scoringVersion: string;
  /** False leaves every eligible row in `calibration`. */
  approved: boolean;
  /** Which brokenness band within the top ability half counts as selected.
   *  Defaults to the decile rule so every existing caller is unaffected. */
  selectionRuleVersion?: string;
}

/** The brokenness fraction and selected-reason for one selection rule
 *  version. Throws on an unrecognized version rather than silently falling
 *  back to a fraction nobody chose. */
function ruleConfig(selectionRuleVersion: string): {
  brokennessFraction: number;
  selectedReason: OutreachSelectionReason;
} {
  switch (selectionRuleVersion) {
    case SELECTION_RULE_VERSION:
      return { brokennessFraction: 10, selectedReason: 'top-brokenness-decile' };
    case SELECTION_RULE_VERSION_QUINTILE:
      return { brokennessFraction: 5, selectedReason: 'top-brokenness-quintile' };
    default:
      throw new Error(
        `selectOutreachCohort: unknown selection rule version '${selectionRuleVersion}'`,
      );
  }
}

export interface OutreachSelection {
  selectionRuleVersion: string;
  scoringVersion: string;
  approved: boolean;
  /** Rows that cleared every gate and entered ranking. */
  populationSize: number;
  /** The lowest ability total that stayed in the top half, and the lowest
   *  brokenness total that stayed in the decile. Null when nothing ranked. */
  abilityCutoff: number | null;
  brokennessCutoff: number | null;
  selectedCount: number;
  records: OutreachSelectionRecord[];
}

/** Every gate a row must clear before it is ranked, in a fixed order so the
 *  reason a row was dropped does not depend on how the facts arrived. */
function ineligibleReason(
  row: OutreachSelectionRow,
  scoringVersion: string,
): OutreachSelectionReason | null {
  if (row.scoringVersion !== scoringVersion) return 'scoring-version-mismatch';
  if (row.suppressed) return 'suppressed';
  if (!row.qualified) return 'not-qualified';
  if (!row.campaignEligible) return 'not-campaign-eligible';
  if (!row.evidenceComplete) return 'evidence-incomplete';
  if (!row.worthy) return 'not-worthy';
  return null;
}

/**
 * Ties are broken on `candidateId` ascending, never left to sort stability.
 * Two hotels with identical scores must land on the same side of a cutoff on
 * every machine and in every run, or a rescore would show phantom movement.
 */
function compareByAbility(a: OutreachSelectionRow, b: OutreachSelectionRow): number {
  if (a.abilityTotal !== b.abilityTotal) return b.abilityTotal - a.abilityTotal;
  if (a.brokennessTotal !== b.brokennessTotal) return b.brokennessTotal - a.brokennessTotal;
  return a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0;
}

function compareByBrokenness(a: OutreachSelectionRow, b: OutreachSelectionRow): number {
  if (a.brokennessTotal !== b.brokennessTotal) return b.brokennessTotal - a.brokennessTotal;
  if (a.abilityTotal !== b.abilityTotal) return b.abilityTotal - a.abilityTotal;
  return a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0;
}

export function selectOutreachCohort(
  rows: readonly OutreachSelectionRow[],
  options: OutreachSelectionOptions,
): OutreachSelection {
  const selectionRuleVersion = options.selectionRuleVersion ?? SELECTION_RULE_VERSION;
  const { brokennessFraction, selectedReason } = ruleConfig(selectionRuleVersion);

  const records: OutreachSelectionRecord[] = [];
  const eligible: OutreachSelectionRow[] = [];

  for (const row of rows) {
    const reason = ineligibleReason(row, options.scoringVersion);
    if (reason === null) eligible.push(row);
    else
      records.push({
        candidateId: row.candidateId,
        scoreId: row.scoreId,
        state: 'not-selected',
        reason,
      });
  }

  // Rounding up in both places, so a small population still produces a cohort
  // of one rather than of none. `Math.floor` would make every population under
  // twenty select nobody, which reads as a broken selector rather than as a
  // deliberately empty cohort.
  const byAbility = [...eligible].sort(compareByAbility);
  const topHalf = byAbility.slice(0, Math.ceil(byAbility.length / 2));
  const abilityCutoff =
    topHalf.length === 0
      ? null
      : (topHalf[topHalf.length - 1] as OutreachSelectionRow).abilityTotal;

  const byBrokenness = [...topHalf].sort(compareByBrokenness);
  const band = byBrokenness.slice(0, Math.ceil(byBrokenness.length / brokennessFraction));
  const brokennessCutoff =
    band.length === 0 ? null : (band[band.length - 1] as OutreachSelectionRow).brokennessTotal;

  const selectedIds = new Set(band.map((row) => row.candidateId));
  const rankByCandidateId = new Map<string, number>();
  byBrokenness.forEach((row, index) => rankByCandidateId.set(row.candidateId, index + 1));

  let selectedCount = 0;
  for (const row of byAbility) {
    const inTopHalf = rankByCandidateId.has(row.candidateId);
    const rank = rankByCandidateId.get(row.candidateId);
    if (!inTopHalf) {
      records.push({
        candidateId: row.candidateId,
        scoreId: row.scoreId,
        state: 'not-selected',
        reason: 'below-ability-cutoff',
      });
      continue;
    }
    if (!selectedIds.has(row.candidateId)) {
      records.push({
        candidateId: row.candidateId,
        scoreId: row.scoreId,
        state: 'not-selected',
        reason: 'below-brokenness-cutoff',
        ...(rank === undefined ? {} : { rank }),
      });
      continue;
    }
    if (!options.approved) {
      records.push({
        candidateId: row.candidateId,
        scoreId: row.scoreId,
        state: 'calibration',
        reason: 'configuration-not-approved',
        ...(rank === undefined ? {} : { rank }),
      });
      continue;
    }
    selectedCount += 1;
    records.push({
      candidateId: row.candidateId,
      scoreId: row.scoreId,
      state: 'selected',
      reason: selectedReason,
      ...(rank === undefined ? {} : { rank }),
    });
  }

  records.sort((a, b) =>
    a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0,
  );

  return {
    selectionRuleVersion,
    scoringVersion: options.scoringVersion,
    approved: options.approved,
    populationSize: eligible.length,
    abilityCutoff,
    brokennessCutoff,
    selectedCount,
    records,
  };
}
