import { describe, expect, it } from 'vitest';
import { isAuditFallbackEligible, isProspectingWorthy, type Finding } from '@odysseus/core';
import { computeComparativeGrade, computeSeverityGrade } from './grade.js';

function findingsFor(
  counts: Record<'critical' | 'serious' | 'moderate' | 'minor', number>,
): Finding[] {
  const findings: Finding[] = [];
  let n = 0;
  for (const [severity, count] of Object.entries(counts) as [keyof typeof counts, number][]) {
    for (let i = 0; i < count; i++) {
      findings.push({
        findingId: `f${n++}`,
        auditId: 'a1',
        schemaVersion: 1,
        source: 'axe',
        ruleId: 'color-contrast',
        category: 'accessibility',
        severity,
        wcagCriteria: [],
        title: 't',
        description: 'd',
        pageUrls: [],
        occurrences: 1,
        elements: [],
        rawEvidence: {},
        dedupeKey: `f${n}`,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      });
    }
  }
  return findings;
}

describe('computeSeverityGrade', () => {
  it('grades a clean site A, exactly isAuditFallbackEligible’s own definition of clean', () => {
    expect(computeSeverityGrade({ critical: 0, serious: 0, moderate: 0, minor: 50 })).toEqual({
      grade: 'A',
      reason: 'clean',
    });
    expect(computeSeverityGrade({ critical: 0, serious: 0, moderate: 4, minor: 0 })).toEqual({
      grade: 'A',
      reason: 'clean',
    });
  });

  it('grades a clean-but-voluminous site B once moderate findings reach the fallback gate’s own cutoff of 5', () => {
    expect(computeSeverityGrade({ critical: 0, serious: 0, moderate: 5, minor: 0 })).toEqual({
      grade: 'B',
      reason: 'moderate-volume',
    });
  });

  it('grades a single serious finding C, one below isProspectingWorthy’s own cutoff of 2', () => {
    expect(computeSeverityGrade({ critical: 0, serious: 1, moderate: 100, minor: 0 })).toEqual({
      grade: 'C',
      reason: 'one-serious-finding',
    });
  });

  it('grades D for any critical finding, exactly isProspectingWorthy’s own cutoff', () => {
    expect(computeSeverityGrade({ critical: 1, serious: 0, moderate: 0, minor: 0 })).toEqual({
      grade: 'D',
      reason: 'critical-finding',
    });
  });

  it('grades D for two or more serious findings, exactly isProspectingWorthy’s own cutoff', () => {
    expect(computeSeverityGrade({ critical: 0, serious: 2, moderate: 0, minor: 0 })).toEqual({
      grade: 'D',
      reason: 'multiple-serious-findings',
    });
  });

  /**
   * Cross-check against the two already-reviewed cost gates
   * (packages/core/src/cost-gating/brokenness.ts), not a call to them
   * (trade-off 38): this grade must never silently drift from "clean
   * enough to skip the LLM" or "clearly worth outreach" now meaning
   * something different than what this grade shows a client.
   */
  it('agrees with isAuditFallbackEligible on what counts as clean', () => {
    const cases = [
      { critical: 0, serious: 0, moderate: 0, minor: 0 },
      { critical: 0, serious: 0, moderate: 4, minor: 0 },
      { critical: 0, serious: 0, moderate: 5, minor: 0 },
      { critical: 0, serious: 1, moderate: 0, minor: 0 },
      { critical: 1, serious: 0, moderate: 0, minor: 0 },
    ];
    for (const counts of cases) {
      const eligible = isAuditFallbackEligible(findingsFor(counts));
      const { grade } = computeSeverityGrade(counts);
      expect(eligible, JSON.stringify(counts)).toBe(grade === 'A');
    }
  });

  it('agrees with isProspectingWorthy on what counts as clearly broken', () => {
    const cases = [
      { critical: 0, serious: 0, moderate: 0, minor: 0 },
      { critical: 0, serious: 1, moderate: 0, minor: 0 },
      { critical: 0, serious: 2, moderate: 0, minor: 0 },
      { critical: 1, serious: 0, moderate: 0, minor: 0 },
    ];
    for (const counts of cases) {
      const worthy = isProspectingWorthy(findingsFor(counts));
      const { grade } = computeSeverityGrade(counts);
      expect(worthy, JSON.stringify(counts)).toBe(grade === 'D');
    }
  });
});

describe('computeComparativeGrade', () => {
  it('gives the top band to a site almost nothing in the cohort beats', () => {
    const result = computeComparativeGrade({
      siteId: 's1',
      score: 2,
      percentile: 5,
      cohortSize: 40,
      scanDateRange: { earliest: '2026-01-01', latest: '2026-02-01' },
    });
    expect(result.grade).toBe('A');
  });

  it('gives the bottom band to a site most of the cohort beats', () => {
    const result = computeComparativeGrade({
      siteId: 's1',
      score: 40,
      percentile: 95,
      cohortSize: 40,
      scanDateRange: { earliest: '2026-01-01', latest: '2026-02-01' },
    });
    expect(result.grade).toBe('D');
  });
});
