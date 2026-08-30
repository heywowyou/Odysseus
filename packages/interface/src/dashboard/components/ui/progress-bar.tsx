import type { JSX } from 'react';

export function ProgressBar({
  value,
  ariaLabel,
}: {
  value: number;
  ariaLabel: string;
}): JSX.Element {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-label={ariaLabel}
      className="h-1.5 w-full overflow-hidden rounded-full bg-raised"
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-300"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
