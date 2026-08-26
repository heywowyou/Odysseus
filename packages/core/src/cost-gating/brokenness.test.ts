import { describe, expect, it } from 'vitest';
import {
  computeBrokennessScore,
  isAuditFallbackEligible,
  isProspectingWorthy,
} from './brokenness.js';
import type { Finding, Severity } from '../types/findings.js';

function buildFinding(severity: Severity, overrides: Partial<Finding> = {}): Finding {
  return {
    findingId: `f-${Math.random()}`,
    auditId: 'a1',
    schemaVersion: 1,
    source: 'axe',
    ruleId: 'color-contrast',
    category: 'accessibility',
    severity,
    wcagCriteria: [],
    title: 't',
    description: 'd',
    pageUrls: ['https://example.com/'],
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    dedupeKey: 'd1',
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    ...overrides,
  };
}

describe('computeBrokennessScore', () => {
  it('sums SEVERITY_ORDER weight across distinct findings, not occurrences', () => {
    const findings = [buildFinding('critical'), buildFinding('serious'), buildFinding('moderate')];
    expect(computeBrokennessScore(findings)).toBe(4 + 3 + 2);
  });

  it('is 0 for no findings', () => {
    expect(computeBrokennessScore([])).toBe(0);
  });
});

describe('isAuditFallbackEligible', () => {
  it('is eligible (skip the LLM) for zero findings', () => {
    expect(isAuditFallbackEligible([])).toBe(true);
  });

  it('is not eligible when any critical finding exists', () => {
    expect(isAuditFallbackEligible([buildFinding('critical')])).toBe(false);
  });

  it('is not eligible when any serious finding exists', () => {
    expect(isAuditFallbackEligible([buildFinding('serious')])).toBe(false);
  });

  it('is eligible with up to 4 moderate findings and nothing higher', () => {
    const findings = Array.from({ length: 4 }, () => buildFinding('moderate'));
    expect(isAuditFallbackEligible(findings)).toBe(true);
  });

  it('is not eligible at exactly 5 moderate findings', () => {
    const findings = Array.from({ length: 5 }, () => buildFinding('moderate'));
    expect(isAuditFallbackEligible(findings)).toBe(false);
  });

  it('is eligible regardless of minor-finding count', () => {
    const findings = Array.from({ length: 50 }, () => buildFinding('minor'));
    expect(isAuditFallbackEligible(findings)).toBe(true);
  });
});

describe('isProspectingWorthy', () => {
  it('is not worthy for zero findings and no render-diff evidence', () => {
    expect(isProspectingWorthy([])).toBe(false);
  });

  it('is worthy with at least one critical finding', () => {
    expect(isProspectingWorthy([buildFinding('critical')])).toBe(true);
  });

  it('is not worthy with only one serious finding', () => {
    expect(isProspectingWorthy([buildFinding('serious')])).toBe(false);
  });

  it('is worthy with at least two serious findings', () => {
    expect(isProspectingWorthy([buildFinding('serious'), buildFinding('serious')])).toBe(true);
  });

  it('is not worthy from moderate/minor findings alone, however many', () => {
    const findings = Array.from({ length: 20 }, () => buildFinding('moderate'));
    expect(isProspectingWorthy(findings)).toBe(false);
  });

  it('is worthy when any page has render-diff missingPercent at or above 50', () => {
    expect(isProspectingWorthy([], [10, 50])).toBe(true);
  });

  it('is not worthy when every render-diff missingPercent is below 50', () => {
    expect(isProspectingWorthy([], [10, 49.9])).toBe(false);
  });
});
