import { OUTREACH_LOST_REASONS, OUTREACH_OUTCOMES, outreachLostReasonRule } from '@odysseus/core';
import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { fr } from '../i18n/fr';
import { LOST_REASONS } from '../i18n/sections/labels';
import { LOST_REASON_RULE, outcomeRequestBody } from './outcome-select';

// The dashboard reads no workspace package at runtime, so it carries the
// decline vocabulary and its rule by value. These hold both equal to core.
describe('decline reasons in the dashboard', () => {
  it('lists the reasons core accepts, in the same order', () => {
    expect(LOST_REASONS).toEqual(OUTREACH_LOST_REASONS);
  });

  it('labels every reason in both languages', () => {
    for (const strings of [fr, en]) {
      expect(Object.keys(strings.labels.lostReason).sort()).toEqual(
        [...OUTREACH_LOST_REASONS].sort(),
      );
    }
  });

  it('asks for a reason exactly where the route requires or accepts one', () => {
    for (const outcome of OUTREACH_OUTCOMES) {
      const rule = outreachLostReasonRule(outcome);
      expect(LOST_REASON_RULE[outcome]).toBe(rule === 'refused' ? undefined : rule);
    }
  });

  it('sends the reason only when one was chosen', () => {
    expect(outcomeRequestBody({ outcome: 'won', requestKey: 'key-12345' })).toEqual({
      outcome: 'won',
      idempotencyKey: 'key-12345',
    });
    expect(
      outcomeRequestBody({ outcome: 'lost', lostReason: 'timing', requestKey: 'key-12345' }),
    ).toEqual({ outcome: 'lost', lostReason: 'timing', idempotencyKey: 'key-12345' });
  });
});
