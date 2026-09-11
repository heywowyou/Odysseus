'use client';

import type { ReactNode } from 'react';
import { LanguageProvider, LanguageToggle, useLanguage } from './language';

/**
 * The header, footer and skip link need `useLanguage()`, which forces them
 * into a client component; `app/layout.tsx` must stay a server component
 * because it exports `metadata`, which Next refuses inside a client file.
 * This module is the split: `layout.tsx` renders `<SiteChrome>{children}</SiteChrome>`,
 * and `children` (each route's own server-rendered page) passes through
 * untouched, per the standard composition of a client component wrapping
 * server-rendered children.
 */

const LABELS = {
  fr: {
    skip: 'Aller au contenu',
    mainNav: 'Navigation principale',
    offer: "L'offre",
    bot: 'OdysseusBot',
    legalNav: 'Pages légales',
    info: 'Informations',
    privacy: 'Prospection et données personnelles',
    optOut: 'Désinscription',
    tagline:
      'Diagnostic technique de sites web\u00a0: accessibilité, référencement naturel, signaux de visibilité IA et performance.',
  },
  en: {
    skip: 'Skip to content',
    mainNav: 'Main navigation',
    offer: 'Offer',
    bot: 'OdysseusBot',
    legalNav: 'Legal pages',
    info: 'Information',
    privacy: 'Prospecting and personal data',
    optOut: 'Unsubscribe',
    tagline:
      'Technical website diagnostic: accessibility, search optimisation, AI visibility signals and performance.',
  },
} as const;

/**
 * The wordmark is the whole identity: uppercase, widely letterspaced, no
 * mark. It is set the same way in the operator dashboard, where the
 * reasoning is recorded: wide capitals read as an instrument's nameplate
 * rather than as a product logo, which is what this tool actually is.
 */
function SiteHeader() {
  const { language } = useLanguage();
  const t = LABELS[language];
  return (
    <header className="site-header">
      <div className="shell header-bar py-3">
        <a className="wordmark" href="/">
          Odysseus
        </a>
        {/* No separate "Accueil"/"Home" link: the wordmark already goes
            home, and repeating the destination in the nav read as a
            duplicate link to the same place (critique, minor observations). */}
        <nav aria-label={t.mainNav} className="header-nav">
          <a className="navlink" href="/offre">
            {t.offer}
          </a>
          <a className="navlink" href="/bot">
            {t.bot}
          </a>
        </nav>
        <LanguageToggle />
      </div>
    </header>
  );
}

function SiteFooter() {
  const { language } = useLanguage();
  const t = LABELS[language];
  return (
    <footer className="site-footer">
      <div className="shell grid gap-8 py-10 md:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <p className="wordmark">Odysseus</p>
          <p className="small muted mt-2 max-w-sm">{t.tagline}</p>
          <a className="small mt-3 inline-block underline" href="mailto:contact@odysseusaudit.com">
            contact@odysseusaudit.com
          </a>
        </div>
        <nav aria-label={t.legalNav} className="flex flex-col items-start gap-1 md:items-end">
          <p className="label mb-1">{t.info}</p>
          <a className="navlink" href="/bot">
            {t.bot}
          </a>
          <a className="navlink" href="/confidentialite-prospection">
            {t.privacy}
          </a>
          <a className="navlink" href="/desinscription">
            {t.optOut}
          </a>
        </nav>
      </div>
    </footer>
  );
}

function SkipLink() {
  const { language } = useLanguage();
  return (
    <a className="skip-link" href="#contenu">
      {LABELS[language].skip}
    </a>
  );
}

export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <SkipLink />
      <SiteHeader />
      {children}
      <SiteFooter />
    </LanguageProvider>
  );
}
