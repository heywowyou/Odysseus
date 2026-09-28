/**
 * The canary audit: one small hotel site that carries one real instance of
 * every defect a past fix narrowed, run through the whole normalization.
 *
 * Why it exists. Each sweep of plan 075 removed false findings by narrowing
 * a detector or a population rule: challenge pages, noindex evidence, Tab
 * walks, contact numbers, calendar contrast, timed-out links, JSON-LD
 * reading, and one finding per rule. Each fix has its own unit test, but no
 * test held the other side for the audit as a whole: that the real defect
 * each rule exists for is still reported after every filter has run. A
 * filter that starts eating real detections fails here, by name.
 *
 * Adding a narrowing fix? Add its true positive to this site.
 */
import { describe, expect, it } from 'vitest';
import type { Finding } from '../types/findings.js';
import { normalizeAudit, type NormalizeAuditInput } from './normalize.js';
import {
  buildAxeNode,
  buildAxeResultsInput,
  buildAxeViolation,
  buildRenderDiffResult,
} from './fixtures.js';

const SITE = 'https://hotel-canari.example';
const url = (path: string) => `${SITE}${path}`;

const LONG_TEXT = 2400;

function head(path: string, extra: Record<string, unknown> = {}) {
  return {
    pageUrl: url(path),
    title: `Hôtel Canari, page ${path}`,
    metaDescription: 'Un hôtel de bord de mer, ses chambres, son restaurant et son spa.',
    canonicalUrls: [url(path)],
    openGraphTags: { 'og:title': 'Hôtel Canari' },
    jsonLdBlocks: [],
    headings: [{ level: 1, text: 'Hôtel Canari' }],
    hreflangLinks: [],
    robotsMeta: null,
    ...extra,
  };
}

function content(path: string, extra: Record<string, unknown> = {}) {
  return {
    url: url(path),
    renderDiff: buildRenderDiffResult({
      pageUrl: url(path),
      rawTextLength: LONG_TEXT,
      renderedTextLength: LONG_TEXT,
      missingPercent: 0,
      renderedTitle: `Hôtel Canari, page ${path}`,
    }),
    headMetadata: head(path),
    ...extra,
  };
}

const PAGES = [
  // Homepage: an image without alt text (Q5 made it one site-wide finding),
  // a low-contrast active button (F10 exempts inactive calendar cells only),
  // and a hreflang pointer that makes /chambres public evidence (F3).
  content('/', {
    headMetadata: head('/', {
      hreflangLinks: [
        { lang: 'fr', href: url('/') },
        { lang: 'fr-x-rooms', href: url('/chambres') },
      ],
    }),
    axe: buildAxeResultsInput([
      buildAxeViolation({
        id: 'image-alt',
        impact: 'critical',
        nodes: [buildAxeNode({ target: ['.hero > img'], html: '<img src="/img/facade.jpg">' })],
      }),
      buildAxeViolation({
        id: 'color-contrast',
        impact: 'serious',
        nodes: [
          buildAxeNode({
            target: ['.booking > button'],
            html: '<button class="book-now">Réserver</button>',
            any: [
              {
                id: 'color-contrast',
                data: { fgColor: '#999999', bgColor: '#ffffff', expectedContrastRatio: '4.5:1' },
              },
            ],
          } as never),
        ],
      }),
    ]),
  }),
  // A room page accidentally set to noindex, which the homepage points to.
  content('/chambres', {
    headMetadata: head('/chambres', { robotsMeta: 'noindex, follow' }),
  }),
  // A date field whose script refuses Tab (Hotel Europe's real trap), on a
  // page with no dialog open: J3 must not read it as a held walk.
  content('/evenements', {
    keyboardNavigation: {
      pageUrl: url('/evenements'),
      tabbableCount: 30,
      tabbableSelectors: Array.from({ length: 30 }, (_, i) =>
        i === 7 ? '#date_evenement' : `#t${i}`,
      ),
      tabbableContainers: Array<string | null>(30).fill(null),
      focusSequence: [5, 6, 7, 7, 7, 7, 7, 7],
    },
  }),
  // Two real backward jumps within one pass through the page.
  content('/acces', {
    keyboardNavigation: {
      pageUrl: url('/acces'),
      tabbableCount: 6,
      tabbableSelectors: Array.from({ length: 6 }, (_, i) => `#a${i}`),
      tabbableContainers: Array<string | null>(6).fill(null),
      focusSequence: [3, 0, 4, 1, 5, 2],
    },
  }),
  // A spa video with an audio track and no captions (B3 exempts only
  // silent or undetermined audio).
  content('/spa', {
    videoCaptions: {
      pageUrl: url('/spa'),
      videos: [{ selector: '#spa-film', hasCaptionTrack: false, audio: 'present', hasAudio: true }],
    },
  }),
  // The contact page's structured phone differs from the number in its own
  // tel: link (F4 reads contact regions only, and this is one).
  content('/contact', {
    napConsistency: {
      structuredPhones: ['0556227211'],
      visiblePhones: ['0556220000'],
      structuredPostalCodes: ['33000'],
      visiblePostalCodes: ['33000'],
      phoneMismatch: true,
      postalCodeMismatch: false,
    },
  }),
  // A real content page whose title uses the challenge words (A1 and E1
  // exclude challenge pages; this one has content and answered 200).
  content('/security-check-in', {
    renderDiff: buildRenderDiffResult({
      pageUrl: url('/security-check-in'),
      rawTextLength: LONG_TEXT,
      renderedTextLength: LONG_TEXT,
      missingPercent: 0,
      renderedTitle: 'Security check-in and check-out times',
    }),
    headMetadata: head('/security-check-in', {
      title: 'Security check-in and check-out times',
      metaDescription: null,
    }),
  }),
] as unknown as NormalizeAuditInput['pages'];

