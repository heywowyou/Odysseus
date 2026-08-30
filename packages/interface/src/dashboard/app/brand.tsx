import { Link } from 'react-router';

/** The crosshair mark predates the rebuild (it was the old top bar logo);
 *  keeping it is the one deliberate piece of visual continuity across the
 *  cutover. */
export function Brand({ layout }: { layout: 'sidebar' | 'topbar' }) {
  return (
    <Link
      to="/audits"
      className={
        layout === 'sidebar'
          ? 'flex items-center gap-2.5 px-2 text-[15px] font-semibold tracking-tight text-ink'
          : 'flex items-center gap-2 text-sm font-semibold tracking-tight text-ink'
      }
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3v18M3 12h18" />
      </svg>
      Odysseus
    </Link>
  );
}
