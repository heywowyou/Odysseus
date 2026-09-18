import { describe, expect, it } from 'vitest';
import { ATTENTION_KINDS, CAPABILITY_CONSEQUENCES } from '../../operator/contract';
import { TODO_ROW_ACTIONS, TODO_ROW_KINDS } from './api-types';
import { en } from '../i18n/en';
import { fr } from '../i18n/fr';

/**
 * Plan 060 §16.1 copy closure for the vocabularies operator-copy.test.ts
 * does not already cover: the capability consequence codes (plan 060 §16,
 * "every capability/recovery code has FR/EN copy") and the À-traiter
 * stable row actions and kinds. Every table must cover exactly the closed
 * set — a new code without copy in both languages fails here instead of
 * rendering a raw code, and a deleted code fails here instead of leaving
 * dead copy behind.
 */

describe('capability consequence copy', () => {
  it('has FR and EN copy for exactly the closed consequence codes', () => {
    for (const strings of [fr, en]) {
      expect(Object.keys(strings.workState.consequences).sort()).toEqual(
        [...CAPABILITY_CONSEQUENCES].sort(),
      );
      for (const copy of Object.values(strings.workState.consequences)) {
        expect(copy.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('À-traiter stable-code copy', () => {
  it('has FR and EN copy for exactly the closed row actions', () => {
    for (const strings of [fr, en]) {
      expect(Object.keys(strings.aTraiter.actions).sort()).toEqual([...TODO_ROW_ACTIONS].sort());
    }
  });

  it('covers every row kind exactly once: prospect-work kinds here, attention kinds in strings.attention', () => {
    const attentionKinds = ATTENTION_KINDS as readonly string[];
    const prospectWorkKinds = TODO_ROW_KINDS.filter((kind) => !attentionKinds.includes(kind));
    for (const strings of [fr, en]) {
      expect(Object.keys(strings.aTraiter.kinds).sort()).toEqual(prospectWorkKinds.sort());
      // The attention-owned kinds keep their decision copy in
      // strings.attention (plan 060 §8), already proven exhaustive there.
      expect(attentionKinds).toEqual(
        expect.arrayContaining(TODO_ROW_KINDS.filter((kind) => !prospectWorkKinds.includes(kind))),
      );
    }
  });
});
