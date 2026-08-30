import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Conditional class names with Tailwind conflict resolution, the shadcn/ui
 *  convention. The dashboard's custom color names (bg-panel, text-ink, ...)
 *  are merged conservatively by tailwind-merge, which is correct because the
 *  conflicts we actually hit are within the same utility group. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
