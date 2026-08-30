import type { JSX, SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';

export const selectStyles: string = cn(
  'h-9 w-full appearance-none rounded-lg border border-line bg-raised pl-3 pr-9 text-sm text-ink',
  'placeholder:text-ink-muted outline-none transition-colors',
  'focus:border-accent/70 focus:ring-2 focus:ring-accent/25 disabled:opacity-50',
);

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>): JSX.Element {
  const { className, ...rest } = props;
  return (
    <span className="relative inline-flex w-full">
      <select className={cn(selectStyles, className)} {...rest} />
      <ChevronDown
        className={cn(
          'pointer-events-none absolute right-3 top-1/2 size-4',
          '-translate-y-1/2 text-ink-muted',
        )}
        aria-hidden="true"
      />
    </span>
  );
}
