import type { ReportLanguage } from '@odysseus/core';

/**
 * The canonical generic decision question, plan 018 step 4. French bytes are
 * the mockup's own script data (docs/report/design/
 * report-mockup-standalone.flat.html, meta.question) kept byte-identical:
 * U+2019 in "l’état", plain spaces, plain "?" - the report must not
 * paraphrase the one sentence both the cover and the opening display, since
 * plan 018 step 5 asserts the two render sites agree exactly.
 *
 * This module is the ONLY place these strings exist in the package. The
 * minimal cover (sections/cover.ts) renders the resolver's output below,
 * report-intro.ts binds to the same resolver in step 5, and plan 019 must
 * EXTEND this resolver's input (manual fields, a custom question, an
 * operator situation) so the personalized answer replaces the generic one
 * at every render site at once. It must not fork the copy into a second
 * string table - that is the exact drift this seam exists to prevent.
 *
 * Pure and report-owned on purpose: no manifest, no analysis, no I/O - the
 * generic question is safe copy that cannot assert anything about the
 * client's business, bookings, growth, or legal scope.
 */

/** Canonical French bytes, verbatim from the flat design source. */
const GENERIC_DECISION_QUESTION_FR = 'Quel est l’état actuel du site, et par où commencer ?';

/** Canonical English counterpart, the approved translation of the same
 *  question (plan 018 step 4). */
const GENERIC_DECISION_QUESTION_EN =
  'What is the current state of the site, and where should you start?';

export function resolveGenericDecisionQuestion(language: ReportLanguage): string {
  return language === 'fr' ? GENERIC_DECISION_QUESTION_FR : GENERIC_DECISION_QUESTION_EN;
}
