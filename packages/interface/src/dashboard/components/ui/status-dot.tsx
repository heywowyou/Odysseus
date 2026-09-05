import type { JSX } from 'react';
import { cn } from '../../lib/cn';

export type StatusDotStatus =
  'queued' | 'running' | 'complete' | 'failed' | 'cancelled' | 'needs-input';

const STATUS_STYLES: Record<StatusDotStatus, string> = {
  queued: 'bg-ink-muted',
  running: 'animate-pulse bg-accent',
  complete: 'bg-sev-minor',
  failed: 'bg-sev-critical',
  // Stopped by the operator: same neutral family as queued, no pulse, it
  // will not change again on its own.
  cancelled: 'bg-ink-muted',
  // Issue #73: the pipeline finished and is waiting on the operator, not
  // broken - amber, distinct from both failed (red) and complete (green),
  // no pulse since it will not advance without an operator action.
  'needs-input': 'bg-sev-moderate',
};

export function StatusDot({ status }: { status: StatusDotStatus }): JSX.Element {
  return (
    <span
      className={cn('size-2 shrink-0 rounded-full', STATUS_STYLES[status])}
      aria-hidden="true"
    />
  );
}
