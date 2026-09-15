import { describe, expect, it } from 'vitest';
import { decideAutomaticStatus } from './prospect-status-policy.js';

describe('automatic prospect status policy', () => {
  it('allows the two terminal branches from quoted', () => {
    expect(decideAutomaticStatus('quoted', 'won')).toEqual({ allowed: true, changed: true });
    expect(decideAutomaticStatus('quoted', 'lost')).toEqual({ allowed: true, changed: true });
  });

  it('refuses terminal sibling changes and all movement from opted-out', () => {
    expect(decideAutomaticStatus('won', 'lost')).toEqual({ allowed: false, changed: false });
    expect(decideAutomaticStatus('lost', 'won')).toEqual({ allowed: false, changed: false });
    expect(decideAutomaticStatus('opted-out', 'quoted')).toEqual({
      allowed: false,
      changed: false,
    });
  });

  it('refuses regression along the non-terminal path', () => {
    expect(decideAutomaticStatus('quoted', 'replied')).toEqual({
      allowed: false,
      changed: false,
    });
  });

  it('treats repeated status writes as idempotent', () => {
    expect(decideAutomaticStatus('won', 'won')).toEqual({ allowed: true, changed: false });
  });
});
