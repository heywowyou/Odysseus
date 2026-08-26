import { DEFAULT_DASHBOARD_LANGUAGE, getStrings, type DashboardStrings } from './strings/i18n.js';

function getByPath(source: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined,
      source,
    );
}

/** Applies the dashboard chrome strings to every element in the current
 *  document carrying a data-i18n / data-i18n-placeholder attribute, and
 *  returns the resolved strings object for the page's own script to use
 *  when rendering dynamic content (table rows, badges, status text).
 *  One source of truth (strings/fr.ts, strings/en.ts) for every piece of
 *  UI text, static or dynamic, rather than static markup hardcoding one
 *  language while only dynamic content goes through the strings module. */
export function applyStrings(): DashboardStrings {
  const strings = getStrings();

  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const path = el.dataset['i18n'];
    if (!path) continue;
    const value = getByPath(strings, path);
    if (typeof value === 'string') el.textContent = value;
  }

  for (const el of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    '[data-i18n-placeholder]',
  )) {
    const path = el.dataset['i18nPlaceholder'];
    if (!path) continue;
    const value = getByPath(strings, path);
    if (typeof value === 'string') el.placeholder = value;
  }

  document.documentElement.lang = DEFAULT_DASHBOARD_LANGUAGE;

  return strings;
}
