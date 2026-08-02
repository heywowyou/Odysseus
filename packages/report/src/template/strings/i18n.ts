import type { ReportLanguage } from '@odysseus/core';
import { fr } from './fr.js';
import { en } from './en.js';
import type { ReportStrings } from './types.js';

export type { ReportStrings } from './types.js';

export function getStrings(language: ReportLanguage): ReportStrings {
  return language === 'fr' ? fr : en;
}
