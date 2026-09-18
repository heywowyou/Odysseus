import { describe, expect, it } from 'vitest';
import { canDelete, canStop } from './job-actions';

describe('canStop', () => {
  it('is true while the job may still run', () => {
    expect(canStop('queued')).toBe(true);
    expect(canStop('running')).toBe(true);
  });

  it('is false once the job reached a final status', () => {
    expect(canStop('complete')).toBe(false);
    expect(canStop('failed')).toBe(false);
    expect(canStop('cancel-requested')).toBe(false);
    expect(canStop('cancelled')).toBe(false);
  });
});

describe('canDelete', () => {
  it('is false while work is running or stopping', () => {
    expect(canDelete('running')).toBe(false);
    expect(canDelete('cancel-requested')).toBe(false);
  });

  it('is true once work is not running or stopping', () => {
    expect(canDelete('queued')).toBe(true);
    expect(canDelete('complete')).toBe(true);
    expect(canDelete('failed')).toBe(true);
    expect(canDelete('cancelled')).toBe(true);
  });
});
