import { describe, expect, it } from 'vitest';
import {
  extractCanonicalTargetCandidates,
  CANONICAL_TARGET_UNREACHABLE_RULE_ID,
  CANONICAL_TARGET_NOINDEX_RULE_ID,
  type CanonicalTargetCheckInput,
} from './normalize-canonical-target.js';

const PAGE_URL = 'https://example.com/page';
const CANONICAL_URL = 'https://example.com/canonical-target';

function baseInput(overrides: Partial<CanonicalTargetCheckInput> = {}): CanonicalTargetCheckInput {
  return {
    pageUrl: PAGE_URL,
    canonicalUrl: CANONICAL_URL,
    httpStatus: 200,
    noindex: false,
    ...overrides,
  };
}

describe('canonical-target-unreachable', () => {
  it('fires when the target returned an HTTP error status', () => {
    const candidates = extractCanonicalTargetCandidates(baseInput({ httpStatus: 404 }));
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.ruleId).toBe(CANONICAL_TARGET_UNREACHABLE_RULE_ID);
    expect(candidates[0]?.category).toBe('seo');
    expect(candidates[0]?.severity).toBe('serious');
    expect(candidates[0]?.pageUrl).toBe(PAGE_URL);
    expect(candidates[0]?.element).toBeNull();
  });

  it('fires when the target could not be fetched at all', () => {
    const candidates = extractCanonicalTargetCandidates(baseInput({ fetchError: 'ETIMEDOUT' }));
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.ruleId).toBe(CANONICAL_TARGET_UNREACHABLE_RULE_ID);
    expect(candidates[0]?.description).toMatch(/ETIMEDOUT/);
  });

  it('does not also report noindex when the target is unreachable', () => {
    const candidates = extractCanonicalTargetCandidates(
      baseInput({ httpStatus: 500, noindex: true }),
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.ruleId).toBe(CANONICAL_TARGET_UNREACHABLE_RULE_ID);
  });

  it('does not fire for a healthy, non-noindex target', () => {
    expect(extractCanonicalTargetCandidates(baseInput())).toEqual([]);
  });
});

describe('canonical-target-noindex', () => {
  it('fires when the reachable target carries a noindex directive', () => {
    const candidates = extractCanonicalTargetCandidates(baseInput({ noindex: true }));
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.ruleId).toBe(CANONICAL_TARGET_NOINDEX_RULE_ID);
    expect(candidates[0]?.category).toBe('seo');
    expect(candidates[0]?.severity).toBe('moderate');
    expect(candidates[0]?.pageUrl).toBe(PAGE_URL);
  });

  it('does not fire when the target is reachable and indexable', () => {
    expect(extractCanonicalTargetCandidates(baseInput({ noindex: false }))).toEqual([]);
  });
});
