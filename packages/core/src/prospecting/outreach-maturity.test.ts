import { describe, expect, it } from 'vitest';
import {
  OUTREACH_CLOSED_REASONS,
  OUTREACH_MATURITY_BUCKETS,
  classifyOutreachMaturity,
  earliestOutreachMaturityDate,
  isDeliveredOutreachBucket,
  isMaturedOutreachBucket,
  projectOutreachCheckpoints,
  type OutreachMaturityBucket,
  type OutreachMaturityThread,
} from './outreach-maturity.js';
import { OUTREACH_OUTCOMES } from './outreach-outcome.js';
import {
  ACTIVE_OUTREACH_THREAD_STATES,
  TERMINAL_OUTREACH_THREAD_STATES,
  type OutreachThreadState,
} from './outreach-thread-state.js';

const spacing = { touch2AfterDays: 4, touch3AfterDays: 11, replyWindowDays: 14 };
const day = (value: string): Date => new Date(`${value}T08:00:00.000Z`);

function thread(
  state: OutreachThreadState,
  touchesSent: number,
  extra: Partial<OutreachMaturityThread> = {},
): OutreachMaturityThread {
  return {
    state,
    spacing,
    touches: Array.from({ length: touchesSent }, (_, index) => ({
      touch: index + 1,
      sentAt: day('2026-09-01'),
    })),
    ...extra,
  };
}

describe('classifyOutreachMaturity', () => {
  const expected: Record<OutreachThreadState, [touches: number, OutreachMaturityBucket]> = {
    open: [0, 'prepared'],
    'e1-drafted': [0, 'prepared'],
    'e1-sent': [1, 'in-sequence'],
    'e2-drafted': [1, 'in-sequence'],
    'e2-sent': [2, 'in-sequence'],
    'e3-drafted': [2, 'in-sequence'],
    'e3-sent': [3, 'reply-window'],
    replied: [1, 'matured-replied'],
    bounced: [1, 'undelivered'],
    'opted-out': [1, 'matured-replied'],
    'sequence-complete': [3, 'matured-silent'],
    // A closed thread is decided by its reason, covered below.
    closed: [1, 'closed-other'],
  };

  it('knows every thread state', () => {
    const states = [...ACTIVE_OUTREACH_THREAD_STATES, ...TERMINAL_OUTREACH_THREAD_STATES];
    expect(new Set(states)).toEqual(new Set(Object.keys(expected)));
  });

  it.each(Object.entries(expected) as [OutreachThreadState, [number, OutreachMaturityBucket]][])(
    'puts a %s thread in one bucket',
    (state, [touches, bucket]) => {
      const result = classifyOutreachMaturity(thread(state, touches));
      expect(result).toBe(bucket);
      expect(OUTREACH_MATURITY_BUCKETS).toContain(result);
    },
  );

  it('maps every reason a thread is closed for', () => {
    const byReason = Object.fromEntries(
      OUTREACH_CLOSED_REASONS.map((reason) => [
        reason,
        classifyOutreachMaturity(thread('closed', 1, { stateReason: reason })),
      ]),
    );
    expect(byReason).toEqual({
      'operator-confirmed-send': 'matured-silent',
      'opted-out': 'matured-silent',
      'prospect-deleted': 'matured-silent',
    });
  });

  it('counts a first email merged into another message as merged, not delivered', () => {
    const merged = classifyOutreachMaturity({
      state: 'closed',
      stateReason: 'operator-confirmed-send',
      spacing,
      touches: [{ touch: 1, sentAt: day('2026-09-01'), confirmedBy: 'operator' }],
    });
    expect(merged).toBe('merged');
    expect(isDeliveredOutreachBucket(merged)).toBe(false);
  });

  it('keeps a first email delivered when only its follow-up went out elsewhere', () => {
    const bucket = classifyOutreachMaturity({
      state: 'closed',
      stateReason: 'operator-confirmed-send',
      spacing,
      touches: [
        { touch: 1, sentAt: day('2026-09-01') },
        { touch: 2, sentAt: day('2026-09-05'), confirmedBy: 'operator' },
      ],
    });
    expect(bucket).toBe('matured-silent');
  });

  it('keeps a thread closed for an unknown reason in its own bucket', () => {
    for (const stateReason of ['some new reason', undefined]) {
      const bucket = classifyOutreachMaturity(thread('closed', 2, { stateReason }));
      expect(bucket).toBe('closed-other');
      expect(isDeliveredOutreachBucket(bucket)).toBe(true);
      expect(isMaturedOutreachBucket(bucket)).toBe(false);
    }
  });

  it('never counts a thread with no first email as delivered, whatever closed it', () => {
    for (const stateReason of [...OUTREACH_CLOSED_REASONS, 'some new reason']) {
      expect(classifyOutreachMaturity(thread('closed', 0, { stateReason }))).toBe('prepared');
    }
    expect(classifyOutreachMaturity(thread('open', 0, { outcome: 'call' }))).toBe('prepared');
  });

  it('excludes bounced and merged first emails from delivered', () => {
    const delivered = OUTREACH_MATURITY_BUCKETS.filter(isDeliveredOutreachBucket);
    expect(delivered).toEqual([
      'in-sequence',
      'reply-window',
      'matured-replied',
      'matured-silent',
      'closed-other',
    ]);
    expect(isDeliveredOutreachBucket(classifyOutreachMaturity(thread('bounced', 1)))).toBe(false);
  });

  it('moves a late reply from silent to replied without changing what is matured', () => {
    const silent = classifyOutreachMaturity(thread('sequence-complete', 3));
    const replied = classifyOutreachMaturity(
      thread('sequence-complete', 3, { outcome: 'reply-not-now' }),
    );
    expect([silent, replied]).toEqual(['matured-silent', 'matured-replied']);
    expect(isMaturedOutreachBucket(silent) && isMaturedOutreachBucket(replied)).toBe(true);
  });

  it('reads every recorded outcome but no-reply as a reply', () => {
    for (const outcome of OUTREACH_OUTCOMES) {
      expect(classifyOutreachMaturity(thread('e1-sent', 1, { outcome }))).toBe(
        outcome === 'no-reply' ? 'in-sequence' : 'matured-replied',
      );
    }
  });
});

