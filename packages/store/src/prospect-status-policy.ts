import type { ProspectStatus } from '@odysseus/core';

/** The only statuses that form an automatic forward-progress path. Terminal
 * outcomes are deliberately not included in this rank: won, lost, and
 * opted-out are sibling branches, not later steps in one ordered list. */
const AUTOMATIC_PROGRESS_RANK: Readonly<
  Record<
    Extract<
      ProspectStatus,
      'new' | 'audited' | 'contacted' | 'follow-up' | 'replied' | 'call' | 'quoted'
    >,
    number
  >
> = {
  new: 0,
  audited: 1,
  contacted: 2,
  'follow-up': 3,
  replied: 4,
  call: 5,
  quoted: 6,
};

const TERMINAL_PROSPECT_STATUSES: readonly Extract<ProspectStatus, 'won' | 'lost' | 'opted-out'>[] =
  ['won', 'lost', 'opted-out'];

export interface AutomaticStatusDecision {
  allowed: boolean;
  changed: boolean;
}

/** Decides a status mutation initiated by an automated scan/outcome path.
 * Manual correction intentionally does not use this function. */
export function decideAutomaticStatus(
  current: ProspectStatus,
  next: ProspectStatus,
): AutomaticStatusDecision {
  if (current === next) return { allowed: true, changed: false };

  const currentRank = AUTOMATIC_PROGRESS_RANK[current as keyof typeof AUTOMATIC_PROGRESS_RANK];
  const nextRank = AUTOMATIC_PROGRESS_RANK[next as keyof typeof AUTOMATIC_PROGRESS_RANK];

  // Once any terminal branch has been selected, ordinary workflow actions
  // cannot reinterpret it. Manual Correct status is the explicit escape hatch.
  if (TERMINAL_PROSPECT_STATUSES.includes(current as never)) {
    return { allowed: false, changed: false };
  }

  if (next === 'opted-out' || next === 'won' || next === 'lost') {
    return { allowed: true, changed: true };
  }

  // `new` is the rank-zero starting point, and every other automatic target
  // must move strictly forward along the non-terminal path.
  return {
    allowed: nextRank !== undefined && currentRank !== undefined && nextRank > currentRank,
    changed: nextRank !== undefined && currentRank !== undefined && nextRank > currentRank,
  };
}
