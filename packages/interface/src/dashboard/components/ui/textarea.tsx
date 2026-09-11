import type { JSX, TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

const textareaStyles: string = cn(
  'min-h-24 w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink',
  'placeholder:text-ink-muted outline-none transition-colors',
  'focus:border-accent/70 focus:ring-2 focus:ring-accent/25 disabled:opacity-50',
);

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>): JSX.Element {
  const { className, ...rest } = props;
  return <textarea className={cn(textareaStyles, className)} {...rest} />;
}
