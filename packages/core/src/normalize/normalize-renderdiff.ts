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

import type { RenderDiffResult } from '../types/findings.js';
import { severityFromRenderDiff } from './severity.js';
import { RENDER_DIFF_EMISSION_THRESHOLD_PERCENT } from './constants.js';
import type { FindingCandidate } from './candidate.js';

/** Matches findings.ts's own doc-comment example for a renderdiff ruleId. */
export const RENDERDIFF_RULE_ID = 'text-missing-from-raw-html';

export function extractRenderDiffCandidates(
  result: RenderDiffResult,
  pageUrl: string,
): FindingCandidate[] {
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
