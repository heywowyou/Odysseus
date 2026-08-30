import type { JSX } from 'react';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { cn } from '../../lib/cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export function SegmentedControl<T extends string>(props: {
  value: T;
  onValueChange: (value: T) => void;
  options: SegmentedOption<T>[];
  ariaLabel: string;
}): JSX.Element {
  const { value, onValueChange, options, ariaLabel } = props;
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1 rounded-lg bg-raised p-1"
      onValueChange={(next: string) => {
        if (next) onValueChange(next as T);
      }}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          className={cn(
            'rounded-md px-3 py-1 text-[13px] font-medium transition-colors',
            'text-ink-muted hover:text-ink-soft',
            'data-[state=on]:bg-accent-tint data-[state=on]:text-ink',
            'data-[state=on]:hover:text-ink',
          )}
        >
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
