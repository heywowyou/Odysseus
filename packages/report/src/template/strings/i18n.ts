import type { ReportLanguage } from '@odysseus/core';
import { applyEnglishClientFacingCopy } from './en-client-facing.js';
import { en } from './en.js';
import { fr } from './fr.js';
import { applyFrenchClientFacingCopy } from './fr-client-facing.js';
import type { ReportStrings } from './types.js';

export type { ReportStrings } from './types.js';

const CLIENT_FACING_FR = applyFrenchClientFacingCopy(fr);
const CLIENT_FACING_EN = applyEnglishClientFacingCopy(en);

export function getStrings(language: ReportLanguage): ReportStrings {
  return language === 'fr' ? CLIENT_FACING_FR : CLIENT_FACING_EN;
}
