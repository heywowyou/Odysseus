import type { JSX, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type BadgeTone = 'neutral' | 'accent' | 'critical' | 'serious' | 'moderate' | 'minor';

const TONE_STYLES: Record<BadgeTone, string> = {
  neutral: 'bg-ink-muted/15 text-ink-soft',
  accent: 'bg-accent-tint text-accent-bright',
  critical: 'bg-sev-critical/15 text-sev-critical',
  serious: 'bg-sev-serious/15 text-sev-serious',
  moderate: 'bg-sev-moderate/15 text-sev-moderate',
  minor: 'bg-sev-minor/15 text-sev-minor',
};

export function badgeStyles(tone?: BadgeTone): string {
  return cn(
    'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
    TONE_STYLES[tone ?? 'neutral'],
  );
}

export function Badge(props: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}): JSX.Element {
  const { tone, className, children } = props;
  return <span className={cn(badgeStyles(tone), className)}>{children}</span>;
}
