'use client';

import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';

const ReplayContext = createContext<(() => void) | null>(null);

/**
 * One check of the diagnostic, shown as a card with its schematic. Two
 * separate moments, keyed off classes on the card so the CSS owns all timing:
 * `is-visible` settles the card once when it scrolls in, and `is-running`
 * plays the schematic's measurement once its figure is actually on screen
 * (on a phone the figure sits well below the card's top edge).
 *
 * The hidden start state only exists under `is-armed`, which this component
 * adds on mount, so server HTML and a failed script both show every
 * schematic in its finished state. A card already in view on mount skips
 * the hide entirely rather than blinking out and back.
 *
 * Each measurement plays once and lasts under five seconds, so no pause
 * control is owed (WCAG 2.2.2); the replay button is the way to see it again.
 */
export function Exhibit({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const figure = el.querySelector('.exhibit-figure') ?? el;

    const inView = (node: Element): boolean => {
      const rect = node.getBoundingClientRect();
      return rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0;
    };

    if (inView(el)) el.classList.add('is-visible');
    if (inView(figure)) el.classList.add('is-running');
    el.classList.add('is-armed');

    const settle = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          el.classList.add('is-visible');
          settle.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    const run = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          el.classList.add('is-running');
          run.disconnect();
        }
      },
      { threshold: 0.55 },
    );

    if (!el.classList.contains('is-visible')) settle.observe(el);
    if (!el.classList.contains('is-running')) run.observe(figure);
    return () => {
      settle.disconnect();
      run.disconnect();
    };
  }, []);

  const replay = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove('is-running');
    // Reading layout between the two class changes is what restarts the
    // keyframes; without it the browser coalesces remove and add into nothing.
    el.getBoundingClientRect();
    el.classList.add('is-running');
  }, []);

  return (
    <ReplayContext.Provider value={replay}>
      <div ref={ref} className="exhibit">
        {children}
      </div>
    </ReplayContext.Provider>
  );
}

export function ReplayButton({ label }: { label: string }) {
  const replay = useContext(ReplayContext);
  return (
    <button type="button" className="replay" onClick={() => replay?.()}>
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2.75 8a5.25 5.25 0 1 0 1.6-3.78" />
        <path d="M2.5 2.5v2.75h2.75" />
      </svg>
      <span>{label}</span>
    </button>
  );
}
