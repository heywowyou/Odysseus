import { useEffect, useRef, useState } from 'react';
import { ListChecks, Mail, Menu, ShieldCheck, Wrench, X } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { Brand } from './brand';
import { BuildRevision } from './build-revision';
import { DashboardErrorBoundary } from './error-boundary';
import { LanguageSwitcher } from './language-switcher';
import { Badge } from '../components/ui/badge';
import { useI18n } from '../i18n/provider';
import { cn } from '../lib/cn';
import { useApi } from '../lib/use-api';
import type { TodoPage } from '../lib/api-types';

export function AppShell() {
  const { strings } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  // Plan 047 addendum: the shell badge and the To-do page consume the same
  // endpoint. Plan 060 §8: the count is server-provided, not the length of a
  // client-side array. No polling: the count refreshes when the shell
  // remounts. Hidden on error or zero, so the badge never invents work.
  const todo = useApi<TodoPage>('/api/prospect-hub/todo');
  const inboxCount = todo.data?.attentionCount ?? 0;
  const refreshTodo = todo.refresh;
  const previousPathname = useRef(pathname);

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    refreshTodo();
  }, [pathname, refreshTodo]);

  /* The shell exposes only the three operational destinations. Directory and
     results are modes inside Prospects, while old URLs remain handled by the
     route table for bookmark safety. */
  const navGroups = [
    {
      label: strings.shell.groupMeasure,
      items: [{ to: '/audits', label: strings.nav.audits, icon: ListChecks, end: false }],
    },
    {
      label: strings.shell.groupCampaign,
      items: [
        // end: true so this item's own NavLink match does not also light up
        // for other Campagne items nested under a shared prefix.
        {
          to: '/a-traiter',
          label: strings.nav.outreach,
          icon: Mail,
          end: false,
          badge: inboxCount > 0 ? inboxCount : undefined,
        },
        { to: '/prospects', label: strings.nav.prospects, icon: Mail, end: false },
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
                {/* flex-1 pushes the count badge to the row's right edge. */}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {/* The count is the link's own text content, so a screen
                    reader reads it as part of the item name: "A traiter, 4". */}
                {'badge' in item && item.badge !== undefined ? (
                  <Badge tone="accent" className="numeric shrink-0">
                    {item.badge}
                  </Badge>
                ) : null}
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
        to="/ne-pas-contacter"
        className="mb-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-raised hover:text-ink"
      >
        <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
        {strings.shell.checkAddress}
      </NavLink>
      <NavLink
        to="/outils"
        className="mb-3 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-raised hover:text-ink"
      >
        <Wrench className="size-4 shrink-0" aria-hidden="true" />
        {strings.tools.navLabel}
      </NavLink>
      <LanguageSwitcher />
      <BuildRevision />
    </div>
  );

  return (
    <div className="min-h-dvh bg-base text-ink">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-panel md:flex">
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

      <div className="md:pl-64">
        {/* Keyed by pathname so each navigation remounts the page container
            and replays the entrance animation. */}
        <main key={pathname} className="animate-page-in px-4 pb-16 pt-16 md:px-8 md:pt-10">
          <DashboardErrorBoundary>
            <Outlet />
          </DashboardErrorBoundary>
        </main>
      </div>
    </div>
  );
}
