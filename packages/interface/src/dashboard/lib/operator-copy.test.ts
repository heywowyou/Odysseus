import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_BLOCK_REASONS,
  OPERATOR_WORK_STATES,
  PROBLEM_CODES,
} from '../../operator/contract';
import { en } from '../i18n/en';
import { fr } from '../i18n/fr';
import { ApiError, parseApiErrorBody } from './api';
import { isStateChanged, problemCopy } from './operator-copy';

describe('operator vocabulary copy', () => {
  it('has FR and EN copy for every server state, problem and blocking reason', () => {
    for (const strings of [fr, en]) {
      expect(Object.keys(strings.workState.states).sort()).toEqual(
        [...OPERATOR_WORK_STATES].sort(),
      );
      expect(Object.keys(strings.workState.problems).sort()).toEqual([...PROBLEM_CODES].sort());
      expect(Object.keys(strings.workState.blockReasons).sort()).toEqual(
        [...CAPABILITY_BLOCK_REASONS].sort(),
      );
    }
  });
});

describe('parseApiErrorBody', () => {
  it('reads the typed envelope and the legacy string error', () => {
    expect(
      parseApiErrorBody(
        { error: { code: 'state-changed', message: 'changed', retryable: true } },
        'fallback',
      ),
    ).toEqual({
      message: 'changed',
      problem: { code: 'state-changed', message: 'changed', retryable: true },
    });
    expect(parseApiErrorBody({ error: 'legacy' }, 'fallback')).toEqual({ message: 'legacy' });
    expect(parseApiErrorBody({}, 'fallback')).toEqual({ message: 'fallback' });
  });
});

describe('problemCopy', () => {
  it('chooses copy from the typed reason, never from the English message', () => {
    const blocked = new ApiError('whatever the server said', 409, {
      code: 'action-blocked',
      message: 'whatever the server said',
      reasonCode: 'work-finishing',
    });
    expect(problemCopy(blocked, fr.workState)).toBe(fr.workState.blockReasons['work-finishing']);
    const stale = new ApiError('x', 409, { code: 'state-changed', message: 'x' });
    expect(problemCopy(stale, en.workState)).toBe(en.workState.problems['state-changed']);
    expect(isStateChanged(stale)).toBe(true);
    expect(problemCopy(new ApiError('legacy', 409), en.workState)).toBeUndefined();
  });
});
