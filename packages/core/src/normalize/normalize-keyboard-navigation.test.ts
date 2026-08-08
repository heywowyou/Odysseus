import { describe, expect, it } from 'vitest';
import {
  extractKeyboardNavigationCandidates,
  KEYBOARD_TRAP_RULE_ID,
  FOCUS_ORDER_MISMATCH_RULE_ID,
  type KeyboardNavigationCheckInput,
} from './normalize-keyboard-navigation.js';

const PAGE_URL = 'https://example.com/';

function baseInput(overrides: Partial<KeyboardNavigationCheckInput> = {}): KeyboardNavigationCheckInput {
  return {
    pageUrl: PAGE_URL,
    tabbableCount: 4,
    tabbableSelectors: ['a:nth-of-type(1)', 'a:nth-of-type(2)', 'button:nth-of-type(1)', 'button:nth-of-type(2)'],
    focusSequence: [0, 1, 2, 3],
    ...overrides,
  };
}

describe('keyboard-trap', () => {
  it('fires when the same element receives focus on two consecutive Tab presses', () => {
    const candidates = extractKeyboardNavigationCandidates(baseInput({ focusSequence: [0, 1, 2, 2, 2] }));
    const traps = candidates.filter((c) => c.ruleId === KEYBOARD_TRAP_RULE_ID);
    expect(traps).toHaveLength(1);
    expect(traps[0]?.category).toBe('accessibility');
    expect(traps[0]?.severity).toBe('critical');
    expect(traps[0]?.element?.selector).toBe('button:nth-of-type(1)');
  });

  it('does not fire when focus always advances to a different element', () => {
    const candidates = extractKeyboardNavigationCandidates(baseInput({ focusSequence: [0, 1, 2, 3, 0, 1] }));
    expect(candidates.filter((c) => c.ruleId === KEYBOARD_TRAP_RULE_ID)).toEqual([]);
  });

  it('does not fire on a null gap in the sequence (focus left the tabbable set, not evidence of a trap)', () => {
    const candidates = extractKeyboardNavigationCandidates(baseInput({ focusSequence: [0, null, 1] }));
    expect(candidates.filter((c) => c.ruleId === KEYBOARD_TRAP_RULE_ID)).toEqual([]);
  });

  it('reports only one trap finding even if focus is stuck for many consecutive presses', () => {
    const candidates = extractKeyboardNavigationCandidates(baseInput({ focusSequence: [0, 1, 1, 1, 1, 1] }));
    expect(candidates.filter((c) => c.ruleId === KEYBOARD_TRAP_RULE_ID)).toHaveLength(1);
  });
});

describe('focus-order-mismatch', () => {
  it('does not fire for a normal forward-only tab sequence', () => {
    expect(
      extractKeyboardNavigationCandidates(baseInput({ focusSequence: [0, 1, 2, 3] })),
    ).toEqual([]);
  });

  it('does not fire for a single backward jump', () => {
    const candidates = extractKeyboardNavigationCandidates(baseInput({ focusSequence: [0, 2, 1, 3] }));
    expect(candidates.filter((c) => c.ruleId === FOCUS_ORDER_MISMATCH_RULE_ID)).toEqual([]);
  });

  it('fires for two or more backward jumps', () => {
    const candidates = extractKeyboardNavigationCandidates(baseInput({ focusSequence: [2, 0, 3, 1] }));
    const mismatches = candidates.filter((c) => c.ruleId === FOCUS_ORDER_MISMATCH_RULE_ID);
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]?.category).toBe('accessibility');
    expect(mismatches[0]?.severity).toBe('moderate');
    expect(mismatches[0]?.element).toBeNull();
  });

  it('does not fire for an empty focus sequence', () => {
    expect(extractKeyboardNavigationCandidates(baseInput({ tabbableCount: 0, focusSequence: [] }))).toEqual([]);
  });
});
