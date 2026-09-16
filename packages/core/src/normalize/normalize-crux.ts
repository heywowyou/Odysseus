/**
 * Milestone 8.6: violation judgment for CrUX field data. Site-level,
 * attributed to the homepage, same "attribute a site-level fact to the
 * one page every site has" pattern llms-txt.ts and sitemap.ts already
 * established. `available: false` (no CrUX record for this origin, or
 * the API key was not configured) produces zero candidates - absence of
 * real-user data is not itself a defect, see CruxFieldDataResult's own
 * doc comment in @odysseus/core's types/manifest.ts for the full
 * reasoning and where the raw values are kept regardless of severity.
 */

import type { FindingCandidate } from './candidate.js';
import { severityFromCustom } from './severity.js';

export const CRUX_LCP_POOR_RULE_ID = 'crux-lcp-poor';
export const CRUX_CLS_POOR_RULE_ID = 'crux-cls-poor';
export const CRUX_INP_POOR_RULE_ID = 'crux-inp-poor';

/** Google's own published "poor" thresholds, duplicated by value (not
 *  import) from packages/scanner/src/crux.ts's CRUX_POOR_THRESHOLDS -
 *  core must not depend on scanner, same reasoning as every other
 *  narrow structural type in this directory. Keep the two in sync by
 *  hand. */
const CRUX_POOR_THRESHOLDS = {
  lcp: 4000,
  cls: 0.25,
  inp: 500,
};

/** Issue #300: Google's own published "good" thresholds, the other end of
 *  the same scale as CRUX_POOR_THRESHOLDS above and duplicated by value
 *  for the same reason. A metric at or below these is what real visitors
 *  actually experience as fine. */
const CRUX_GOOD_THRESHOLDS = {
  lcp: 2500,
  cls: 0.1,
  inp: 200,
};

export type CruxMetricKey = 'lcp' | 'cls' | 'inp';

export interface CruxFieldDataCheckInput {
  available: boolean;
  lcp?: { p75: number };
  cls?: { p75: number };
  inp?: { p75: number };
}

export function extractCruxCandidates(
  input: CruxFieldDataCheckInput,
  homepageUrl: string,
): FindingCandidate[] {
  if (!input.available) return [];

  const candidates: FindingCandidate[] = [];

  if (input.lcp !== undefined && input.lcp.p75 >= CRUX_POOR_THRESHOLDS.lcp) {
    candidates.push({
      source: 'custom',
      ruleId: CRUX_LCP_POOR_RULE_ID,
      category: 'performance',
      severity: severityFromCustom(CRUX_LCP_POOR_RULE_ID),
      wcagCriteria: [],
      title: 'Real visitors experience poor Largest Contentful Paint',
      description: `Chrome's real-user data (CrUX) for this site shows a 75th-percentile Largest Contentful Paint of ${Math.round(input.lcp.p75)}ms, in Google's own "poor" range (4000ms or above). This is measured from actual visitors, not a lab simulation.`,
      pageUrl: homepageUrl,
      element: null,
      rawEvidenceForPage: { metric: 'largest_contentful_paint', p75: input.lcp.p75 },
    });
  }

  if (input.cls !== undefined && input.cls.p75 >= CRUX_POOR_THRESHOLDS.cls) {
    candidates.push({
      source: 'custom',
      ruleId: CRUX_CLS_POOR_RULE_ID,
      category: 'performance',
      severity: severityFromCustom(CRUX_CLS_POOR_RULE_ID),
      wcagCriteria: [],
      title: 'Real visitors experience poor Cumulative Layout Shift',
      description: `Chrome's real-user data (CrUX) for this site shows a 75th-percentile Cumulative Layout Shift of ${input.cls.p75.toFixed(2)}, in Google's own "poor" range (0.25 or above). This is measured from actual visitors, not a lab simulation.`,
      pageUrl: homepageUrl,
      element: null,
      rawEvidenceForPage: { metric: 'cumulative_layout_shift', p75: input.cls.p75 },
    });
  }

  if (input.inp !== undefined && input.inp.p75 >= CRUX_POOR_THRESHOLDS.inp) {
    candidates.push({
      source: 'custom',
      ruleId: CRUX_INP_POOR_RULE_ID,
      category: 'performance',
      severity: severityFromCustom(CRUX_INP_POOR_RULE_ID),
      wcagCriteria: [],
      title: 'Real visitors experience poor Interaction to Next Paint',
      description: `Chrome's real-user data (CrUX) for this site shows a 75th-percentile Interaction to Next Paint of ${Math.round(input.inp.p75)}ms, in Google's own "poor" range (500ms or above). This is measured from actual visitors, not a lab simulation.`,
      pageUrl: homepageUrl,
      element: null,
      rawEvidenceForPage: { metric: 'interaction_to_next_paint', p75: input.inp.p75 },
    });
  }

  return candidates;
}

/**
 * Issue #300: which field metrics real visitors experience as good.
 *
 * A Haaitza report marked FCP, LCP and Speed Index critical on all 140 of
 * its pages - so "140 pages with at least one critical finding" out of 140
 * carried no information - while Chrome's own real-user data for the same
 * site put LCP at 2.4s and CLS at 0.04, both squarely good. The annex read
 * "Critique" for a layout shift the site's actual visitors never
 * experience.
 *
 * Lab and field measure different things and a lab number is not wrong for
 * disagreeing: it runs one cold load on a throttled connection, which is a
 * legitimate diagnostic. What it cannot do is outrank the real measurement
 * in a client-facing severity. This exposes the judgment; the capping
 * itself lives in normalize-lighthouse.ts, next to the lab-rating cap it
 * sits beside.
 *
 * Empty whenever no CrUX record exists, so a site with no field data
 * behaves exactly as before - absence of real-user data is not evidence
 * that the lab number is wrong.
 */
export function goodFieldMetrics(
  input: CruxFieldDataCheckInput | undefined,
): ReadonlySet<CruxMetricKey> {
  const good = new Set<CruxMetricKey>();
  if (!input?.available) return good;
  if (input.lcp !== undefined && input.lcp.p75 <= CRUX_GOOD_THRESHOLDS.lcp) good.add('lcp');
  if (input.cls !== undefined && input.cls.p75 <= CRUX_GOOD_THRESHOLDS.cls) good.add('cls');
  if (input.inp !== undefined && input.inp.p75 <= CRUX_GOOD_THRESHOLDS.inp) good.add('inp');
  return good;
}
