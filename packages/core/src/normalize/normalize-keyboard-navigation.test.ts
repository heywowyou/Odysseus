import { describe, expect, it } from 'vitest';
import {
  extractKeyboardNavigationCandidates,
  KEYBOARD_TRAP_RULE_ID,
  FOCUS_ORDER_MISMATCH_RULE_ID,
  isTabWalkHeldByDialog,
  type KeyboardNavigationCheckInput,
} from './normalize-keyboard-navigation.js';

const PAGE_URL = 'https://example.com/';

function baseInput(
  overrides: Partial<KeyboardNavigationCheckInput> = {},
): KeyboardNavigationCheckInput {
  return {
    pageUrl: PAGE_URL,
    tabbableCount: 4,
    tabbableSelectors: [
      'a:nth-of-type(1)',
      'a:nth-of-type(2)',
      'button:nth-of-type(1)',
      'button:nth-of-type(2)',
    ],
    focusSequence: [0, 1, 2, 3],
    ...overrides,
  };
}

describe('keyboard-trap', () => {
  it('fires when the same element receives focus on two consecutive Tab presses', () => {
    const candidates = extractKeyboardNavigationCandidates(
      baseInput({ focusSequence: [0, 1, 2, 2, 2] }),
    );
    const traps = candidates.filter((c) => c.ruleId === KEYBOARD_TRAP_RULE_ID);
    expect(traps).toHaveLength(1);
    expect(traps[0]?.category).toBe('accessibility');
    expect(traps[0]?.severity).toBe('critical');
    expect(traps[0]?.element?.selector).toBe('button:nth-of-type(1)');
  });

  it('does not fire when focus always advances to a different element', () => {
    const candidates = extractKeyboardNavigationCandidates(
      baseInput({ focusSequence: [0, 1, 2, 3, 0, 1] }),
    );
    expect(candidates.filter((c) => c.ruleId === KEYBOARD_TRAP_RULE_ID)).toEqual([]);
  });

  it('does not fire on a null gap in the sequence (focus left the tabbable set, not evidence of a trap)', () => {
    const candidates = extractKeyboardNavigationCandidates(
      baseInput({ focusSequence: [0, null, 1] }),
    );
    expect(candidates.filter((c) => c.ruleId === KEYBOARD_TRAP_RULE_ID)).toEqual([]);
  });

  it('reports only one trap finding even if focus is stuck for many consecutive presses', () => {
    const candidates = extractKeyboardNavigationCandidates(
      baseInput({ focusSequence: [0, 1, 1, 1, 1, 1] }),
    );
    expect(candidates.filter((c) => c.ruleId === KEYBOARD_TRAP_RULE_ID)).toHaveLength(1);
  });
});

describe('focus-order-mismatch', () => {
  it('does not fire for a normal forward-only tab sequence', () => {
    expect(extractKeyboardNavigationCandidates(baseInput({ focusSequence: [0, 1, 2, 3] }))).toEqual(
      [],
    );
  });

  it('does not fire for a single backward jump', () => {
    const candidates = extractKeyboardNavigationCandidates(
      baseInput({ focusSequence: [0, 2, 1, 3] }),
    );
    expect(candidates.filter((c) => c.ruleId === FOCUS_ORDER_MISMATCH_RULE_ID)).toEqual([]);
  });

  it('fires for two or more backward jumps', () => {
    const candidates = extractKeyboardNavigationCandidates(
      baseInput({ focusSequence: [2, 0, 3, 1] }),
    );
    const mismatches = candidates.filter((c) => c.ruleId === FOCUS_ORDER_MISMATCH_RULE_ID);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]?.category).toBe('accessibility');
    expect(mismatches[0]?.severity).toBe('moderate');
    expect(mismatches[0]?.element).toBeNull();
  });

  it('does not fire for an empty focus sequence', () => {
    expect(
      extractKeyboardNavigationCandidates(baseInput({ tabbableCount: 0, focusSequence: [] })),
    ).toEqual([]);
  });
});

