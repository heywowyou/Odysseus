import type { JSX } from 'react';
import { cn } from '../../lib/cn';

export function Skeleton({ className }: { className?: string }): JSX.Element {
  return <div className={cn('skeleton-shimmer animate-shimmer rounded-md bg-raised', className)} />;
}
