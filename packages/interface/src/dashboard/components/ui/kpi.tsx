import type { JSX } from 'react';
import { cn } from '../../lib/cn';
import { Skeleton } from './skeleton';

/** Render state of a KPI value. Counts never render as a confident zero:
 *  while the first load is in flight the value is a skeleton, and a failed
 *  load shows the explicit unavailable marker instead of a number nobody can
 *  stand behind. A loaded zero stays a legitimate zero. */
export type KpiValueState = 'loaded' | 'loading' | 'unavailable';

export function KpiTile(props: {
  label: string;
  value: string | number;
  state?: KpiValueState;
  /** Marker text for the unavailable state; localized by the caller. */
  unavailableLabel?: string;
  tone?: 'default' | 'critical';
  className?: string;
}): JSX.Element {
  const { label, value, state = 'loaded', unavailableLabel, tone = 'default', className } = props;
  return (
    <div className={cn('rounded-xl border border-line bg-panel px-4 py-3', className)}>
      <p className="text-xs text-ink-muted">{label}</p>
      {state === 'loading' ? (
        <Skeleton className="mt-1 h-6 w-12" />
      ) : state === 'unavailable' ? (
        <p className="text-base font-semibold text-ink-muted">{unavailableLabel}</p>
      ) : (
        <p
          className={cn(
            'text-xl font-semibold tracking-tight',
            tone === 'critical' ? 'text-sev-critical' : 'text-ink',
          )}
        >
          {value}
        </p>
      )}
    </div>
  );
}
