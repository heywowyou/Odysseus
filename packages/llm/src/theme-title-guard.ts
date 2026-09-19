import type { ReportLanguage } from '@odysseus/core';
import type { WritingPassOutput } from './writing-schema.js';

export interface ThemeTitleViolation {
  field: string;
  text: string;
  reason: 'too-long' | 'terminal-punctuation' | 'sentence-style';
}

const ACTION_OPENERS: Record<ReportLanguage, RegExp> = {
  fr: /^(?:corriger|am[eé]liorer|rendre|r[eé]duire|optimiser|s[eé]curiser|v[eé]rifier|ajouter|supprimer|remplacer|configurer|[ée]viter|mettre|permettre|garantir|renforcer|faciliter|prot[eé]ger)\b/iu,
  en: /^(?:fix|improve|make|reduce|optimi[sz]e|secure|check|add|remove|replace|configure|avoid|ensure|strengthen|facilitate|protect)\b/iu,
};

const FINITE_VERBS: Record<ReportLanguage, RegExp> = {
  fr: /\b(?:doit|doivent|devrait|devraient|il\s+faut|permet|permettent|am[eé]liore|am[eé]liorent|r[eé]duit|r[eé]duisent|garantit|garantissent|facilite|facilitent)\b/iu,
  en: /\b(?:must|should|needs?|improves?|reduces?|ensures?|allows?|prevents?)\b/iu,
};

/**
 * Plan 067 theme titles are labels, not mini recommendations. The guard is
 * deliberately mechanical: at most 80 characters and 10 whitespace-delimited
 * words, no terminal punctuation, and no common sentence/action construction.
 */
export function findThemeTitleViolations(
  output: WritingPassOutput,
  language: ReportLanguage,
): ThemeTitleViolation[] {
  const violations: ThemeTitleViolation[] = [];
  for (const [index, theme] of output.themes.entries()) {
    const field = `themes[${index}](${theme.themeKey}).title`;
    const title = theme.title.trim();
    const words = title.split(/\s+/).filter(Boolean);
    if (title.length > 80 || words.length > 10) {
      violations.push({ field, text: theme.title, reason: 'too-long' });
      continue;
    }
    if (/[.!?;:]$/u.test(title)) {
      violations.push({ field, text: theme.title, reason: 'terminal-punctuation' });
      continue;
    }
    if (ACTION_OPENERS[language].test(title) || FINITE_VERBS[language].test(title)) {
      violations.push({ field, text: theme.title, reason: 'sentence-style' });
    }
  }
  return violations;
}
