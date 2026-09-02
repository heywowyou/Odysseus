/**
 * Conservative guard against runaway pagination/archive chains on the
 * crawl link frontier (plan 021 Step 6). Classification is structural
 * only, decided per outgoing anchor at the point it is discovered, never
 * inferred from URL shape or a numeric path segment alone (GitHub issue
 * #20: a WordPress author archive's page/30 is real, navigable content on
 * a genuine 375-post site, and truncating it by URL shape would be
 * exactly the "silently under-report the site" failure class
 * CLAUDE.md's crawling-politeness rule already exists to prevent).
 *
 * Three structural bases, each independently sufficient:
 *  - `rel-next`: the anchor's own `rel` attribute contains "next". A
 *    `rel="prev"` link is deliberately ungoverned - it points backward
 *    toward pages the crawl has already reached or is already reaching,
 *    so it carries none of the forward-runaway risk this guard exists
 *    for.
 *  - `numbered-pagination-control`: the anchor matches the same
 *    pagination-control selector `page-audit-profile.ts` already uses for
 *    its page-level `numberedPaginationControlCount` fact
 *    (`nav[class*="pag" i] a, [class*="pagination" i] a`, filtered to
 *    numeric link text), now evaluated per anchor instead of only
 *    counted for the whole page.
 *  - `query-key-family`: the anchor's target URL repeats a query key that
 *    also appears on another outgoing link on the *same* source page, and
 *    that source page independently qualifies as a confirmed listing
 *    (`full-audit-plan.ts`'s exported `isConfirmedListing`, so the
 *    "two independent signal kinds" listing threshold is governed by
 *    exactly one function, not redefined here).
 *
 * Family-key derivation is a separate step from classification, and is
 * not itself a classification decision: once a link is already known to
 * be a continuation, grouping it with siblings for counting purposes is
 * allowed to use URL shape, even though *deciding* continuation status
 * from URL shape alone is exactly what this module refuses to do.
 */

import { isConfirmedListing } from './full-audit-plan.js';
import type { ContinuationBasis, ContinuationGuardSummary } from '@odysseus/core';
import type { PageAuditProfile } from './page-audit-profile.js';

export { isConfirmedListing };
export type {
  ContinuationBasis,
  ContinuationFamilyOmission,
  ContinuationGuardSummary,
} from '@odysseus/core';
export type { PageAuditProfile };

/** Bumped only for a deliberate, reviewed retune - never edited in place.
 *  See docs/session/current-session.md for the reasoning behind v1's
 *  threshold. */
export const CONTINUATION_GUARD_VERSION = 'v1';

/** Chosen against GitHub issue #20's real evidence: hotelpointfrance.com,
 *  a genuine 375-post site, whose deepest observed real archive
 *  pagination was /author/.../page/30/. Set at roughly double that
 *  deepest real depth, so a legitimately larger site still has headroom,
 *  while a combinatorial or literally endless chain is still bounded to a
 *  small, cheap multiple of realistic depth rather than the hundreds
 *  issue #20 reported. */
export const CONTINUATION_FAMILY_MAX_ENQUEUED = 60;

const MAX_PERSISTED_FAMILIES = 100;
const MAX_EXAMPLES_PER_FAMILY = 3;

export type ContinuationClassification =
  { isContinuation: false } | { isContinuation: true; basis: ContinuationBasis; familyKey: string };

function pathFamilyKey(url: string): string {
  const { pathname } = new URL(url);
  const placeholderPath = pathname
    .split('/')
    .map((segment) => (/^\d+$/.test(segment) ? '{n}' : segment))
    .join('/');
  return `path:${placeholderPath}`;
}

function queryKeyFamilyKey(sourcePageUrl: string, key: string): string {
  const { pathname } = new URL(sourcePageUrl);
  return `query:${pathname}:${key}`;
}

function firstRepeatedQueryKey(url: string, repeatedKeys: ReadonlySet<string>): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  for (const key of parsed.searchParams.keys()) {
    if (repeatedKeys.has(key)) return key;
  }
  return undefined;
}

/** Query keys appearing on two or more distinct target URLs discovered on
 *  one source page - the "repeated" evidence the query-key-family basis
 *  requires. Malformed URLs are skipped, never thrown on: this is
 *  best-effort evidence gathering, not validation. */
