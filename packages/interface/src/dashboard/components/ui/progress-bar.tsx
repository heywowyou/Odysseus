import type { JSX } from 'react';

/** Bar for a job phase. value null renders the indeterminate state: the
 *  phase has no real target (an uncapped crawl), so a determinate width
 *  would be a lie. The animated segment needs a keyframe from
 *  dashboard/theme.css; role and aria bounds stay on the wrapper so screen
 *  readers still announce a progressbar, only aria-valuenow is dropped
 *  because there is no current value to announce. */
export function ProgressBar({
  value,
  ariaLabel,
}: {
  value: number | null;
  ariaLabel: string;
}): JSX.Element {
  const clamped = value === null ? 0 : Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value === null ? undefined : clamped}
      aria-label={ariaLabel}
      className="h-1.5 w-full overflow-hidden rounded-full bg-raised"
    >
      {value === null ? (
        <div className="h-full w-1/3 rounded-full bg-accent animate-progress-indeterminate" />
      ) : (
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${clamped}%` }}
        />
      )}
    </div>
  );
}
