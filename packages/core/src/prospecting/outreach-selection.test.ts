import { describe, it, expect } from 'vitest';
import {
  SELECTION_RULE_VERSION,
  SELECTION_RULE_VERSION_QUINTILE,
  selectOutreachCohort,
  type OutreachSelectionRow,
} from './outreach-selection.js';

/** An eligible row at the current version. Each test names only what it
 *  changes, so a test's subject is visible without reading the baseline. */
function row(overrides: Partial<OutreachSelectionRow> = {}): OutreachSelectionRow {
  return {
    candidateId: 'candidate-001',
    scoreId: 'score-001',
    scoringVersion: 'hotel-outreach-v1',
    brokennessTotal: 50,
    abilityTotal: 50,
    worthy: true,
    evidenceComplete: true,
    qualified: true,
    campaignEligible: true,
    suppressed: false,
    ...overrides,
  };
}

function population(
  count: number,
  shape: (index: number) => Partial<OutreachSelectionRow>,
): OutreachSelectionRow[] {
  return Array.from({ length: count }, (_unused, index) =>
    row({
      candidateId: `candidate-${String(index).padStart(3, '0')}`,
      scoreId: `score-${String(index).padStart(3, '0')}`,
      ...shape(index),
    }),
  );
}

const approved = { scoringVersion: 'hotel-outreach-v1', approved: true };

describe('selectOutreachCohort gates', () => {
  it('returns nothing and no cutoffs for an empty population', () => {
    const selection = selectOutreachCohort([], approved);
    expect(selection).toEqual({
      selectionRuleVersion: SELECTION_RULE_VERSION,
      scoringVersion: 'hotel-outreach-v1',
      approved: true,
      populationSize: 0,
      abilityCutoff: null,
      brokennessCutoff: null,
      selectedCount: 0,
      records: [],
    });
  });

  it('drops every ineligible row with its own reason', () => {
    const rows = [
      row({ candidateId: 'a', scoringVersion: 'hotel-outreach-v0' }),
      row({ candidateId: 'b', suppressed: true }),
      row({ candidateId: 'c', qualified: false }),
      row({ candidateId: 'd', campaignEligible: false }),
      row({ candidateId: 'e', evidenceComplete: false }),
      row({ candidateId: 'f', worthy: false }),
    ];
    const selection = selectOutreachCohort(rows, approved);
    expect(selection.populationSize).toBe(0);
    expect(selection.records.map((record) => [record.candidateId, record.reason])).toEqual([
      ['a', 'scoring-version-mismatch'],
      ['b', 'suppressed'],
      ['c', 'not-qualified'],
      ['d', 'not-campaign-eligible'],
      ['e', 'evidence-incomplete'],
      ['f', 'not-worthy'],
    ]);
    expect(selection.records.every((record) => record.state === 'not-selected')).toBe(true);
  });

  it('checks suppression before every other gate', () => {
    const selection = selectOutreachCohort([row({ suppressed: true, worthy: false })], approved);
    expect(selection.records[0]?.reason).toBe('suppressed');
  });

  it('scores a mixed-version population against the requested version only', () => {
    const rows = [
      row({ candidateId: 'a', scoringVersion: 'hotel-outreach-v1', brokennessTotal: 10 }),
      row({ candidateId: 'b', scoringVersion: 'hotel-outreach-v0', brokennessTotal: 99 }),
    ];
    const selection = selectOutreachCohort(rows, approved);
    expect(selection.populationSize).toBe(1);
    expect(selection.records.find((record) => record.candidateId === 'a')?.state).toBe('selected');
  });
});

