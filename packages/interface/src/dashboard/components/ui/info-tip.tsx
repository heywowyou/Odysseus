import type { JSX } from 'react';
import { Info } from 'lucide-react';

/** Inline hint next to pipeline vocabulary (the i18n `hints` table). The
 *  tooltip is the native title overlay on purpose: zero dependency, and a
 *  native overlay cannot be clipped by the tables' overflow-hidden
 *  wrappers the way an absolutely positioned popover would be. The span
 *  stays non-interactive; screen readers read the icon's aria-label. */
export function InfoTip({ label, hint }: { label: string; hint: string }): JSX.Element {
  return (
    <span className="inline-flex items-center align-middle" title={hint}>
      <Info className="size-3.5 text-ink-muted" role="img" aria-label={label} />
    </span>
  );
}
