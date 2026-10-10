import type { OutreachCampaignReport } from '@odysseus/store';

const none = { delivered: 0, matured: 0, replies: 0, positiveReplies: 0 };

/** One campaign as the server reports it, typed against the store so the
 *  fixture cannot drift from what the route actually sends. Counts only. */
export const CAMPAIGN_FIXTURE: OutreachCampaignReport = {
  campaignVersion: 'first-100-2026-09',
  threads: 64,
  firstTouchSent: 62,
  replied: 4,
  bounced: 2,
  optedOut: 1,
  won: 1,
  repliesAfterTouch: { 1: 3, 2: 1, 3: 0 },
  outcomes: {
    'no-reply': 0,
    'reply-positive': 1,
    'reply-not-now': 1,
    'reply-negative': 2,
    'opt-out': 0,
    call: 0,
    quoted: 0,
    won: 1,
    lost: 0,
  },
  results: {
    maturity: {
      prepared: 2,
      'in-sequence': 18,
      'reply-window': 7,
      'matured-replied': 6,
      'matured-silent': 28,
      undelivered: 2,
      merged: 1,
      'closed-other': 0,
    },
    delivered: 59,
    matured: 34,
    positiveReplies: 2,
    objections: 1,
    repliesByLastTouch: { 1: 4, 2: 2, 3: 0 },
    declineReasons: {
      'existing-provider': 1,
      'misread-offer': 2,
      'not-a-priority': 0,
      budget: 0,
      timing: 1,
      'wrong-recipient': 0,
      'scope-mismatch': 0,
      other: 0,
      unspecified: 1,
    },
    segments: {
      stars: {
        '1': none,
        '2': none,
        '3': { delivered: 37, matured: 22, replies: 5, positiveReplies: 2 },
        '4': { delivered: 19, matured: 11, replies: 1, positiveReplies: 0 },
        '5': none,
        unknown: { delivered: 3, matured: 1, replies: 0, positiveReplies: 0 },
      },
      groupStatus: {
        independent: { delivered: 55, matured: 32, replies: 6, positiveReplies: 2 },
        'group-member': { delivered: 4, matured: 2, replies: 0, positiveReplies: 0 },
        'vendor-hosted': none,
        unknown: none,
      },
      accessibilityCard: {
        yes: { delivered: 41, matured: 25, replies: 5, positiveReplies: 2 },
        no: { delivered: 15, matured: 8, replies: 1, positiveReplies: 0 },
        unknown: { delivered: 3, matured: 1, replies: 0, positiveReplies: 0 },
      },
    },
  },
  projection: {
    firstSendDay: '2026-09-24',
    recentFirstTouchSends: 28,
    pendingMaturity: [
      { day: '2026-10-12', threads: 5 },
      { day: '2026-10-15', threads: 2 },
      { day: '2026-10-28', threads: 18 },
    ],
    sequenceDays: 29,
  },
  checkpoints: [
    { checkpoint: 100, kind: 'estimated', day: '2026-12-01', firstTouchesPerDay: 2 },
    { checkpoint: 300, kind: 'no-estimate' },
    { checkpoint: 500, kind: 'no-estimate' },
  ],
};
