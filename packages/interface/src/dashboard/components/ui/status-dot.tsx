import type { JSX } from 'react';
import { cn } from '../../lib/cn';

export type StatusDotStatus = 'queued' | 'running' | 'complete' | 'failed';

const STATUS_STYLES: Record<StatusDotStatus, string> = {
  queued: 'bg-ink-muted',
  running: 'animate-pulse bg-accent',
  complete: 'bg-sev-minor',
  failed: 'bg-sev-critical',
};

export function StatusDot({ status }: { status: StatusDotStatus }): JSX.Element {
  return (
    <span
      className={cn('size-2 shrink-0 rounded-full', STATUS_STYLES[status])}
      aria-hidden="true"
    />
  );
}
