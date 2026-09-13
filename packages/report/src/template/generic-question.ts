import {
  resolveGenericDecisionQuestion,
  type PreparationPreviewLanguage,
  type ReportLanguage,
} from '@odysseus/core';

export { resolveGenericDecisionQuestion };

/**
 * The cover and opening share the same decision-question resolver. Core owns
 * the language fallback so preparation previews and report rendering cannot
 * drift; a preparation preview may replace it with its already-resolved custom
 * or situational question.
 */
export function resolveDecisionQuestion(
  language: ReportLanguage,
  preparation?: PreparationPreviewLanguage,
): string {
  return preparation?.coverQuestion.value ?? resolveGenericDecisionQuestion(language);
}
