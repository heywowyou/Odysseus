import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { en } from './en';
import { fr } from './fr';
import type { DashboardLanguage, DashboardStrings } from './types';

export type { DashboardLanguage, DashboardStrings } from './types';

const STORAGE_KEY = 'odysseus.dashboard.language';

export const DEFAULT_DASHBOARD_LANGUAGE: DashboardLanguage = 'fr';

const STRINGS: Record<DashboardLanguage, DashboardStrings> = { fr, en };

interface LanguageStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Pure so the fallback chain is unit-testable without a browser: an absent
 *  or unreadable storage, or any value that is not a known language, falls
 *  back to French, the operator's market language. */
export function resolveStoredLanguage(storage: LanguageStorage | null): DashboardLanguage {
  let stored: string | null = null;
  try {
    stored = storage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    // getItem throwing (unprivileged storage) behaves like an absent value;
    // the initializer above already covers it.
  }
  return stored === 'fr' || stored === 'en' ? stored : DEFAULT_DASHBOARD_LANGUAGE;
}

interface I18nContextValue {
  language: DashboardLanguage;
  strings: DashboardStrings;
  setLanguage: (language: DashboardLanguage) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<DashboardLanguage>(() =>
    resolveStoredLanguage(window.localStorage),
  );

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: DashboardLanguage) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private-mode storage throws on write; the in-memory language still
      // applies for this session, which is the best available behavior.
    }
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({ language, strings: STRINGS[language], setLanguage }),
    [language, setLanguage],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error('useI18n must be used inside I18nProvider');
  }
  return value;
}
