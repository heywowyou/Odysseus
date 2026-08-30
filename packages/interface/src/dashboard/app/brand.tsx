import { Link } from 'react-router';

/** Wordmark only, per the operator's monochrome direction: no logo mark. */
export function Brand({ layout }: { layout: 'sidebar' | 'topbar' }) {
  return (
    <Link
      to="/audits"
      className={
        layout === 'sidebar'
          ? 'px-2 text-[15px] font-semibold tracking-tight text-ink'
          : 'text-sm font-semibold tracking-tight text-ink'
      }
    >
      Odysseus
    </Link>
  );
}
