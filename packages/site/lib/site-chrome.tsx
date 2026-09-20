'use client';

import type { ReactNode } from 'react';
import { LanguageProvider, LanguageToggle, useLanguage } from './language';

const LABELS = {
  fr: {
    skip: 'Aller au contenu',
    mainNav: 'Navigation principale',
    offer: 'Le diagnostic',
    bot: 'OdysseusBot',
    infoNav: 'Informations',
    info: 'Informations',
    privacy: 'Prospection et données personnelles',
    optOut: 'Ne plus être contacté',
    accessibility: "Démarche d'accessibilité",
    tagline:
      'Diagnostic technique de sites web avec préconisations\u00a0: accessibilité, référencement naturel, rendu JavaScript, performance et signaux techniques liés aux assistants IA.',
  },
  en: {
    skip: 'Skip to content',
    mainNav: 'Main navigation',
    offer: 'The diagnostic',
    bot: 'OdysseusBot',
    infoNav: 'Information',
    info: 'Information',
    privacy: 'Outreach and personal data',
    optOut: 'Opt out',
    accessibility: 'Accessibility approach',
    tagline:
      'Technical website diagnostic with recommendations: accessibility, search, JavaScript rendering, performance and technical signals for AI assistants.',
  },
} as const;

function SiteHeader() {
  const { language } = useLanguage();
  const t = LABELS[language];
  return (
    <header className="site-header">
      <div className="shell header-bar py-3">
        <a className="wordmark" href="/">
          Odysseus
        </a>
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
          <a className="small mt-3 inline-block underline" href="mailto:contact@odysseusaudit.fr">
            contact@odysseusaudit.fr
          </a>
        </div>
        <nav aria-label={t.infoNav} className="flex flex-col items-start gap-1 md:items-end">
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
          <a className="navlink" href="/accessibilite">
            {t.accessibility}
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
