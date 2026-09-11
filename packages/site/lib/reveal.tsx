'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Wraps a group of siblings (a card grid, a single callout) so they settle
 * into place once when scrolled into view, instead of sitting static on the
 * page. Direct children stagger via CSS nth-child rules in globals.css; this
 * component only ever toggles one class on the wrapper. Fires once per
 * mount: revisiting a section on scroll-back does not replay it.
 */
export function Reveal({
  children,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  /** 'ol' preserves native list numbering for the process steps. */
  as?: 'div' | 'ol';
}) {
  const ref = useRef<HTMLDivElement & HTMLOListElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('is-visible');
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag ref={ref} className={`reveal ${className}`.trim()}>
      {children}
    </Tag>
  );
}
