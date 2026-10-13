/**
 * Milestone 8 (extended accessibility pass): violation judgment for the
 * Tab-key walk in packages/scanner/src/checks/keyboard-navigation.ts.
 * Same scanner-extracts/core-decides split as every other custom check.
 *
 * Deliberately conservative on both fronts, per this codebase's "prefer
 * undetermined over a confident wrong answer" principle:
 *
 * keyboard-trap only fires when the walk ends on one element that kept
 * focus for three presses in a row or more: the finding says a reader cannot
 * get past it, so a pause the walk moves on from is not one. A fuzzier "cycling
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
 *
 * So is a walk a window takes over after it began (isTabWalkTakenOver): the
 * two consecutive presses on one element are then the moment the window
 * opened, not a trap on that element.
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
  /** Parallel to focusSequence: the tabbables each press jumped over that
   *  Tab could not reach in order at that moment (unfocusable, or moved
   *  after the focused element). Absent on walks recorded before issue
   *  #562, which are judged as before. */
  skippedOutOfReach?: number[][];
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
  // Plan 075 K1: a walk that returns to one control after focus left the
  // tabbables (villasfoch's notification modal: its close button, then the
  // dialog itself, 25 of 25 pages) is held as surely as a cycle of two.
  return distinct.size >= 2 || input.focusSequence.includes(null);
}

/** Focus stayed on one control for consecutive presses, then left the
 *  page's tabbables and never came back: a window that opened during the walk
 *  took the keyboard, and what was read before it says nothing about a trap.
 *  hotel-keystone.com, 2026-10-10: Complianz shows its banner a few seconds
 *  after load, so on 13 pages the walk paused on whichever link it had
 *  reached (a menu entry, a footer link, a gallery photo) and then cycled
 *  inside the banner; nine critical traps were reported and Tab passes every
 *  one of those links on the live site. A real trap keeps focus to the end
 *  of the walk (Hotel Europe's date field), which this never matches. */
export function isTabWalkTakenOver(input: KeyboardNavigationCheckInput): boolean {
  const sequence = input.focusSequence;
  const start = sequence.findIndex((id, index) => id !== null && id === sequence[index + 1]);
  if (start === -1) return false;
  let end = start;
  while (sequence[end + 1] === sequence[start]) end++;
  const rest = sequence.slice(end + 1);
  return rest.length > 0 && rest.every((id) => id === null);
}

/** A trap holds focus: the walk ends on the element after it kept focus for
 *  this many presses in a row. */
const MIN_TRAP_PRESSES = 3;

/** Where the walk's final run on one element began, when that run is a trap.
 *  The finding says a reader cannot get past the element, so it is only made
 *  when the walk never did: a control that takes two presses and lets Tab go
 *  on through the page (jehandebeauce's menu entry) is not one, and neither
 *  is a single repeat on the walk's last press. */
function trapStartIndex(focusSequence: ReadonlyArray<number | null>): number | undefined {
  const last = focusSequence.at(-1);
  if (last === null || last === undefined) return undefined;
  let start = focusSequence.length - 1;
  while (start > 0 && focusSequence[start - 1] === last) start--;
  return focusSequence.length - start >= MIN_TRAP_PRESSES ? start : undefined;
}

/** The walk did not measure the page: it gives no finding, and the page is
 *  recorded as not evaluated for keyboard navigation. */
export function isTabWalkInconclusive(input: KeyboardNavigationCheckInput): boolean {
  return isTabWalkHeldByDialog(input) || isTabWalkTakenOver(input);
}

/** Backward jumps within each pass through the page. A pass ends when focus
 *  reaches an element it already visited in that pass. A jump back to an
 *  element the walk skipped while Tab could not reach it in order is not
 *  counted: an autoplaying carousel hid the slide or moved it to the end of
 *  its track (issue #562), so the page's order was followed at every press. */
function countInversions(
  focusSequence: ReadonlyArray<number | null>,
  skippedOutOfReach: ReadonlyArray<readonly number[]> = [],
): number {
  let inversions = 0;
  let visited = new Set<number>();
  let outOfReach = new Set<number>();
  let previous: number | undefined;
  focusSequence.forEach((id, step) => {
    if (id === null) return;
    if (visited.has(id)) {
      visited = new Set<number>();
      outOfReach = new Set<number>();
      previous = undefined;
    }
    if (previous !== undefined && id < previous && !outOfReach.has(id)) inversions++;
    for (const skipped of skippedOutOfReach[step] ?? []) outOfReach.add(skipped);
    visited.add(id);
    previous = id;
  });
  return inversions;
}

export function extractKeyboardNavigationCandidates(
  input: KeyboardNavigationCheckInput,
): FindingCandidate[] {
  const candidates: FindingCandidate[] = [];
  const { pageUrl } = input;
  if (isTabWalkInconclusive(input)) return candidates;

  const trapStart = trapStartIndex(input.focusSequence);
  const trapped = trapStart === undefined ? undefined : input.focusSequence[trapStart];
  if (
    trapStart !== undefined &&
    trapped !== null &&
    trapped !== undefined &&
    (input.tabbableKinds?.[trapped] ?? 'ordinary') === 'ordinary'
  ) {
    const selector = input.tabbableSelectors[trapped] ?? `[tabbable-index="${trapped}"]`;
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
      rawEvidenceForPage: { tabbableIndex: trapped, stepIndex: trapStart },
    });
  }

  const inversions = countInversions(input.focusSequence, input.skippedOutOfReach);
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
