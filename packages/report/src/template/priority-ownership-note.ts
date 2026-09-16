import type { ReportLanguage } from '@odysseus/core';
import {
  fillTemplate,
  formatNumber,
  joinClauseList,
  takesSingularAgreement,
} from './html-utils.js';
import type { PriorityOwnershipStrings } from './strings/types.js';

/** Who has to act on the priority findings, as one sentence. Both the
 *  measured-results sheet and the executive summary state this split, so
 *  the clause assembly lives here rather than twice.
 *
 *  Issue #322: the sentence used to be a single fixed template with three
 *  interpolated counts and hardcoded plural verbs, which printed
 *  "0 doivent être transmis à un tiers et 0 demandent une vérification"
 *  on a real report - wrong agreement twice over, and two clauses that
 *  said nothing. Each clause now picks its own agreement from its own
 *  count, and a clause whose count is zero is dropped entirely. */
export function renderPriorityOwnershipSentence(
  ownership: {
    'first-party-action': number;
    'third-party-escalation': number;
    'verify-intent': number;
  },
  strings: PriorityOwnershipStrings,
  language: ReportLanguage,
): string | undefined {
  const clause = (count: number, singular: string, plural: string): string | undefined =>
    count === 0
      ? undefined
      : fillTemplate(takesSingularAgreement(language, count) ? singular : plural, {
          count: formatNumber(count, language),
        });

  const clauses = [
    clause(
      ownership['first-party-action'],
      strings.firstPartySingularTemplate,
      strings.firstPartyPluralTemplate,
    ),
    clause(
      ownership['third-party-escalation'],
      strings.thirdPartySingularTemplate,
      strings.thirdPartyPluralTemplate,
    ),
    clause(
      ownership['verify-intent'],
      strings.verifyIntentSingularTemplate,
      strings.verifyIntentPluralTemplate,
    ),
  ].filter((value): value is string => value !== undefined);

  // Every count zero means there are no priority findings to attribute.
  // A lead-in with nothing after it is worse than no sentence at all.
  if (clauses.length === 0) return undefined;

  return fillTemplate(strings.leadTemplate, { clauses: joinClauseList(clauses, strings) });
}
