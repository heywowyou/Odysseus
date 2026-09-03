import { Link } from 'react-router';

/** Wordmark only, per the operator's monochrome direction: no logo mark. The
 *  one identity move available inside that constraint is the setting: wide
 *  letterspaced capitals read as an instrument's nameplate rather than as a
 *  product logo, which is what this tool actually is. */
export function Brand({ layout }: { layout: 'sidebar' | 'topbar' }) {
  return (
    <Link
      to="/audits"
      className={
        layout === 'sidebar'
          ? 'px-2 text-[13px] font-semibold uppercase tracking-[0.22em] text-ink'
          : 'text-[13px] font-semibold uppercase tracking-[0.22em] text-ink'
      }
    >
      Odysseus
    </Link>
  );
}
