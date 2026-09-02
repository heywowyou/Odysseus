import { describe, expect, it } from 'vitest';
import {
  ContinuationGuard,
  classifyContinuationLink,
  computeRepeatedQueryKeys,
} from './continuation-guard.js';

describe('classifyContinuationLink', () => {
  const base = {
    targetUrl: 'https://example.com/blog/page/2',
    sourcePageUrl: 'https://example.com/blog/page/1',
    relNext: false,
    isNumberedPaginationControl: false,
    sourceIsConfirmedListing: false,
    repeatedQueryKeysOnSourcePage: new Set<string>(),
  };

  it('classifies rel=next as a continuation with a placeholder path family key', () => {
    const result = classifyContinuationLink({ ...base, relNext: true });
    expect(result).toEqual({
      isContinuation: true,
      basis: 'rel-next',
      familyKey: 'path:/blog/page/{n}',
    });
  });

  it('classifies a numbered pagination control as a continuation', () => {
    const result = classifyContinuationLink({ ...base, isNumberedPaginationControl: true });
    expect(result).toEqual({
      isContinuation: true,
      basis: 'numbered-pagination-control',
      familyKey: 'path:/blog/page/{n}',
    });
  });

  it('only replaces path segments that are purely digits, never a mixed segment', () => {
    const result = classifyContinuationLink({
      ...base,
      targetUrl: 'https://example.com/author/hotelarcachon022/page/30',
      relNext: true,
    });
    expect(result).toEqual({
      isContinuation: true,
      basis: 'rel-next',
      familyKey: 'path:/author/hotelarcachon022/page/{n}',
    });
  });

  it('classifies a repeated query key on a confirmed listing as a continuation', () => {
    const result = classifyContinuationLink({
      ...base,
      targetUrl: 'https://example.com/blog?paged=2',
      sourcePageUrl: 'https://example.com/blog',
      sourceIsConfirmedListing: true,
      repeatedQueryKeysOnSourcePage: new Set(['paged']),
    });
    expect(result).toEqual({
      isContinuation: true,
      basis: 'query-key-family',
      familyKey: 'query:/blog:paged',
    });
  });

  it('does not treat a repeated query key as a continuation unless the source is a confirmed listing', () => {
    const result = classifyContinuationLink({
      ...base,
      targetUrl: 'https://example.com/blog?paged=2',
      sourceIsConfirmedListing: false,
      repeatedQueryKeysOnSourcePage: new Set(['paged']),
    });
    expect(result).toEqual({ isContinuation: false });
  });

  it('never treats rel=prev as a continuation', () => {
    const result = classifyContinuationLink({ ...base, relNext: false });
    expect(result).toEqual({ isContinuation: false });
  });

  it('never infers continuation from a numeric-looking path alone', () => {
    const result = classifyContinuationLink(base);
    expect(result).toEqual({ isContinuation: false });
  });
});

describe('computeRepeatedQueryKeys', () => {
  it('returns only keys present on two or more distinct URLs', () => {
    const keys = computeRepeatedQueryKeys([
      'https://example.com/blog?paged=1',
      'https://example.com/blog?paged=2',
      'https://example.com/blog?filter=red',
      'https://example.com/other',
    ]);
    expect(keys).toEqual(new Set(['paged']));
  });

  it('ignores malformed URLs rather than throwing', () => {
    expect(() =>
      computeRepeatedQueryKeys(['not a url', 'https://example.com/blog?a=1']),
    ).not.toThrow();
  });
});

describe('ContinuationGuard', () => {
  it('admits every link up to the configured threshold, then omits the rest', () => {
    const guard = new ContinuationGuard(3);
    const classification = { basis: 'rel-next' as const, familyKey: 'path:/blog/page/{n}' };

    expect(guard.admit(classification, 'https://example.com/blog/page/1')).toBe(true);
    expect(guard.admit(classification, 'https://example.com/blog/page/2')).toBe(true);
    expect(guard.admit(classification, 'https://example.com/blog/page/3')).toBe(true);
    expect(guard.admit(classification, 'https://example.com/blog/page/4')).toBe(false);
    expect(guard.admit(classification, 'https://example.com/blog/page/5')).toBe(false);

    const summary = guard.summary();
    expect(summary.families).toHaveLength(1);
    expect(summary.families[0]).toEqual({
      familyKey: 'path:/blog/page/{n}',
      basis: 'rel-next',
      enqueuedCount: 3,
      omittedCount: 2,
      omittedExampleUrls: ['https://example.com/blog/page/4', 'https://example.com/blog/page/5'],
    });
    expect(summary.totalOmittedUrlCount).toBe(2);
    expect(summary.additionalFamiliesOmittedCount).toBe(0);
  });

  it('never omits a finite family that stays under the threshold', () => {
    const guard = new ContinuationGuard(60);
    const classification = { basis: 'rel-next' as const, familyKey: 'path:/blog/page/{n}' };
    for (let i = 1; i <= 30; i++) {
      expect(guard.admit(classification, `https://example.com/blog/page/${i}`)).toBe(true);
    }
    expect(guard.summary().families).toHaveLength(0);
    expect(guard.summary().totalOmittedUrlCount).toBe(0);
  });

  it('caps examples per family at three, sorted', () => {
    const guard = new ContinuationGuard(1);
    const classification = { basis: 'rel-next' as const, familyKey: 'path:/x/{n}' };
    guard.admit(classification, 'https://example.com/x/1');
    guard.admit(classification, 'https://example.com/x/9');
    guard.admit(classification, 'https://example.com/x/5');
    guard.admit(classification, 'https://example.com/x/2');
    guard.admit(classification, 'https://example.com/x/8');

    const family = guard.summary().families[0];
    expect(family?.omittedExampleUrls).toHaveLength(3);
    expect(family?.omittedExampleUrls).toEqual([...family!.omittedExampleUrls].sort());
    expect(family?.omittedCount).toBe(4);
  });

  it('caps persisted families at 100, sorted by family key, and preserves the true total', () => {
    const guard = new ContinuationGuard(0);
    for (let i = 0; i < 105; i++) {
      const familyKey = `path:/family-${String(i).padStart(3, '0')}/{n}`;
      guard.admit({ basis: 'rel-next', familyKey }, `https://example.com/family-${i}/1`);
    }
    const summary = guard.summary();
    expect(summary.families).toHaveLength(100);
    expect(summary.additionalFamiliesOmittedCount).toBe(5);
    expect(summary.totalOmittedUrlCount).toBe(105);
    const sortedKeys = summary.families.map((f) => f.familyKey);
    expect(sortedKeys).toEqual([...sortedKeys].sort());
  });

  it('never reports a family that never omitted anything', () => {
    const guard = new ContinuationGuard(60);
    guard.admit(
      { basis: 'query-key-family', familyKey: 'query:/blog:paged' },
      'https://example.com/blog?paged=2',
    );
    expect(guard.summary().families).toHaveLength(0);
  });
});