describe('selectOutreachCohort ranking', () => {
  it('selects the single eligible hotel rather than nobody', () => {
    const selection = selectOutreachCohort([row()], approved);
    expect(selection.selectedCount).toBe(1);
    expect(selection.abilityCutoff).toBe(50);
    expect(selection.brokennessCutoff).toBe(50);
    expect(selection.records[0]).toEqual({
      candidateId: 'candidate-001',
      scoreId: 'score-001',
      state: 'selected',
      reason: 'top-brokenness-decile',
      rank: 1,
    });
  });

  it('takes the top ability half, then the top brokenness decile of that half', () => {
    // Ability descends with the index, brokenness ascends, so the two rules
    // disagree and the order they are applied in is observable.
    const rows = population(100, (index) => ({
      abilityTotal: 100 - index,
      brokennessTotal: index,
    }));
    const selection = selectOutreachCohort(rows, approved);
    expect(selection.populationSize).toBe(100);
    expect(selection.abilityCutoff).toBe(51);
    expect(selection.selectedCount).toBe(5);
    const selected = selection.records.filter((record) => record.state === 'selected');
    expect(selected.map((record) => record.candidateId)).toEqual([
      'candidate-045',
      'candidate-046',
      'candidate-047',
      'candidate-048',
      'candidate-049',
    ]);
    expect(selection.brokennessCutoff).toBe(45);
  });

  it('rounds both cutoffs up on a small population', () => {
    const rows = population(9, (index) => ({ abilityTotal: 90 - index, brokennessTotal: index }));
    const selection = selectOutreachCohort(rows, approved);
    // Five of nine in the top half, one of five in its decile.
    expect(
      selection.records.filter((record) => record.reason === 'below-ability-cutoff'),
    ).toHaveLength(4);
    expect(selection.selectedCount).toBe(1);
    expect(selection.records.find((record) => record.state === 'selected')?.candidateId).toBe(
      'candidate-004',
    );
  });

  it('breaks ties on candidateId rather than on input order', () => {
    const rows = population(20, () => ({ abilityTotal: 50, brokennessTotal: 50 }));
    const forward = selectOutreachCohort(rows, approved);
    const reversed = selectOutreachCohort([...rows].reverse(), approved);
    expect(reversed).toEqual(forward);
    expect(
      forward.records.filter((record) => record.state === 'selected').map((r) => r.candidateId),
    ).toEqual(['candidate-000']);
  });

  it('distinguishes a row below the ability cutoff from one below the brokenness cutoff', () => {
    const rows = population(4, (index) => ({ abilityTotal: 40 - index, brokennessTotal: index }));
    const selection = selectOutreachCohort(rows, approved);
    const reasons = Object.fromEntries(
      selection.records.map((record) => [record.candidateId, record.reason]),
    );
    expect(reasons['candidate-002']).toBe('below-ability-cutoff');
    expect(reasons['candidate-003']).toBe('below-ability-cutoff');
    expect(reasons['candidate-000']).toBe('below-brokenness-cutoff');
    expect(reasons['candidate-001']).toBe('top-brokenness-decile');
  });

  it('ranks only rows inside the top ability half', () => {
    const rows = population(4, (index) => ({ abilityTotal: 40 - index, brokennessTotal: index }));
    const selection = selectOutreachCohort(rows, approved);
    const ranked = selection.records.filter((record) => record.rank !== undefined);
    expect(ranked.map((record) => record.rank)).toEqual([2, 1]);
  });
});

describe('selectOutreachCohort selection rule version', () => {
  it('rejects an unrecognized selection rule version', () => {
    expect(() =>
      selectOutreachCohort([row()], { ...approved, selectionRuleVersion: 'made-up-v1' }),
    ).toThrow(/unknown selection rule version/);
  });

  it('selects the top brokenness quintile of the ability half when asked', () => {
    const rows = population(100, (index) => ({
      abilityTotal: 100 - index,
      brokennessTotal: index,
    }));
    const selection = selectOutreachCohort(rows, {
      ...approved,
      selectionRuleVersion: SELECTION_RULE_VERSION_QUINTILE,
    });
    expect(selection.selectionRuleVersion).toBe(SELECTION_RULE_VERSION_QUINTILE);
    expect(selection.abilityCutoff).toBe(51);
    // Twice the decile's 5, since a fifth of the top half is twice a tenth.
    expect(selection.selectedCount).toBe(10);
    expect(selection.brokennessCutoff).toBe(40);
    const selected = selection.records.filter((record) => record.state === 'selected');
    expect(selected.every((record) => record.reason === 'top-brokenness-quintile')).toBe(true);
  });

  it('still applies the decile rule when no version is requested', () => {
    const rows = population(100, (index) => ({
      abilityTotal: 100 - index,
      brokennessTotal: index,
    }));
    const selection = selectOutreachCohort(rows, approved);
    expect(selection.selectionRuleVersion).toBe(SELECTION_RULE_VERSION);
    expect(selection.selectedCount).toBe(5);
  });
});

describe('selectOutreachCohort approval', () => {
  it('selects nobody and reports calibration when the configuration is unapproved', () => {
    const rows = population(10, (index) => ({ abilityTotal: 50 + index, brokennessTotal: index }));
    const selection = selectOutreachCohort(rows, {
      scoringVersion: 'hotel-outreach-v1',
      approved: false,
    });
    expect(selection.selectedCount).toBe(0);
    const calibration = selection.records.filter((record) => record.state === 'calibration');
    expect(calibration).toHaveLength(1);
    expect(calibration[0]?.reason).toBe('configuration-not-approved');
    // The ranking still happened, which is the point of a calibration run.
    expect(selection.abilityCutoff).toBe(55);
    expect(selection.brokennessCutoff).toBe(9);
  });
});
