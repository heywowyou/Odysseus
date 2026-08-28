import { describe, expect, it } from 'vitest';
import type { HotelCandidateDocument, HotelScoreDocument } from '@odysseus/store';
import type { OutreachSelection } from '@odysseus/core';
import { selectCohort, type CohortSelectionStorePort } from './select-cohort.js';

function score(id: string, overrides: Partial<HotelScoreDocument> = {}): HotelScoreDocument {
  return {
    scoreId: `score-${id}`,
    candidateId: id,
    prescanId: `prescan-${id}`,
    domain: `hotel-${id}.fr`,
    resolutionVersion: 'rv1',
    qualificationVersion: 'qv2',
    prescanVersion: 'pv2',
    scoringVersion: 'hotel-outreach-v1',
    brokenness: { total: 60, components: [] },
    ability: { total: 60, components: [] },
    worthy: true,
    evidenceComplete: true,
    computedAt: new Date(),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
    ...overrides,
  } as unknown as HotelScoreDocument;
}

function candidate(
  id: string,
  overrides: Partial<HotelCandidateDocument> = {},
): HotelCandidateDocument {
  return {
    candidateId: id,
    resolutionVersion: 'rv1',
    campaignEligibility: 'eligible',
    groupStatus: 'independent',
    qualification: { outcome: 'qualified', qualificationVersion: 'qv2', evaluatedAt: new Date() },
    conflicts: [],
    review: { state: 'not-required' },
    ...overrides,
  } as unknown as HotelCandidateDocument;
}

function stubStore(input: {
  scores: HotelScoreDocument[];
  candidates: HotelCandidateDocument[];
  suppressed?: string[];
}): { store: CohortSelectionStorePort; recorded: OutreachSelection[] } {
  const recorded: OutreachSelection[] = [];
  return {
    recorded,
    store: {
      listLatestScores: async () => input.scores,
      getCandidates: async () => input.candidates,
      findSuppressedDomains: async () => new Set(input.suppressed ?? []),
      recordCohort: async (selection) => {
        recorded.push(selection);
        return { cohortId: 'cohort-1' };
      },
    },
  };
}

const baseOptions = {
  scoringVersion: 'hotel-outreach-v1',
  qualificationVersion: 'qv2',
  dryRun: false,
};

describe('selectCohort', () => {
  it('selects the top brokenness decile of the top ability half and records it once', async () => {
    const scores = Array.from({ length: 10 }, (_unused, index) =>
      score(String(index).padStart(2, '0'), {
        brokenness: { total: index * 10, components: [] },
        ability: { total: index * 10, components: [] },
      }),
    );
    const { store, recorded } = stubStore({
      scores,
      candidates: scores.map((row) => candidate(row.candidateId)),
    });

    const report = await selectCohort({ ...baseOptions, store });

    expect(report.populationSize).toBe(10);
    expect(report.selectedCount).toBe(1);
    expect(report.selectedDomains).toEqual(['hotel-09.fr']);
    expect(report.abilityCutoff).toBe(50);
    expect(report.brokennessCutoff).toBe(90);
    expect(report.cohortId).toBe('cohort-1');
    expect(recorded).toHaveLength(1);
  });

  it('drops a suppressed domain before ranking', async () => {
    const scores = [score('a'), score('b')];
    const { store } = stubStore({
      scores,
      candidates: scores.map((row) => candidate(row.candidateId)),
      suppressed: ['hotel-a.fr'],
    });
    const report = await selectCohort({ ...baseOptions, store });
    expect(report.populationSize).toBe(1);
    expect(report.notSelectedByReason).toEqual({ suppressed: 1 });
    expect(report.selectedDomains).toEqual(['hotel-b.fr']);
  });

  it('drops a score whose candidate moved out of the campaign', async () => {
    const scores = [score('a'), score('b')];
    const { store } = stubStore({
      scores,
      candidates: [
        candidate('a', { campaignEligibility: 'parked-below-three-stars' }),
        candidate('b'),
      ],
    });
    const report = await selectCohort({ ...baseOptions, store });
    expect(report.notSelectedByReason).toEqual({ 'not-campaign-eligible': 1 });
  });

  it('drops a score whose candidate is qualified under a different generation', async () => {
    const scores = [score('a')];
    const { store } = stubStore({
      scores,
      candidates: [
        candidate('a', {
          qualification: {
            outcome: 'qualified',
            qualificationVersion: 'qv1',
            evaluatedAt: new Date(),
          },
        } as Partial<HotelCandidateDocument>),
      ],
    });
    const report = await selectCohort({ ...baseOptions, store });
    expect(report.notSelectedByReason).toEqual({ 'not-qualified': 1 });
  });

  it('drops a score whose candidate no longer exists at all', async () => {
    const { store } = stubStore({ scores: [score('a')], candidates: [] });
    const report = await selectCohort({ ...baseOptions, store });
    expect(report.notSelectedByReason).toEqual({ 'not-qualified': 1 });
  });

  it('writes nothing on a dry run', async () => {
    const scores = [score('a')];
    const { store, recorded } = stubStore({
      scores,
      candidates: [candidate('a')],
    });
    const report = await selectCohort({ ...baseOptions, store, dryRun: true });
    expect(recorded).toHaveLength(0);
    expect(report.cohortId).toBeNull();
    expect(report.selectedCount).toBe(1);
  });
});
