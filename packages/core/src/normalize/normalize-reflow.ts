/**
 * C3 (2026-08-24): violation judgment for the reflow check.
 *
 * Per-page, and a genuine WCAG criterion, so unlike the other checks
 * added this session this one carries a criterion number: 1.4.10
 * (Redistribution / Reflow), level AA. That number is what puts it in the
 * report's conformance table and makes it usable by the client's counsel,
 * so getting it right matters more here than for a finding whose only
 * home is the annex.
 *
 * 'serious', not 'critical': a reader can still reach the content by
 * scrolling in two directions, which is precisely the burden the
 * criterion exists to remove, but it is not the content being
 * unreachable. That is the same line normalize-security-headers.ts draws
 * between a missing defense and a confirmed loss of access.
 *
 * One finding per page, carrying the offending elements, rather than one
 * finding per element. A page that scrolls sideways does so once; the
 * elements are evidence for the single defect, not several defects. This
 * also keeps the check from re-creating the exact per-instance-selector
 * explosion B2 was needed to undo.
 */

import type { FindingCandidate } from './candidate.js';
import { severityFromCustom } from './severity.js';
import { shapeIdentity } from './normalize-axe.js';

export const REFLOW_HORIZONTAL_SCROLL_RULE_ID = 'reflow-horizontal-scroll';

export interface ReflowCheckInput {
  checked: boolean;
  requiresHorizontalScroll: boolean;
  documentScrollWidthPx: number;
  viewportWidthPx: number;
  overflowElements: { selector: string; widthPx: number; snippet: string }[];
}

function reflowShapeIdentity(snippet: string): string | undefined {
  // Generated ids/classes encode an instance number rather than a component
  // template. Remove those values before asking the shared shape parser for
  // the authored opening-tag shape.
  const sanitized = snippet
    .replace(/\s+id\s*=\s*("[^"]*\d[^"]*"|'[^']*\d[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+class\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, (match) => {
      const value = match.replace(/^\s+class\s*=\s*["']?|["']?$/gi, '');
      const classes = value.split(/\s+/).filter((name) => name.length > 0 && !/\d/.test(name));
      return classes.length > 0 ? ` class="${classes.join(' ')}"` : '';
    });
  return shapeIdentity(sanitized);
}

export function normalizeReflow(input: ReflowCheckInput, pageUrl: string): FindingCandidate[] {
  if (!input.checked || !input.requiresHorizontalScroll) return [];

  const widest = input.overflowElements[0];

  return [
    {
      source: 'custom',
      ruleId: REFLOW_HORIZONTAL_SCROLL_RULE_ID,
      category: 'accessibility',
      severity: severityFromCustom(REFLOW_HORIZONTAL_SCROLL_RULE_ID),
      wcagCriteria: ['1.4.10'],
      title: 'The page requires horizontal scrolling on a narrow screen',
      description:
        `At the ${input.viewportWidthPx} CSS pixel width WCAG 1.4.10 specifies, this page's content is ` +
        `${input.documentScrollWidthPx} pixels wide, so a reader has to scroll both sideways and down to read it. ` +
        (widest
          ? `The widest element is ${widest.selector} at ${widest.widthPx} pixels.`
          : 'No single element accounts for the overflow; the page layout itself does not adapt.'),
      pageUrl,
      // The widest offending element, when there is one: it is the
      // container actually setting the width and the thing to fix.
      // Page-scoped when the layout as a whole is at fault, rather than
      // naming an arbitrary element for the sake of having a selector.
      element: widest ? { pageUrl, selector: widest.selector, snippet: widest.snippet } : null,
      ...(widest !== undefined
        ? (() => {
            const identity = reflowShapeIdentity(widest.snippet);
            return identity === undefined ? {} : { dedupeIdentity: `reflow:${identity}` };
          })()
        : {}),
      rawEvidenceForPage: {
        documentScrollWidthPx: input.documentScrollWidthPx,
        viewportWidthPx: input.viewportWidthPx,
        overflowElements: input.overflowElements,
      },
    },
  ];
}
