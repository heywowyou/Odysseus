import type { FindingElement, ReportLanguage } from '@odysseus/core';
import { REMEDIATION_FR } from './fr.js';
import { REMEDIATION_EN } from './en.js';
import type { FixSnippet } from './snippet.js';
import { printableSelector } from '../printable-selector.js';

/** The two FindingElement fields a fixed snippet may reference. A `Pick`
 *  rather than the full `FindingElement` so a caller with no element for a
 *  given rule id (a rule this repo has never observed with elements
 *  recorded, or a site-wide rule with none) can pass an empty object
 *  instead of fabricating a stub with every required field filled in. */
export type SnippetInterpolationSource = Partial<Pick<FindingElement, 'selector' | 'resourceUrl'>>;

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
  return (language === 'fr' ? REMEDIATION_FR : REMEDIATION_EN)[ruleId]?.text;
}

/** The fix snippet classification for a scanner rule, or undefined for the
 *  same reason remediationFor can be: no reviewed entry exists yet for a
 *  rule this repo has never observed. Every entry that does exist carries a
 *  snippet (RemediationEntry.snippet is non-optional), so undefined here
 *  means "no remediation entry at all", never "entry exists but has no
 *  snippet classification". */
export function snippetFor(ruleId: string, language: ReportLanguage): FixSnippet | undefined {
  return (language === 'fr' ? REMEDIATION_FR : REMEDIATION_EN)[ruleId]?.snippet;
}

const PLACEHOLDER_PATTERN = /\{\{(selector|resourceUrl)\}\}/g;

/** Deterministic template interpolation for a `fixed` snippet, never the
 *  model (non-negotiable rule 1). Only `{{selector}}` and `{{resourceUrl}}`
 *  are recognized placeholders, filled in from the finding's own
 *  `FindingElement`; a placeholder with no matching data on this element
 *  renders as an empty string rather than leaving the literal token visible.
 *
 *  Plain string substitution only, no HTML escaping here: the result is
 *  example code text, not markup to render, so the caller must run the
 *  whole returned string through the report's own `escapeHtml` at the point
 *  it is placed into the document, the same as every other rendered value.
 *  Escaping only the substituted value here and the surrounding template
 *  text again at render time would double-encode the value's own escaped
 *  characters.
 *
 *  `fill-in-blank` and `not-applicable` snippets are never interpolated:
 *  a fill-in-blank template's blank is meant for the client's own words, and
 *  substituting the finding's own captured content into it (an already-bad
 *  value) adds noise, not help, per the brainstorm's own reasoning
 *  (docs/product/fix-snippets-and-scorecard-brainstorm.md). Callers should
 *  render `template` as-is for those two kinds. */
export function interpolateSnippet(
  snippet: FixSnippet,
  source: SnippetInterpolationSource,
): string {
  if (snippet.kind !== 'fixed') return '';
  return snippet.template.replace(
    PLACEHOLDER_PATTERN,
    (_match, token: 'selector' | 'resourceUrl') => {
      if (token === 'selector') return printableSelector(source.selector ?? '');
      return source.resourceUrl ?? '';
    },
  );
}

export { REMEDIATION_FR, REMEDIATION_EN };
export type { FixSnippet };
