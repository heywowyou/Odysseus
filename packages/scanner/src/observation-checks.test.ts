import { describe, expect, it } from 'vitest';
import { CUSTOM_CHECK_SEVERITY, HEURISTIC_RULE_IDS } from '@odysseus/core';
import {
  findingDisposition,
  MAPPED_CUSTOM_RULE_IDS,
  observationCheckId,
} from './observation-checks.js';

describe('observation check mapping', () => {
  it('declares a source check for every custom rule the normalizer can emit', () => {
    const unmapped = Object.keys(CUSTOM_CHECK_SEVERITY).filter(
      (ruleId) => !MAPPED_CUSTOM_RULE_IDS.includes(ruleId),
    );
    expect(unmapped).toEqual([]);
  });

  it('maps tool-family sources directly', () => {
    expect(observationCheckId({ source: 'axe', ruleId: 'image-alt' })).toBe('axe');
    expect(observationCheckId({ source: 'lighthouse', ruleId: 'largest-contentful-paint' })).toBe(
      'lighthouse',
    );
    expect(observationCheckId({ source: 'renderdiff', ruleId: 'content-missing' })).toBe(
      'render-diff',
    );
    expect(observationCheckId({ source: 'custom', ruleId: 'not-a-rule' })).toBeUndefined();
  });

  it('treats every heuristic rule as a signal and nothing else', () => {
    for (const ruleId of HEURISTIC_RULE_IDS) {
      expect(findingDisposition({ ruleId })).toBe('signal');
    }
    expect(findingDisposition({ ruleId: 'image-alt' })).toBe('confirmed');
  });
});
