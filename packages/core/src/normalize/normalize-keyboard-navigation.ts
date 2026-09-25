/**
 * Milestone 8 (extended accessibility pass): violation judgment for the
 * Tab-key walk in packages/scanner/src/checks/keyboard-navigation.ts.
 * Same scanner-extracts/core-decides split as every other custom check.
 *
 * Deliberately conservative on both fronts, per this codebase's "prefer
 * undetermined over a confident wrong answer" principle:
 *
 * keyboard-trap only fires when the exact same element received focus on
 * two consecutive Tab presses - the one signal that cannot have an
 * innocent explanation (a real browser always advances focus on Tab
 * unless something is actively intercepting it). A fuzzier "cycling
 * among a small subset of elements" signal was considered and rejected:
 * an accessible modal dialog intentionally trapping focus within its own
 * several elements is correct behavior, not a defect, and a heuristic
 * broad enough to catch real traps would also flag that.
 *
 * focus-order-mismatch only fires on a real backward jump (the tab
 * sequence visits a DOM-earlier element after a DOM-later one), not on
 * any use of a positive tabindex per se - and requires at least 2
 * inversions, not 1, since a single reordered element is common and
 * usually deliberate (e.g. moving one call-to-action earlier in tab
 * order), while multiple backward jumps indicate the whole sequence has
 * drifted from document structure.
 */

import type { FindingCandidate } from './candidate.js';
import { severityFromCustom } from './severity.js';

export const KEYBOARD_TRAP_RULE_ID = 'keyboard-trap';
export const FOCUS_ORDER_MISMATCH_RULE_ID = 'focus-order-mismatch';

const MIN_INVERSIONS_FOR_MISMATCH = 2;

export interface KeyboardNavigationCheckInput {
  pageUrl: string;
  tabbableCount: number;
  tabbableSelectors: string[];
  tabbableKinds?: Array<'ordinary' | 'native-substop' | 'embedded' | 'shadow-host'>;
  focusSequence: Array<number | null>;
}

export function extractKeyboardNavigationCandidates(
  input: KeyboardNavigationCheckInput,
): FindingCandidate[] {
  const candidates: FindingCandidate[] = [];
  const { pageUrl } = input;

  for (let i = 0; i < input.focusSequence.length - 1; i++) {
    const current = input.focusSequence[i];
    const next = input.focusSequence[i + 1];
    if (current === null || current === undefined) continue;
    if (current === next) {
      const kind = input.tabbableKinds?.[current] ?? 'ordinary';
      if (kind !== 'ordinary') continue;
      const selector = input.tabbableSelectors[current] ?? `[tabbable-index="${current}"]`;
      candidates.push({
        source: 'custom',
        ruleId: KEYBOARD_TRAP_RULE_ID,
        category: 'accessibility',
        severity: severityFromCustom(KEYBOARD_TRAP_RULE_ID),
        wcagCriteria: ['2.1.2'],
        title: 'Keyboard focus is trapped on one element',
        description: `Pressing Tab while this element is focused does not move focus anywhere else. A keyboard-only user cannot get past it to reach the rest of the page.`,
        pageUrl,
        element: { pageUrl, selector, snippet: '' },
        rawEvidenceForPage: { tabbableIndex: current, stepIndex: i },
      });
      break; // one trap finding per page is enough; the walk likely never recovers past it
    }
  }

  const observedIds = input.focusSequence.filter((id): id is number => id !== null);
  let inversions = 0;
  for (let i = 0; i < observedIds.length - 1; i++) {
    if (observedIds[i + 1]! < observedIds[i]!) inversions++;
  }
  if (inversions >= MIN_INVERSIONS_FOR_MISMATCH) {
    candidates.push({
      source: 'custom',
      ruleId: FOCUS_ORDER_MISMATCH_RULE_ID,
      category: 'accessibility',
      severity: severityFromCustom(FOCUS_ORDER_MISMATCH_RULE_ID),
      wcagCriteria: ['2.4.3'],
      title: 'Tab order does not follow the page structure',
      // Page-independent (issue #503): the per-page count is in the evidence.
      description: `Tabbing through this page jumps backward past an earlier element rather than moving through the content in order. This usually comes from an explicit positive tabindex, and can leave keyboard users disoriented about where focus went.`,
      pageUrl,
      element: null,
      rawEvidenceForPage: { inversions, tabbableCount: input.tabbableCount },
    });
  }

  return candidates;
}
