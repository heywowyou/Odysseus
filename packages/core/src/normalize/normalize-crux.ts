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

export interface CruxFieldDataCheckInput {
  available: boolean;
  lcp?: { p75: number };
  cls?: { p75: number };
  inp?: { p75: number };
}

export function extractCruxCandidates(input: CruxFieldDataCheckInput, homepageUrl: string): FindingCandidate[] {
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
