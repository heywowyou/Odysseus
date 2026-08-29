import type { ObligationAssessment } from '@odysseus/core';
import type { ReportStrings } from './strings/i18n.js';
import { isArticle47Regime } from './sections/accessibility-statement.js';

export interface AccessibilityStatementGuidance {
  observation: string;
  recommendation: string;
}

/** One deterministic decision shared by Observations and Remaining work. */
export function accessibilityStatementGuidance(
  strings: ReportStrings,
  assessment: ObligationAssessment | undefined,
): AccessibilityStatementGuidance {
  const guidance = strings.accessibilityStatementGuidance;
  return {
    observation: guidance.notFoundObservation,
    recommendation: isArticle47Regime(assessment)
      ? guidance.article47Recommendation
      : guidance.optionalRecommendation,
  };
}