describe('earliestOutreachMaturityDate', () => {
  it('counts from the last touch sent, each follow-up due after the one before it', () => {
    const touches = [
      { touch: 1, sentAt: day('2026-09-01') },
      { touch: 2, sentAt: day('2026-09-07') },
      { touch: 3, sentAt: day('2026-09-20') },
    ];
    const at = (state: OutreachThreadState, sent: number): string | undefined =>
      earliestOutreachMaturityDate({ state, spacing, touches: touches.slice(0, sent) })
        ?.toISOString()
        .slice(0, 10);
    // 1 September + 4 + 11 + 14 days.
    expect(at('e1-sent', 1)).toBe('2026-09-30');
    // The second email left two days late: 7 September + 11 + 14 days.
    expect(at('e2-sent', 2)).toBe('2026-10-02');
    expect(at('e3-sent', 3)).toBe('2026-10-04');
  });

  it('is undefined for a thread that is not waiting to mature', () => {
    expect(earliestOutreachMaturityDate(thread('open', 0))).toBeUndefined();
    expect(earliestOutreachMaturityDate(thread('replied', 1))).toBeUndefined();
    expect(earliestOutreachMaturityDate(thread('sequence-complete', 3))).toBeUndefined();
    expect(earliestOutreachMaturityDate(thread('bounced', 1))).toBeUndefined();
  });
});

describe('projectOutreachCheckpoints', () => {
  const base = {
    matured: 40,
    pendingMaturity: [
      { day: '2026-10-12', threads: 30 },
      { day: '2026-10-20', threads: 40 },
    ],
    recentFirstTouchSends: 56,
    firstSendDay: '2026-09-24',
    sequenceDays: 29,
    today: '2026-10-10',
  };

  it('dates a checkpoint the threads already sent will reach, and estimates the ones beyond', () => {
    expect(projectOutreachCheckpoints(base)).toEqual([
      // 40 matured + 30 on the 12th is 70; the 20th brings 110.
      { checkpoint: 100, kind: 'dated', day: '2026-10-20' },
      // 190 first emails still to send at 4 a day is 48 days, plus 29 to mature.
      { checkpoint: 300, kind: 'estimated', day: '2026-12-26', firstTouchesPerDay: 4 },
      { checkpoint: 500, kind: 'estimated', day: '2027-02-14', firstTouchesPerDay: 4 },
    ]);
  });

  it('reports a checkpoint already reached', () => {
    expect(projectOutreachCheckpoints({ ...base, matured: 100 })[0]).toEqual({
      checkpoint: 100,
      kind: 'reached',
    });
  });

  it('gives no estimate from fewer than seven days of sending', () => {
    const projection = projectOutreachCheckpoints({ ...base, firstSendDay: '2026-10-04' });
    expect(projection[0]).toMatchObject({ kind: 'dated' });
    expect(projection.slice(1).map((entry) => entry.kind)).toEqual(['no-estimate', 'no-estimate']);
    expect(projectOutreachCheckpoints({ ...base, firstSendDay: '2026-10-03' })[1]).toMatchObject({
      kind: 'estimated',
    });
  });

  it('gives no estimate when nothing was sent recently or ever', () => {
    for (const input of [
      { ...base, recentFirstTouchSends: 0 },
      { ...base, firstSendDay: undefined },
    ]) {
      expect(projectOutreachCheckpoints(input)[1]).toEqual({
        checkpoint: 300,
        kind: 'no-estimate',
      });
    }
  });

  it('never dates a checkpoint before today when a follow-up is late', () => {
    const projection = projectOutreachCheckpoints({
      ...base,
      matured: 95,
      pendingMaturity: [{ day: '2026-10-01', threads: 5 }],
    });
    expect(projection[0]).toEqual({ checkpoint: 100, kind: 'dated', day: '2026-10-10' });
  });
});