export function computeRepeatedQueryKeys(targetUrls: readonly string[]): Set<string> {
  const urlCountByKey = new Map<string, number>();
  for (const url of targetUrls) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    for (const key of new Set(parsed.searchParams.keys())) {
      urlCountByKey.set(key, (urlCountByKey.get(key) ?? 0) + 1);
    }
  }
  const repeated = new Set<string>();
  for (const [key, count] of urlCountByKey) {
    if (count >= 2) repeated.add(key);
  }
  return repeated;
}

export interface ClassifyContinuationLinkParams {
  targetUrl: string;
  sourcePageUrl: string;
  /** True when this specific anchor's own `rel` attribute contains
   *  "next". */
  relNext: boolean;
  /** True when this specific anchor matched the numbered-pagination
   *  control selector. */
  isNumberedPaginationControl: boolean;
  sourceIsConfirmedListing: boolean;
  /** From computeRepeatedQueryKeys over every outgoing link on the source
   *  page. */
  repeatedQueryKeysOnSourcePage: ReadonlySet<string>;
}

export function classifyContinuationLink(
  params: ClassifyContinuationLinkParams,
): ContinuationClassification {
  const {
    targetUrl,
    sourcePageUrl,
    relNext,
    isNumberedPaginationControl,
    sourceIsConfirmedListing,
    repeatedQueryKeysOnSourcePage,
  } = params;

  if (relNext) {
    return { isContinuation: true, basis: 'rel-next', familyKey: pathFamilyKey(targetUrl) };
  }
  if (isNumberedPaginationControl) {
    return {
      isContinuation: true,
      basis: 'numbered-pagination-control',
      familyKey: pathFamilyKey(targetUrl),
    };
  }
  if (sourceIsConfirmedListing) {
    const matchedKey = firstRepeatedQueryKey(targetUrl, repeatedQueryKeysOnSourcePage);
    if (matchedKey !== undefined) {
      return {
        isContinuation: true,
        basis: 'query-key-family',
        familyKey: queryKeyFamilyKey(sourcePageUrl, matchedKey),
      };
    }
  }
  return { isContinuation: false };
}

interface FamilyState {
  basis: ContinuationBasis;
  enqueuedCount: number;
  omittedCount: number;
  omittedExampleUrls: string[];
}

/** Tracks per-family enqueue counts across one whole crawl. One instance
 *  per crawlSite call - never shared across crawls, since a family key is
 *  only meaningful within the site it was discovered on. */
export class ContinuationGuard {
  private readonly familyMaxEnqueued: number;
  private readonly families = new Map<string, FamilyState>();

  constructor(familyMaxEnqueued: number = CONTINUATION_FAMILY_MAX_ENQUEUED) {
    this.familyMaxEnqueued = familyMaxEnqueued;
  }

  /** Decides whether a continuation-classified link may be enqueued.
   *  Never call this for a link classifyContinuationLink did not mark as
   *  a continuation - those are never governed by this guard at all. */
  admit(classification: { basis: ContinuationBasis; familyKey: string }, url: string): boolean {
    const { basis, familyKey } = classification;
    let state = this.families.get(familyKey);
    if (state === undefined) {
      state = { basis, enqueuedCount: 0, omittedCount: 0, omittedExampleUrls: [] };
      this.families.set(familyKey, state);
    }
    if (state.enqueuedCount < this.familyMaxEnqueued) {
      state.enqueuedCount += 1;
      return true;
    }
    state.omittedCount += 1;
    if (state.omittedExampleUrls.length < MAX_EXAMPLES_PER_FAMILY) {
      state.omittedExampleUrls.push(url);
    }
    return false;
  }

  summary(): ContinuationGuardSummary {
    const omittedFamilies = Array.from(this.families.entries())
      .filter(([, state]) => state.omittedCount > 0)
      .map(([familyKey, state]) => ({
        familyKey,
        basis: state.basis,
        enqueuedCount: state.enqueuedCount,
        omittedCount: state.omittedCount,
        omittedExampleUrls: [...state.omittedExampleUrls].sort(),
      }))
      .sort((a, b) => a.familyKey.localeCompare(b.familyKey));

    const totalOmittedUrlCount = omittedFamilies.reduce((sum, f) => sum + f.omittedCount, 0);
    const families = omittedFamilies.slice(0, MAX_PERSISTED_FAMILIES);
    const additionalFamiliesOmittedCount = omittedFamilies.length - families.length;

    return {
      guardVersion: CONTINUATION_GUARD_VERSION,
      familyMaxEnqueued: this.familyMaxEnqueued,
      families,
      additionalFamiliesOmittedCount,
      totalOmittedUrlCount,
    };
  }
}