const INPUT = {
  auditId: 'canary',
  startedAt: new Date('2026-09-28T00:00:00Z'),
  pages: PAGES,
  crawl: {
    startUrl: url('/'),
    robotsTxtFound: true,
    sitemapUrls: [url('/'), url('/chambres'), url('/spa'), url('/contact')],
    pages: [
      ...PAGES.map((page, index) => ({
        url: page.url,
        status: 'visited',
        depth: index === 0 ? 0 : 1,
        ...(index === 0 ? {} : { discoveredFrom: url('/') }),
      })),
      // A link to a page the server answers 404 for (F1 limited broken
      // links to a definite status; a timeout no longer counts).
      {
        url: url('/ancienne-offre'),
        status: 'http-error-status',
        httpStatus: 404,
        depth: 1,
        discoveredFrom: url('/'),
      },
    ],
  },
} as unknown as NormalizeAuditInput;

/** Each narrowed rule, the fix that narrowed it, and the page its true
 *  positive sits on. */
const CANARIES: ReadonlyArray<{ ruleId: string; narrowedBy: string; page: string }> = [
  { ruleId: 'image-alt', narrowedBy: 'Q5 site-wide identity', page: '/' },
  { ruleId: 'color-contrast', narrowedBy: 'F10 inactive components', page: '/' },
  { ruleId: 'noindex-on-public-page', narrowedBy: 'B2 and F3 public evidence', page: '/chambres' },
  {
    ruleId: 'keyboard-trap',
    narrowedBy: 'B1 native sub-stops, J3 held walks',
    page: '/evenements',
  },
  { ruleId: 'focus-order-mismatch', narrowedBy: 'J3 per-pass inversions', page: '/acces' },
  { ruleId: 'video-missing-captions', narrowedBy: 'B3 undetermined audio', page: '/spa' },
  {
    ruleId: 'nap-phone-mismatch',
    narrowedBy: 'B4 trunk digit, F4 contact regions',
    page: '/contact',
  },
  { ruleId: 'broken-internal-link', narrowedBy: 'F1 timeouts, H4 site-wide', page: '/' },
  {
    ruleId: 'meta-description-missing',
    narrowedBy: 'A1 and E1 challenge pages, E3 noindex pages',
    page: '/security-check-in',
  },
  {
    ruleId: 'structured-data-entity-missing',
    narrowedBy: 'H5 JSON-LD @graph, E12 and F7 absence over coverage',
    page: '/',
  },
];

describe('the canary audit keeps every real defect a past fix narrowed around', () => {
  const findings: Finding[] = normalizeAudit(INPUT);

  it.each(CANARIES)('reports $ruleId (narrowed by $narrowedBy)', ({ ruleId, page }) => {
    const matching = findings.filter((finding) => finding.ruleId === ruleId);
    expect(matching, `${ruleId} disappeared from the canary audit`).not.toHaveLength(0);
    expect(matching.flatMap((finding) => finding.pageUrls)).toContain(url(page));
  });
});
