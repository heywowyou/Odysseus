/**
 * Render diff candidate extraction.
 *
 * The render diff is the single most sellable artifact the tool produces
 * (see RenderDiffResult's own doc comment in findings.ts), but it is only
 * emitted as a Finding when missingPercent meets a threshold: emitting
 * unconditionally would produce a 'minor' finding on every page of a
 * healthy server-rendered site, all saying nothing is wrong. The measured
 * percentage is still recorded in the manifest for every page regardless
 * of whether a finding was emitted, so the number is never lost.
 */

import type { RawDocumentSignals, RenderDiffResult } from '../types/findings.js';
import { classifyDocumentWall, MINIMAL_RAW_MARKUP_LENGTH } from '../acquisition/host-signal.js';
import { severityFromRenderDiff } from './severity.js';
import { RENDER_DIFF_EMISSION_THRESHOLD_PERCENT } from './constants.js';
import type { FindingCandidate } from './candidate.js';

/** Matches findings.ts's own doc-comment example for a renderdiff ruleId. */
export const RENDERDIFF_RULE_ID = 'text-missing-from-raw-html';

/** Issue #301: at or above this many distinct URLs answering with the
 *  same raw document, one document is standing in for the whole site. */
export const SHARED_RAW_DOCUMENT_MIN_PAGES = 3;

/** A render that did not obtain the site's own document is acquisition
 * failure, never content evidence. Stored artifacts use the same classifier
 * as live scans so re-normalization repairs old reports. */
export function isBlockedRender(
  result: RenderDiffResult | undefined,
  fallbackTitle?: string | null,
): boolean {
  const fallback = classifyDocumentWall(
    fallbackTitle === undefined ? {} : { title: fallbackTitle },
  );
  if (result === undefined) return fallback.classification === 'wall';

  const renderedTitle = result.renderedTitle ?? fallbackTitle;
  const rendered = classifyDocumentWall({
    status: result.renderedHttpStatus ?? result.httpStatus,
    visibleTextLength: result.renderedTextLength,
    ...(renderedTitle !== undefined ? { title: renderedTitle } : {}),
    ...(result.renderedInterstitialMarkers !== undefined
      ? { markers: result.renderedInterstitialMarkers }
      : {}),
  });
  const raw = classifyDocumentWall({
    status: result.httpStatus,
    visibleTextLength: result.rawTextLength,
    ...(result.rawDocument !== undefined
      ? {
          markupLength: result.rawDocument.markupLength,
          markers: result.rawDocument.interstitialMarkers,
        }
      : {}),
  });
  // HTTP errors remain acquisition failures for normalization. The shared
  // wall classifier determines which successful documents are barriers.
  return (
    (result.renderedHttpStatus ?? result.httpStatus) >= 400 ||
    result.httpStatus >= 400 ||
    rendered.classification === 'wall' ||
    raw.classification === 'wall'
  );
}

/** Why one page's raw fetch cannot be compared against its rendered pass.
 *  Absent from the map returned below when the fetch is usable. */
export type UnusableRawFetch =
  | { kind: 'interstitial'; markers: readonly string[] }
  | { kind: 'http-error'; httpStatus: number }
  | { kind: 'shared-empty-document'; pageCount: number };

export interface RawFetchInput {
  pageUrl: string;
  httpStatus: number | undefined;
  rawDocument: RawDocumentSignals | undefined;
  rawTextLength?: number;
}

/**
 * Issue #301: which pages' raw fetches did not receive the page.
 *
 * Run over the whole audit rather than per page, because the strongest of
 * the three signals is only visible across pages: one short document
 * answering for several distinct URLs. A real report showed an identical
 * 343-character raw document on three URLs and reported serious missing
 * content on each.
 *
 * The per-page signals (an interstitial's own markers, a raw fetch that
 * errored while the rendered pass succeeded) are decisive on their own.
 * The shared-document signal is not: a site that renders everything in the
 * browser genuinely serves one shell for every route, and that is the
 * render diff's most valuable true positive, so it only counts when the
 * document is also too small to be a shell the site built.
 *
 * Pages whose artifacts predate rawDocument are never judged unusable -
 * absence of the signal is not evidence.
 */
export function unusableRawFetches(
  pages: readonly RawFetchInput[],
): ReadonlyMap<string, UnusableRawFetch> {
  const pagesBySignature = new Map<string, Set<string>>();
  for (const page of pages) {
    if (page.rawDocument === undefined) continue;
    if (page.rawDocument.markupLength > MINIMAL_RAW_MARKUP_LENGTH) continue;
    const seen = pagesBySignature.get(page.rawDocument.textSignature) ?? new Set<string>();
    seen.add(page.pageUrl);
    pagesBySignature.set(page.rawDocument.textSignature, seen);
  }

  const unusable = new Map<string, UnusableRawFetch>();
  for (const page of pages) {
    if (page.rawDocument === undefined) continue;
    const wall = classifyDocumentWall({
      ...(page.httpStatus !== undefined ? { status: page.httpStatus } : {}),
      markupLength: page.rawDocument.markupLength,
      ...(page.rawTextLength !== undefined ? { visibleTextLength: page.rawTextLength } : {}),
      markers: page.rawDocument.interstitialMarkers,
    });
    if (wall.classification === 'wall' && page.rawDocument.interstitialMarkers.length > 0) {
      unusable.set(page.pageUrl, {
        kind: 'interstitial',
        markers: page.rawDocument.interstitialMarkers,
      });
      continue;
    }
    if (page.httpStatus !== undefined && (page.httpStatus < 200 || page.httpStatus >= 300)) {
      unusable.set(page.pageUrl, { kind: 'http-error', httpStatus: page.httpStatus });
      continue;
    }
    if (wall.classification === 'wall') {
      unusable.set(page.pageUrl, {
        kind: 'interstitial',
        markers: page.rawDocument.interstitialMarkers,
      });
      continue;
    }
    const sharing = pagesBySignature.get(page.rawDocument.textSignature);
    if (sharing !== undefined && sharing.size >= SHARED_RAW_DOCUMENT_MIN_PAGES) {
      unusable.set(page.pageUrl, { kind: 'shared-empty-document', pageCount: sharing.size });
    }
  }
  return unusable;
}

export function extractRenderDiffCandidates(
  result: RenderDiffResult,
  pageUrl: string,
  /** Issue #301: set when this page's raw fetch did not receive the page.
   *  The gap between the two passes then measures the interstitial, not
   *  the site, so nothing is emitted. */
  unusableRawFetch?: UnusableRawFetch,
): FindingCandidate[] {
  if (unusableRawFetch !== undefined) return [];
  if (isBlockedRender(result)) return [];
  if (result.missingPercent < RENDER_DIFF_EMISSION_THRESHOLD_PERCENT) return [];

  return [
    {
      source: 'renderdiff',
      ruleId: RENDERDIFF_RULE_ID,
      category: 'rendering',
      severity: severityFromRenderDiff(result.missingPercent),
      wcagCriteria: [],
      // Static text: a merged finding can span pages with different
      // percentages, so the actual numbers live in
      // rawEvidence.perPage[pageUrl], not embedded here.
      title: 'Content invisible to a non-JavaScript crawler',
      description:
        'A significant share of the visible text on this page is only present after JavaScript renders it. A crawler that does not execute JavaScript sees a page close to empty.',
      pageUrl,
      element: null,
      rawEvidenceForPage: { ...result },
    },
  ];
}
