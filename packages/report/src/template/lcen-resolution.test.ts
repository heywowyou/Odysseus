import { describe, expect, it } from 'vitest';
import {
  FINDINGS_SCHEMA_VERSION,
  LCEN_MENTIONS_LEGALES_RULE_ID,
  type Finding,
} from '@odysseus/core';
import { resolveLcenFinding } from './lcen-resolution.js';

function buildFinding(ruleId: string): Finding {
  return {
    findingId: `f-${ruleId}`,
    auditId: 'audit-1',
    schemaVersion: FINDINGS_SCHEMA_VERSION,
    source: 'custom',
    ruleId,
    category: 'seo',
    severity: 'moderate',
    wcagCriteria: [],
    title: ruleId,
    description: '',
    pageUrls: ['https://client.example/mentions-legales'],
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    dedupeKey: ruleId,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
  };
}

describe('resolveLcenFinding', () => {
  it('leaves findings untouched when no sirenSourceUrl is supplied (siren alone must not suppress it)', () => {
    const findings = [buildFinding(LCEN_MENTIONS_LEGALES_RULE_ID), buildFinding('other-rule')];
    const result = resolveLcenFinding(findings, undefined);
    expect(result.findings).toEqual(findings);
    expect(result.resolvedSirenSourceUrl).toBeUndefined();
  });

  it('suppresses the finding and returns the source URL when sirenSourceUrl is supplied', () => {
    const findings = [buildFinding(LCEN_MENTIONS_LEGALES_RULE_ID), buildFinding('other-rule')];
    const result = resolveLcenFinding(findings, 'https://client.example/mentions-legales');
    expect(result.findings.map((f) => f.ruleId)).toEqual(['other-rule']);
    expect(result.resolvedSirenSourceUrl).toBe('https://client.example/mentions-legales');
  });

  it('resolves nothing when sirenSourceUrl is supplied but the finding never fired', () => {
    const findings = [buildFinding('other-rule')];
    const result = resolveLcenFinding(findings, 'https://client.example/mentions-legales');
    expect(result.findings).toEqual(findings);
    expect(result.resolvedSirenSourceUrl).toBeUndefined();
  });
});
