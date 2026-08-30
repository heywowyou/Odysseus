import type { JSX } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';

export function Spinner({ className }: { className?: string }): JSX.Element {
  return (
    <Loader2 className={cn('size-4 animate-spin text-ink-muted', className)} aria-hidden="true" />
  );
}
