import { Link } from 'react-router';

/** Wordmark only, set like the public site's `.wordmark`
 *  (packages/site/app/globals.css), which is the reference identity: bold
 *  capitals at 0.2em tracking, 1.8rem, and the site's 1.5rem narrow-screen
 *  step for the mobile top bar and drawer, which are too narrow for 1.8rem
 *  beside their menu button. The sidebar is w-64 so 1.8rem fits. */
export function Brand({ layout }: { layout: 'sidebar' | 'topbar' }) {
  return (
    <Link
      to="/audits"
      className={
        layout === 'sidebar'
          ? 'px-2 text-[1.8rem] font-bold uppercase tracking-[0.2em] text-ink'
          : 'text-[1.5rem] font-bold uppercase tracking-[0.2em] text-ink'
      }
    >
      Odysseus
    </Link>
  );
}
