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
 * drifted from document structure. Inversions are counted within one pass
 * through the page: when focus reaches an element it already visited, the
 * walk has wrapped round, and the jump from the last control back to the
 * first is not a backward jump (plan 075 J3).
 *
 * A walk held by a dialog is inconclusive (plan 075 J3). The walk starts
 * from the loaded page, where a consent banner or a marketing popup is
 * often still open and correctly keeps focus inside itself. On four of 21
 * production audits focus never left one (Complianz, Didomi, a marketing
 * popup, a notification modal), so the walk measured the dialog, not the
 * page: each wrap counted as a backward jump, every `focus-order-mismatch`
 * in production was false, and the absence of `keyboard-trap` on those
 * pages said nothing. Such a walk gives neither finding, and the evidence
 * graph discloses the pages as not evaluated for keyboard navigation.
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
  /** For each tabbable, the selector of the dialog or consent banner that
   *  contains it, or null. Absent on walks recorded before plan 075 J3. */
  tabbableContainers?: Array<string | null>;
  focusSequence: Array<number | null>;
  /** The walk was repeated once after Escape closed a popup that held it. */
  escapeRetried?: boolean;
}

/** The walk only ever reached a small set of controls, moving on every
 *  press and coming round again, while the page has many more: focus was
 *  held, most likely by an open dialog. An element that keeps focus on
 *  consecutive presses is a trap, never a held walk (Hotel Europe's date
 *  field refuses Tab). With the scanner's container record, every cycled
 *  control must sit in a dialog or consent banner; a stored walk without it
 *  is judged by the cycle alone, over two controls or more. */
export function isTabWalkHeldByDialog(input: KeyboardNavigationCheckInput): boolean {
  const observed = input.focusSequence.filter((id): id is number => id !== null);
  const distinct = new Set(observed);
  if (distinct.size === 0) return false;
  const staysPut = input.focusSequence.some(
    (id, index) => id !== null && id === input.focusSequence[index + 1],
  );
  if (staysPut) return false;
  const cycled = observed.length >= 2 * distinct.size;
  const reachedLittle = distinct.size * 2 <= input.tabbableCount;
  if (!cycled || !reachedLittle) return false;
  if (input.tabbableContainers !== undefined) {
    return [...distinct].every((id) => (input.tabbableContainers?.[id] ?? null) !== null);
  }
  return distinct.size >= 2;
}

/** Backward jumps within each pass through the page. A pass ends when focus
 *  reaches an element it already visited in that pass. */
function countInversions(focusSequence: ReadonlyArray<number | null>): number {
  let inversions = 0;
  let visited = new Set<number>();
  let previous: number | undefined;
  for (const id of focusSequence) {
    if (id === null) continue;
    if (visited.has(id)) {
      visited = new Set<number>();
      previous = undefined;
    }
    if (previous !== undefined && id < previous) inversions++;
    visited.add(id);
    previous = id;
  }
  return inversions;
}

export function extractKeyboardNavigationCandidates(
  input: KeyboardNavigationCheckInput,
): FindingCandidate[] {
  const candidates: FindingCandidate[] = [];
  const { pageUrl } = input;
  if (isTabWalkHeldByDialog(input)) return candidates;

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

  const inversions = countInversions(input.focusSequence);
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