// Plan 075 J3, on the stored walks: a consent banner or popup open on load
// kept focus inside itself, so the walk measured the dialog, not the page.
describe('a Tab walk held by a dialog', () => {
  /** 60 presses cycling through `ids`, on a page of `tabbableCount`. */
  function cycling(ids: number[], tabbableCount: number): KeyboardNavigationCheckInput {
    return baseInput({
      tabbableCount,
      tabbableSelectors: Array.from({ length: tabbableCount }, (_, i) => `#t${i}`),
      focusSequence: Array.from({ length: 60 }, (_, i) => ids[i % ids.length]!),
    });
  }

  // Grand Hôtel des Alpes: Complianz's six banner controls, cycled ten times.
  it('gives no finding when focus cycles through a consent banner', () => {
    const walk = cycling([112, 113, 114, 115, 116, 117], 140);
    expect(isTabWalkHeldByDialog(walk)).toBe(true);
    expect(extractKeyboardNavigationCandidates(walk)).toEqual([]);
  });

  // Regina: Didomi's four controls, whose tab order is not DOM order, which
  // counted as two backward jumps per cycle before.
  it('gives no focus-order finding for a banner whose own order is not DOM order', () => {
    const walk = cycling([301, 299, 300, 298], 420);
    expect(extractKeyboardNavigationCandidates(walk)).toEqual([]);
  });

  it('uses the recorded containers when the scanner has them', () => {
    const inBanner = {
      ...cycling([10, 11, 12], 40),
      tabbableContainers: Array.from({ length: 40 }, (_, i) =>
        i >= 10 && i <= 12 ? '#didomi-host' : null,
      ),
    };
    const outside = { ...inBanner, tabbableContainers: Array(40).fill(null) as null[] };
    expect(isTabWalkHeldByDialog(inBanner)).toBe(true);
    expect(isTabWalkHeldByDialog(outside)).toBe(false);
  });

  // Hotel Europe: `#date_evenement` returns false on keydown, a real trap.
  it('still reports a single field that refuses Tab', () => {
    const walk = baseInput({
      tabbableCount: 30,
      tabbableSelectors: Array.from({ length: 30 }, (_, i) =>
        i === 7 ? '#date_evenement' : `#t${i}`,
      ),
      focusSequence: [5, 6, 7, ...Array<number>(40).fill(7)],
    });
    expect(isTabWalkHeldByDialog(walk)).toBe(false);
    const traps = extractKeyboardNavigationCandidates(walk).filter(
      (c) => c.ruleId === KEYBOARD_TRAP_RULE_ID,
    );
    expect(traps.map((c) => c.element?.selector)).toEqual(['#date_evenement']);
  });

  it('does not read a page walked end to end and wrapped round as held', () => {
    const walk = baseInput({ focusSequence: [0, 1, 2, 3, null, 0, 1, 2, 3] });
    expect(isTabWalkHeldByDialog(walk)).toBe(false);
    expect(extractKeyboardNavigationCandidates(walk)).toEqual([]);
  });
});

describe('focus-order inversions are counted within one pass', () => {
  it('does not count the wrap from the last control back to the first', () => {
    const walk = baseInput({
      tabbableCount: 6,
      tabbableSelectors: Array.from({ length: 6 }, (_, i) => `#t${i}`),
      focusSequence: [0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4],
    });
    expect(
      extractKeyboardNavigationCandidates(walk).filter(
        (c) => c.ruleId === FOCUS_ORDER_MISMATCH_RULE_ID,
      ),
    ).toEqual([]);
  });

  it('still reports two real backward jumps in one pass', () => {
    const walk = baseInput({
      tabbableCount: 6,
      tabbableSelectors: Array.from({ length: 6 }, (_, i) => `#t${i}`),
      focusSequence: [3, 0, 4, 1, 5, 2, 3],
    });
    expect(
      extractKeyboardNavigationCandidates(walk).filter(
        (c) => c.ruleId === FOCUS_ORDER_MISMATCH_RULE_ID,
      ),
    ).toHaveLength(1);
  });
});

describe('a stored walk that returns to one control', () => {
  // villasfoch, 2026-09-22: every walk alternated the close button of
  // `#notificationModal` with a focus outside the tabbables, 25 of 25 pages.
  const modalWalk = baseInput({
    tabbableCount: 17,
    tabbableSelectors: Array.from({ length: 17 }, (_, index) =>
      index === 12
        ? '#notificationModal > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > button:nth-child(1)'
        : `a:nth-of-type(${index + 1})`,
    ),
    focusSequence: [12, null, 12, null, 12, null, 12, null, 12, null, 12, null],
  });

  it('is held, so it states nothing about the page', () => {
    expect(isTabWalkHeldByDialog(modalWalk)).toBe(true);
    expect(extractKeyboardNavigationCandidates(modalWalk)).toEqual([]);
  });

  it('is not held on a page with a single tabbable', () => {
    expect(
      isTabWalkHeldByDialog(baseInput({ tabbableCount: 1, focusSequence: [0, null, 0, null] })),
    ).toBe(false);
  });
});

describe('a carousel that moves during the walk (issue #562)', () => {
  // aflatta /chambres-et-suites: 31, 33, 34, then 32, and later 41, then 37;
  // 32 and 37 are first-slide links of two looping carousels.
  const focusSequence = [30, 31, 33, 34, 32, 35, 36, 38, 39, 40, 41, 37, 42];
  const carouselWalk = (skippedOutOfReach?: number[][]) =>
    baseInput({
      tabbableCount: 50,
      tabbableSelectors: Array.from({ length: 50 }, (_, i) => `a:nth-of-type(${i + 1})`),
      focusSequence,
      ...(skippedOutOfReach !== undefined ? { skippedOutOfReach } : {}),
    });

  it('does not count a jump back to a slide the walk skipped while it was out of reach', () => {
    const skipped = focusSequence.map((id) => (id === 33 ? [32] : id === 38 ? [37] : []));
    const candidates = extractKeyboardNavigationCandidates(carouselWalk(skipped));
    expect(candidates.filter((c) => c.ruleId === FOCUS_ORDER_MISMATCH_RULE_ID)).toEqual([]);
  });

  it('still counts a jump back to an element that was reachable when the walk passed it', () => {
    const candidates = extractKeyboardNavigationCandidates(
      carouselWalk(focusSequence.map(() => [])),
    );
    expect(candidates.filter((c) => c.ruleId === FOCUS_ORDER_MISMATCH_RULE_ID)).toHaveLength(1);
  });

  it('judges a walk stored before the record as before', () => {
    const candidates = extractKeyboardNavigationCandidates(carouselWalk());
    expect(candidates.filter((c) => c.ruleId === FOCUS_ORDER_MISMATCH_RULE_ID)).toHaveLength(1);
  });
});
