import { describe, expect, it } from 'vitest';
import { outreachDueDayStart } from './outreach-due-day.js';

const due = (sentAt: string, afterDays: number): string =>
  outreachDueDayStart(new Date(sentAt), afterDays).toISOString();

describe('outreachDueDayStart', () => {
  it('is midnight in Paris of the day the spacing lands on, whatever the hour of the send', () => {
    // Summer time: Paris is two hours ahead of UTC.
    for (const sentAt of [
      '2026-09-01T05:10:00.000Z',
      '2026-09-01T09:30:00.000Z',
      '2026-09-01T21:59:59.000Z',
    ]) {
      expect(due(sentAt, 4)).toBe('2026-09-04T22:00:00.000Z');
    }
  });

  it('counts the day in Paris, not in UTC', () => {
    // 22:30 UTC on 1 September is already 2 September in Paris.
    expect(due('2026-09-01T22:30:00.000Z', 4)).toBe('2026-09-05T22:00:00.000Z');
  });

  it('stays at midnight across a clock change', () => {
    // Clocks go back on 25 October 2026: midnight is then one hour ahead of UTC.
    expect(due('2026-10-20T09:00:00.000Z', 4)).toBe('2026-10-23T22:00:00.000Z');
    expect(due('2026-10-20T09:00:00.000Z', 11)).toBe('2026-10-30T23:00:00.000Z');
    // And forward on 28 March 2027.
    expect(due('2027-03-20T09:00:00.000Z', 11)).toBe('2027-03-30T22:00:00.000Z');
    expect(due('2027-01-10T09:00:00.000Z', 4)).toBe('2027-01-13T23:00:00.000Z');
  });
});
