import { useEffect, useState } from 'react';
import { Building2, ClipboardCheck, ListChecks, Mail, Menu, ShieldCheck, X } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { Brand } from './brand';
import { LanguageSwitcher } from './language-switcher';
import { useI18n } from '../i18n/provider';
import { cn } from '../lib/cn';

export function AppShell() {
  const { strings } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  /* Grouped by the two halves of the work rather than listed flat: measuring a
     site and running a campaign are different jobs with different rhythms.
     Plan 040 slice 3 (approved IA, docs/product/dashboard-ia.md): "Nouveau
     scan" moves to a header button on the Audits page it sat next to
     (removed here, not duplicated); "A traiter" and "Resultats" are new
     Campagne entries at their current URLs (/outreach, /outreach/outcomes)
     until slice 6 rebuilds them at /a-traiter and /resultats. */
  const navGroups = [
    {
      label: strings.shell.groupMeasure,
      items: [{ to: '/audits', label: strings.nav.audits, icon: ListChecks, end: false }],
    },
    {
      label: strings.shell.groupCampaign,
      items: [
        // end: true so this item's own NavLink match does not also light up
        // for the /outreach/outcomes item nested under the same prefix.
        { to: '/outreach', label: strings.nav.outreach, icon: Mail, end: true },
        { to: '/prospects', label: strings.nav.prospects, icon: Building2, end: false },
        { to: '/outreach/outcomes', label: strings.nav.results, icon: ClipboardCheck, end: false },
      ],
    },
  ];

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  const nav = (
    <nav className="flex flex-col gap-6 px-3" aria-label={strings.shell.navigation}>
      {navGroups.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
            {group.label}
          </p>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-accent-tint text-ink'
                      : 'text-ink-soft hover:bg-raised hover:text-ink',
                  )
                }
              >
                <item.icon className="size-4 shrink-0" aria-hidden="true" />
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  const footer = (
    <div className="mt-auto border-t border-line p-4">
      <NavLink
        to="/outreach/do-not-contact"
        className="mb-3 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-raised hover:text-ink"
      >
        <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
        {strings.shell.checkAddress}
      </NavLink>
      <LanguageSwitcher />
    </div>
  );

  return (
    <div className="min-h-dvh bg-base text-ink">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-panel md:flex">
        <div className="px-5 pb-6 pt-5">
          <Brand layout="sidebar" />
          <p className="mt-1 px-2 text-xs text-ink-muted">{strings.shell.tagline}</p>
        </div>
        {nav}
        {footer}
      </aside>

      <header className="fixed inset-x-0 top-0 z-30 flex h-12 items-center justify-between border-b border-line bg-panel px-4 md:hidden">
        <Brand layout="topbar" />
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label={strings.shell.openMenu}
          aria-expanded={menuOpen}
          className="rounded-lg p-2 text-ink-soft hover:bg-raised hover:text-ink"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
      </header>

      {menuOpen ? (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 animate-overlay-in bg-black/60"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 animate-drawer-in flex-col border-r border-line bg-panel">
            <div className="flex items-center justify-between px-4 py-3">
              <Brand layout="topbar" />
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label={strings.shell.closeMenu}
                className="rounded-lg p-2 text-ink-soft hover:bg-raised hover:text-ink"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      ) : null}

      <div className="md:pl-60">
        {/* Keyed by pathname so each navigation remounts the page container
            and replays the entrance animation. */}
        <main key={pathname} className="animate-page-in px-4 pb-16 pt-16 md:px-8 md:pt-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
