import { describe, expect, it } from 'vitest';
import {
  extractRenderDiffCandidates,
  unusableRawFetches,
  RENDERDIFF_RULE_ID,
  type RawFetchInput,
} from './normalize-renderdiff.js';
import { buildRenderDiffResult } from './fixtures.js';

describe('extractRenderDiffCandidates', () => {
  it('emits nothing below the emission threshold (19%)', () => {
    const result = buildRenderDiffResult({ missingPercent: 19 });
    expect(extractRenderDiffCandidates(result, result.pageUrl)).toEqual([]);
  });

  it('emits exactly one page-scoped candidate at the threshold (20%)', () => {
    const result = buildRenderDiffResult({ missingPercent: 20 });
    const candidates = extractRenderDiffCandidates(result, result.pageUrl);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.element).toBeNull();
    expect(candidates[0]?.source).toBe('renderdiff');
    expect(candidates[0]?.ruleId).toBe(RENDERDIFF_RULE_ID);
    expect(candidates[0]?.category).toBe('rendering');
  });

  it('maps severity via severityFromRenderDiff', () => {
    expect(
      extractRenderDiffCandidates(buildRenderDiffResult({ missingPercent: 99 }), 'u')[0]?.severity,
    ).toBe('critical');
    expect(
      extractRenderDiffCandidates(buildRenderDiffResult({ missingPercent: 60 }), 'u')[0]?.severity,
    ).toBe('serious');
    expect(
      extractRenderDiffCandidates(buildRenderDiffResult({ missingPercent: 25 }), 'u')[0]?.severity,
    ).toBe('moderate');
  });

  it('stores the full RenderDiffResult in rawEvidenceForPage, not just the percentage', () => {
    const result = buildRenderDiffResult({ missingPercent: 50, httpStatus: 200 });
    const candidates = extractRenderDiffCandidates(result, result.pageUrl);
    expect(candidates[0]?.rawEvidenceForPage).toEqual(result);
  });

  it('does not embed the percentage in the static title/description', () => {
    const result = buildRenderDiffResult({ missingPercent: 50 });
    const candidates = extractRenderDiffCandidates(result, result.pageUrl);
    expect(candidates[0]?.title).not.toMatch(/\d/);
    expect(candidates[0]?.description).not.toMatch(/50/);
  });
});

describe('unusableRawFetches (issue #301)', () => {
  function page(overrides: Partial<RawFetchInput> & { pageUrl: string }): RawFetchInput {
    return {
      httpStatus: 200,
      rawDocument: {
        markupLength: 4000,
        textSignature: overrides.pageUrl,
        interstitialMarkers: [],
      },
      ...overrides,
    };
  }

  it('finds nothing wrong with ordinary pages serving their own documents', () => {
    expect(
      unusableRawFetches([page({ pageUrl: 'a' }), page({ pageUrl: 'b' }), page({ pageUrl: 'c' })]),
    ).toEqual(new Map());
  });

  it('rejects a raw fetch that received an interstitial', () => {
    const pages = [
      page({
        pageUrl: 'a',
        rawDocument: {
          markupLength: 9000,
          textSignature: 'sig-a',
          interstitialMarkers: ['bot-challenge'],
        },
      }),
      page({ pageUrl: 'b' }),
    ];
    expect(unusableRawFetches(pages).get('a')).toEqual({
      kind: 'interstitial',
      markers: ['bot-challenge'],
    });
    expect(unusableRawFetches(pages).has('b')).toBe(false);
  });

  it('rejects a raw fetch that answered with an error status', () => {
    expect(unusableRawFetches([page({ pageUrl: 'a', httpStatus: 403 })]).get('a')).toEqual({
      kind: 'http-error',
      httpStatus: 403,
    });
  });

  it('rejects one near-empty document answering for several distinct URLs', () => {
    // The reported case: three sample pages all showing an identical
    // 343-character raw document.
    const shell = { markupLength: 400, textSignature: 'shared', interstitialMarkers: [] };
    const unusable = unusableRawFetches([
      page({ pageUrl: 'a', rawDocument: shell }),
      page({ pageUrl: 'b', rawDocument: shell }),
      page({ pageUrl: 'c', rawDocument: shell }),
    ]);
    expect(unusable.get('b')).toEqual({ kind: 'shared-empty-document', pageCount: 3 });
  });

  it('keeps a genuine JavaScript shell, which is the finding the render diff exists for', () => {
    // Same text on every route, but the document itself is a real page's
    // markup: bundles, preloads, meta. A crawler really does see nothing.
    const shell = { markupLength: 12_000, textSignature: 'shared', interstitialMarkers: [] };
    const unusable = unusableRawFetches([
      page({ pageUrl: 'a', rawDocument: shell }),
      page({ pageUrl: 'b', rawDocument: shell }),
      page({ pageUrl: 'c', rawDocument: shell }),
    ]);
    expect(unusable).toEqual(new Map());
  });

  it('needs more than two pages before one shared document is evidence of anything', () => {
    const shell = { markupLength: 300, textSignature: 'shared', interstitialMarkers: [] };
    expect(
      unusableRawFetches([
        page({ pageUrl: 'a', rawDocument: shell }),
        page({ pageUrl: 'b', rawDocument: shell }),
      ]),
    ).toEqual(new Map());
  });

  it('judges nothing for artifacts captured before the raw-document signals existed', () => {
    expect(
      unusableRawFetches([
        { pageUrl: 'a', httpStatus: 403, rawDocument: undefined },
        { pageUrl: 'b', httpStatus: 200, rawDocument: undefined },
      ]),
    ).toEqual(new Map());
  });

  it('emits no finding for a page whose raw fetch is unusable, whatever the gap', () => {
    const result = buildRenderDiffResult({ missingPercent: 99 });
    expect(
      extractRenderDiffCandidates(result, result.pageUrl, {
        kind: 'interstitial',
        markers: ['bot-challenge'],
      }),
    ).toEqual([]);
  });
});
