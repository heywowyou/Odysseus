import type { InputHTMLAttributes, JSX } from 'react';
import { cn } from '../../lib/cn';

const inputStyles: string = cn(
  'h-9 w-full rounded-lg border border-line bg-raised px-3 text-sm text-ink',
  'placeholder:text-ink-muted outline-none transition-colors',
  'focus:border-accent/70 focus:ring-2 focus:ring-accent/25 disabled:opacity-50',
);

export function Input(props: InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  const { className, ...rest } = props;
  return <input className={cn(inputStyles, className)} {...rest} />;
}
