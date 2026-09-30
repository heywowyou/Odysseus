/**
 * The language every audit browser presents to the site: French, the market
 * these audits are sold in. Plan 075 H6.
 *
 * Sites that redirect by browser language (WPML's browser-language redirect
 * is the measured case) send a visitor to the translation matching
 * `navigator.language`. With Chromium's default English locale, every French
 * and Italian page of Grand Hôtel des Alpes was redirected to its English
 * translation, and a French hotel was audited in English only. A French
 * visitor stays on the French page, and so does the audit now. On such a
 * site the English pages become redirects to their French translations,
 * which are audited in their place.
 */
export const AUDIT_BROWSER_LOCALE = 'fr-FR';

/** The Accept-Language header Chromium sends for AUDIT_BROWSER_LOCALE, stated
 *  once for the Lighthouse runs that do not go through a Playwright context. */
export const AUDIT_ACCEPT_LANGUAGE = 'fr-FR,fr;q=0.9';

/** The process environment that sets Chromium's own language. On Linux,
 *  Chromium ignores `--lang` and reads its locale from LANGUAGE/LANG, so a
 *  tab opened outside a Playwright context (Lighthouse's) reported
 *  `navigator.language` en-US, and a site that redirects by browser language
 *  sent the homepage's speed run to its English translation. */
export const AUDIT_BROWSER_LANGUAGE_ENV: Readonly<Record<string, string>> = {
  LANGUAGE: `${AUDIT_BROWSER_LOCALE.replace('-', '_')}:${AUDIT_BROWSER_LOCALE.split('-')[0]}`,
};
