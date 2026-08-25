import type { ReportLanguage } from '@odysseus/core';
import { REMEDIATION_FR } from './fr.js';
import { REMEDIATION_EN } from './en.js';

/** Fixed remediation copy for a scanner rule, or undefined when this repo
 *  has never observed that rule in real output and so has no reviewed copy
 *  for it.
 *
 *  Undefined is a real answer, not a gap to paper over with the rule's own
 *  title reworded into an imperative. A remediation instruction that is
 *  wrong is worse than none: the caller renders nothing rather than a guess,
 *  and remediation.test.ts fails the build the moment a rule appearing in
 *  the committed reference audits has no entry, so the absence is caught
 *  before a client ever reads the section. */
export function remediationFor(ruleId: string, language: ReportLanguage): string | undefined {
  return (language === 'fr' ? REMEDIATION_FR : REMEDIATION_EN)[ruleId];
}

export { REMEDIATION_FR, REMEDIATION_EN };
