import { fr } from './fr.js';
import { en } from './en.js';
import type { DashboardStrings } from './types.js';

export type { DashboardStrings } from './types.js';

/** No language-switcher UI in milestone 7 (out of the written 7.1 scope)
 *  - one constant, French default since the operator is a French-market
 *  business - but strings are already structured per-language so adding
 *  a switch later is not a retrofit. */
export type DashboardLanguage = 'fr' | 'en';
export const DEFAULT_DASHBOARD_LANGUAGE: DashboardLanguage = 'fr';

export function getStrings(
  language: DashboardLanguage = DEFAULT_DASHBOARD_LANGUAGE,
): DashboardStrings {
  return language === 'fr' ? fr : en;
}
