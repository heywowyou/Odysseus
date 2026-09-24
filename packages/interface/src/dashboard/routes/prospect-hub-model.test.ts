import { describe, expect, it } from 'vitest';
import { deletionImpactSummary, type ProspectDeletionImpact } from './prospect-hub-model';

const labels: Record<keyof ProspectDeletionImpact, string> = {
  audits: '{count} scan(s)',
  findings: '{count} constat(s)',
  analyses: '{count} analyse(s)',
  reports: '{count} rapport(s)',
  reportApprovals: '{count} validation(s)',
  reportQualityLeases: '{count} bail qualité',
  reportQualityRuns: '{count} exécution qualité',
  reportBundles: '{count} bundle',
  activeReportBundles: '{count} bundle actif',
  previews: '{count} aperçu(s)',
  drafts: '{count} brouillon(s)',
  threads: '{count} fil(s)',
  outcomes: '{count} résultat(s)',
  events: '{count} événement(s)',
  jobs: '{count} tâche(s)',
  directoryEntries: '{count} lien(s)',
};

describe('deletionImpactSummary', () => {
  it('names only what would actually be removed, in a stable order', () => {
    const impact: ProspectDeletionImpact = {
      audits: 2,
      findings: 40,
      analyses: 0,
      reports: 1,
      reportApprovals: 0,
      reportQualityLeases: 0,
      reportQualityRuns: 0,
      reportBundles: 0,
      activeReportBundles: 0,
      previews: 0,
      drafts: 0,
      threads: 0,
      outcomes: 0,
      events: 5,
      jobs: 0,
      directoryEntries: 1,
    };
    expect(deletionImpactSummary(impact, labels)).toEqual([
      '2 scan(s)',
      '40 constat(s)',
      '1 rapport(s)',
      '5 événement(s)',
      '1 lien(s)',
    ]);
  });
});
