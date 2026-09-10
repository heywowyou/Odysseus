'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export type SiteLanguage = 'fr' | 'en';

const STORAGE_KEY = 'odysseus-site-language';

interface LanguageContextValue {
  language: SiteLanguage;
  setLanguage: (language: SiteLanguage) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

/**
 * Site-wide language toggle, added 2026-09-10 to replace jump links to
 * content that was already visible on the page.
 *
 * French is the source language and the default. The choice is remembered
 * per browser (`localStorage`) but never sent anywhere, and the URL never
 * changes: every route carries both languages rather than being split into
 * `/fr` and `/en` trees, so a shared link always opens to the same page.
 *
 * Both languages are always present in the server-rendered HTML; only the
 * inactive one is hidden, with the native `hidden` attribute rather than a
 * CSS class, so a visitor with JavaScript disabled still gets the full
 * French page and nothing is lost from search indexing.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<SiteLanguage>('fr');

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Private browsing or storage disabled: fall through to the default.
    }
    if (stored === 'fr' || stored === 'en') setLanguageState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: SiteLanguage) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The toggle still works for the current page; it just does not
      // persist across visits.
    }
  }, []);

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within a LanguageProvider');
  return context;
}

/**
 * Shows its children only when `lang` matches the active language. The
 * inactive language stays in the DOM rather than unmounting, so nothing is
 * lost for search engines or no-JS visitors; `hidden` is what actually
 * removes it from layout and from the accessibility tree.
 */
export function LanguageSection({ lang, children }: { lang: SiteLanguage; children: ReactNode }) {
  const { language } = useLanguage();
  return (
    <div hidden={language !== lang} lang={lang}>
      {children}
    </div>
  );
}

const TOGGLE_LABELS: Record<SiteLanguage, string> = { fr: 'Français', en: 'English' };

/** The FR/EN switch itself. Lives once in the shared header. */
export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();
  return (
    <div className="lang-toggle" role="group" aria-label="Langue du site / Site language">
      {(['fr', 'en'] as const).map((code) => (
        <button
          key={code}
          type="button"
          className="lang-toggle-btn"
          aria-pressed={language === code}
          onClick={() => setLanguage(code)}
        >
          {TOGGLE_LABELS[code]}
        </button>
      ))}
    </div>
  );
}
