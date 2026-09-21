import { describe, it, expect } from 'vitest';
import {
  ACTIVE_OUTREACH_THREAD_STATES,
  TERMINAL_OUTREACH_THREAD_STATES,
  canTransitionOutreachThread,
  effectiveOutreachThreadState,
  isTerminalOutreachThreadState,
  type OutreachThreadState,
} from './outreach-thread-state.js';

const ALL_STATES: readonly OutreachThreadState[] = [
  'open',
  'e1-drafted',
  'e1-sent',
  'e2-drafted',
  'e2-sent',
  'e3-drafted',
  'e3-sent',
  'replied',
  'bounced',
  'opted-out',
  'sequence-complete',
  'closed',
];

describe('canTransitionOutreachThread', () => {
  it('allows the whole happy-path sequence', () => {
    const sequence: OutreachThreadState[] = [
      'open',
      'e1-drafted',
      'e1-sent',
      'e2-drafted',
      'e2-sent',
      'e3-drafted',
      'e3-sent',
      'sequence-complete',
      'closed',
    ];
    for (let index = 0; index < sequence.length - 1; index += 1) {
      expect(
        canTransitionOutreachThread(
          sequence[index] as OutreachThreadState,
          sequence[index + 1] as OutreachThreadState,
        ),
      ).toBe(true);
    }
  });

  it('allows a reply, a bounce, or an opt-out after any sent touch', () => {
    for (const from of ['e1-sent', 'e2-sent', 'e3-sent'] as const) {
      expect(canTransitionOutreachThread(from, 'replied')).toBe(true);
      expect(canTransitionOutreachThread(from, 'bounced')).toBe(true);
      expect(canTransitionOutreachThread(from, 'opted-out')).toBe(true);
    }
  });

  it('allows an opt-out before any draft exists', () => {
    expect(canTransitionOutreachThread('open', 'opted-out')).toBe(true);
    expect(canTransitionOutreachThread('e1-drafted', 'opted-out')).toBe(true);
  });

  it('never allows a bounce before a message was actually sent', () => {
    for (const from of ['open', 'e1-drafted', 'e2-drafted', 'e3-drafted'] as const) {
      expect(canTransitionOutreachThread(from, 'bounced')).toBe(false);
    }
  });

  it('rejects skipping a touch', () => {
    expect(canTransitionOutreachThread('open', 'e1-sent')).toBe(false);
    expect(canTransitionOutreachThread('e1-sent', 'e3-drafted')).toBe(false);
    expect(canTransitionOutreachThread('e1-drafted', 'e2-drafted')).toBe(false);
  });

  it('rejects moving backwards', () => {
    expect(canTransitionOutreachThread('e2-sent', 'e1-sent')).toBe(false);
    expect(canTransitionOutreachThread('e3-sent', 'e2-drafted')).toBe(false);
    expect(canTransitionOutreachThread('replied', 'e1-sent')).toBe(false);
  });

  it('rejects drafting a fourth touch', () => {
    expect(canTransitionOutreachThread('e3-sent', 'e3-drafted')).toBe(false);
  });

  it('rejects every transition out of a terminal state except its own closure', () => {
    for (const state of TERMINAL_OUTREACH_THREAD_STATES) {
      for (const target of ALL_STATES) {
        if (target === 'closed') continue;
        expect(canTransitionOutreachThread(state, target)).toBe(false);
      }
    }
  });

  it('lets every terminal state reach closed, including closed itself refusing further motion', () => {
    for (const state of TERMINAL_OUTREACH_THREAD_STATES) {
      if (state === 'closed') continue;
      expect(canTransitionOutreachThread(state, 'closed')).toBe(true);
    }
    for (const target of ALL_STATES) {
      expect(canTransitionOutreachThread('closed', target)).toBe(false);
    }
  });
});

describe('isTerminalOutreachThreadState', () => {
  it('agrees with the terminal-state list', () => {
    for (const state of ALL_STATES) {
      expect(isTerminalOutreachThreadState(state)).toBe(
        TERMINAL_OUTREACH_THREAD_STATES.includes(state),
      );
    }
  });

  it('never overlaps with the active-state list', () => {
    for (const state of ACTIVE_OUTREACH_THREAD_STATES) {
      expect(TERMINAL_OUTREACH_THREAD_STATES.includes(state)).toBe(false);
    }
  });

  it('the active and terminal lists together cover every state exactly once', () => {
    const union = [...ACTIVE_OUTREACH_THREAD_STATES, ...TERMINAL_OUTREACH_THREAD_STATES];
    expect(union.length).toBe(ALL_STATES.length);
    expect(new Set(union)).toEqual(new Set(ALL_STATES));
  });
});

describe('effectiveOutreachThreadState', () => {
  it('reads a drafted state whose draft was discarded as the state before the draft', () => {
    expect(effectiveOutreachThreadState('e1-drafted', [])).toBe('open');
    expect(effectiveOutreachThreadState('e2-drafted', [])).toBe('e1-sent');
    expect(effectiveOutreachThreadState('e3-drafted', [1, 2])).toBe('e2-sent');
  });

  it('keeps a drafted state while its touch has a live draft', () => {
    expect(effectiveOutreachThreadState('e1-drafted', [1])).toBe('e1-drafted');
    expect(effectiveOutreachThreadState('e2-drafted', [2])).toBe('e2-drafted');
  });

  it('never changes a state that names no drafted touch', () => {
    for (const state of ALL_STATES.filter((candidate) => !candidate.endsWith('-drafted'))) {
      expect(effectiveOutreachThreadState(state, [])).toBe(state);
    }
  });
});
