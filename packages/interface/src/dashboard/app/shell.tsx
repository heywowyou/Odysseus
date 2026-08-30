import { useEffect, useState } from 'react';
import { Building2, ListChecks, Mail, Menu, Radar, X } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { Brand } from './brand';
import { LanguageSwitcher } from './language-switcher';
import { useI18n } from '../i18n/provider';
import { cn } from '../lib/cn';

export function AppShell() {
  const { strings } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  const navItems = [
    { to: '/audits', label: strings.nav.audits, icon: ListChecks },
    { to: '/scans/new', label: strings.nav.newScan, icon: Radar },
    { to: '/prospects', label: strings.nav.prospects, icon: Building2 },
    { to: '/outreach', label: strings.nav.outreach, icon: Mail },
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
    <nav className="flex flex-col gap-1 px-3" aria-label={strings.shell.navigation}>
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive ? 'bg-accent-tint text-ink' : 'text-ink-soft hover:bg-raised hover:text-ink',
            )
          }
        >
          <item.icon className="size-4 shrink-0" aria-hidden="true" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh bg-base text-ink">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-panel md:flex">
        <div className="px-5 pb-6 pt-5">
          <Brand layout="sidebar" />
          <p className="mt-1 px-2 text-xs text-ink-muted">{strings.shell.tagline}</p>
        </div>
        {nav}
        <div className="mt-auto border-t border-line p-4">
          <LanguageSwitcher />
        </div>
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
            <div className="mt-auto border-t border-line p-4">
              <LanguageSwitcher />
            </div>
          </aside>
        </div>
      ) : null}

      <div className="md:pl-60">
        {/* Keyed by pathname so each navigation remounts the page container
            and replays the entrance animation. */}
        <main
          key={pathname}
          className="mx-auto w-full max-w-5xl animate-page-in px-4 pb-16 pt-16 md:px-8 md:pt-10"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
