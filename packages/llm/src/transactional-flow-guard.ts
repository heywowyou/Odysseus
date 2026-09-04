import type { ReportLanguage } from '@odysseus/core';
import type { TransactionalFlowStatus, WritingPassOutput } from './writing-schema.js';

export interface TransactionalFlowViolation {
  field: string;
  matched: string;
}

function writingProseFields(output: WritingPassOutput): { field: string; text: string }[] {
  return [
    { field: 'executiveSummary', text: output.executiveSummary },
    { field: 'notes', text: output.notes },
    ...output.themes.flatMap((theme, i) => [
      { field: `themes[${i}](${theme.themeKey}).title`, text: theme.title },
      { field: `themes[${i}](${theme.themeKey}).businessImpact`, text: theme.businessImpact },
      ...theme.recommendedActions.map((text, j) => ({
        field: `themes[${i}](${theme.themeKey}).recommendedActions[${j}]`,
        text,
      })),
    ]),
  ];
}

const ABSENCE_CLAIMS: Record<ReportLanguage, RegExp> = {
  fr: /aucun parcours de (?:réservation,? panier ou paiement|réservation|paiement)|aucune réservation en ligne/i,
  en: /no (?:booking|payment|transactional) flow (?:was |has been )?found|no online booking/i,
};

const PRESENCE_CLAIMS: Record<ReportLanguage, RegExp> = {
  fr: /canal direct de réservation|parcours de réservation (?:direct|en ligne)|réservation directe en ligne/i,
  en: /direct booking channel|direct online booking|booking flow is available/i,
};

/** Rejects only explicit, client-facing claims. This deliberately does not
 * try to infer every possible booking synonym: a broad lexical heuristic
 * would reject legitimate recommended actions and would make retries noisy. */
export function findTransactionalFlowViolations(
  output: WritingPassOutput,
  language: ReportLanguage,
  status: TransactionalFlowStatus,
): TransactionalFlowViolation[] {
  if (status === 'present') {
    return writingProseFields(output)
      .map(({ field, text }) => ({ field, text, match: text.match(ABSENCE_CLAIMS[language]) }))
      .filter(
        (entry): entry is { field: string; text: string; match: RegExpMatchArray } =>
          entry.match !== null,
      )
      .map(({ field, match }) => ({ field, matched: match[0] }));
  }

  if (status === 'absent') {
    return writingProseFields(output)
      .map(({ field, text }) => ({ field, text, match: text.match(PRESENCE_CLAIMS[language]) }))
      .filter(
        (entry): entry is { field: string; text: string; match: RegExpMatchArray } =>
          entry.match !== null,
      )
      .map(({ field, match }) => ({ field, matched: match[0] }));
  }

  return [];
}
