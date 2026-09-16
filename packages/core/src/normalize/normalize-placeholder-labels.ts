/**
 * Issue #372: violation judgment for placeholder-only-label. The scanner
 * (placeholder-labels.ts) extracts every visible text control carrying a
 * placeholder and whether anything else names it; this decides. One
 * candidate per control: each field needs its own label written, so they
 * are separate fixes, not occurrences of one.
 *
 * WCAG 3.3.2 (Labels or Instructions): axe accepts the placeholder as an
 * accessible name, so this is not a 4.1.2 name failure, but the visible
 * label disappears once the visitor starts typing.
 */

import type { FindingCandidate } from './candidate.js';
import { severityFromCustom } from './severity.js';

export const PLACEHOLDER_ONLY_LABEL_RULE_ID = 'placeholder-only-label';

export interface PlaceholderLabelControlInput {
  selector: string;
  controlType: string;
  placeholder: string;
  hasOtherName: boolean;
}

export interface PlaceholderLabelsCheckInput {
  pageUrl: string;
  controls: PlaceholderLabelControlInput[];
}

export function extractPlaceholderLabelCandidates(
  input: PlaceholderLabelsCheckInput,
): FindingCandidate[] {
  const candidates: FindingCandidate[] = [];

  for (const control of input.controls) {
    if (control.hasOtherName) continue;
    if (control.placeholder.trim().length === 0) continue;
    candidates.push({
      source: 'custom',
      ruleId: PLACEHOLDER_ONLY_LABEL_RULE_ID,
      category: 'accessibility',
      severity: severityFromCustom(PLACEHOLDER_ONLY_LABEL_RULE_ID),
      wcagCriteria: ['3.3.2'],
      title: 'Form field labelled only by its placeholder',
      description: `This ${control.controlType} field has no label, aria-label, aria-labelledby or title; its only visible name is the placeholder "${control.placeholder}", which disappears as soon as the visitor types.`,
      pageUrl: input.pageUrl,
      element: { pageUrl: input.pageUrl, selector: control.selector, snippet: '' },
      rawEvidenceForPage: {},
    });
  }

  return candidates;
}
