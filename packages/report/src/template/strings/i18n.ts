import type { ReportLanguage } from '@odysseus/core';
import { applyEnglishClientFacingCopy } from './en-client-facing.js';
import { en } from './en.js';
import { fr } from './fr.js';
import { applyFrenchClientFacingCopy } from './fr-client-facing.js';
import { normalizeFrenchTypographyDeep } from '../french-typography.js';
import type { ReportStrings } from './types.js';

export type { ReportStrings } from './types.js';

/** Issue #323: one French typography convention for the whole document,
 *  applied where the copy is loaded rather than at each of the hundred
 *  places that render a piece of it. */
const CLIENT_FACING_FR = normalizeFrenchTypographyDeep(applyFrenchClientFacingCopy(fr));
const CLIENT_FACING_EN = applyEnglishClientFacingCopy(en);

export function getStrings(language: ReportLanguage): ReportStrings {
  return language === 'fr' ? CLIENT_FACING_FR : CLIENT_FACING_EN;
}
