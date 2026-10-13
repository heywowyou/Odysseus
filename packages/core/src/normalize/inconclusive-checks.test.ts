import { describe, expect, it } from 'vitest';
import type { ManifestPageEntry, PageAnalysisCoverage } from '../types/manifest.js';
import { inconclusiveCheckIdsOf, markInconclusiveChecks } from './inconclusive-checks.js';

const coverage = (extended: PageAnalysisCoverage['passes']['extended']): PageAnalysisCoverage => ({
  plannerVersion: 'v3',
  role: 'content',
  confidence: 'high',
  reasonCodes: [],
  passes: {
    rendered: { outcome: 'completed' },
    axe: { outcome: 'completed' },
    extended,
    lighthouse: { outcome: 'not-planned' },
  },
});

const page = (url: string, extended = coverage({ outcome: 'completed' })): ManifestPageEntry =>
  ({ url, status: 'visited', depth: 0, analysisCoverage: extended }) as ManifestPageEntry;

// domaine-d-auriac, 2026-09-28: a Complianz banner held the walk on every page.
const heldWalk = {
  pageUrl: 'https://domaine-d-auriac.fr/',
  tabbableCount: 40,
  tabbableSelectors: Array.from(
    { length: 40 },
    (_, index) => `#cmplz-cookiebanner-1-optin a:nth-of-type(${index})`,
  ),
  focusSequence: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3],
};

describe('inconclusiveCheckIdsOf', () => {
  it('names a held Tab walk and a video whose audio could not be read', () => {
    expect(
      inconclusiveCheckIdsOf({
        pageUrl: heldWalk.pageUrl,
        keyboardNavigation: heldWalk,
        videoCaptions: {
          pageUrl: heldWalk.pageUrl,
          videos: [{ selector: 'video', hasCaptionTrack: false, audio: 'undetermined' }],
        },
      }),
    ).toEqual(['keyboard-navigation', 'video-captions']);
  });

  it('names a Tab walk a window took over after it began', () => {
    expect(
      inconclusiveCheckIdsOf({
        pageUrl: heldWalk.pageUrl,
        keyboardNavigation: { ...heldWalk, focusSequence: [0, 1, 2, 3, 4, 5, 5, null, null, null] },
      }),
    ).toEqual(['keyboard-navigation']);
  });

  it('names nothing for a walk that went through the page and a captioned video', () => {
    expect(
      inconclusiveCheckIdsOf({
        pageUrl: heldWalk.pageUrl,
        keyboardNavigation: { ...heldWalk, focusSequence: Array.from({ length: 40 }, (_, i) => i) },
        videoCaptions: {
          pageUrl: heldWalk.pageUrl,
          videos: [{ selector: 'video', hasCaptionTrack: true, audio: 'undetermined' }],
        },
      }),
    ).toEqual([]);
  });
});

describe('markInconclusiveChecks', () => {
  it('records the inconclusive checks on the extended pass and replaces a stale record', () => {
    const stale = page(
      'https://example.com/b',
      coverage({ outcome: 'completed', inconclusiveCheckIds: ['keyboard-navigation'] }),
    );
    const [held, clean] = markInconclusiveChecks(
      [page(heldWalk.pageUrl, coverage({ outcome: 'partial', failedCheckIds: ['reflow'] })), stale],
      [
        { pageUrl: heldWalk.pageUrl, keyboardNavigation: heldWalk },
        { pageUrl: 'https://example.com/b' },
      ],
    );
    expect(held?.analysisCoverage?.passes.extended).toEqual({
      outcome: 'partial',
      failedCheckIds: ['reflow'],
      inconclusiveCheckIds: ['keyboard-navigation'],
    });
    expect(clean?.analysisCoverage?.passes.extended).toEqual({ outcome: 'completed' });
  });

  it('leaves a page without coverage untouched', () => {
    const legacy = {
      url: 'https://example.com/',
      status: 'visited',
      depth: 0,
    } as ManifestPageEntry;
    expect(
      markInconclusiveChecks(
        [legacy],
        [{ pageUrl: legacy.url, keyboardNavigation: { ...heldWalk, pageUrl: legacy.url } }],
      ),
    ).toEqual([legacy]);
  });
});
