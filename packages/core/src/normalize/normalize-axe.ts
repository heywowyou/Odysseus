/**
 * axe-core candidate extraction.
 *
 * packages/core cannot depend on axe-core for types (see normalize.ts's
 * header comment on why): this file declares its own narrow structural
 * subset of axe's real AxeResults shape, containing only the fields
 * actually read. TypeScript's structural typing means the scanner's real,
 * SDK-typed AxeResults is assignable here with no adapter code.
 */

import { MAX_SNIPPET_LENGTH } from '../types/findings.js';
import { severityFromAxe } from './severity.js';
import { wcagCriteriaFromAxeTags } from './wcag-tags.js';
import type { FindingCandidate } from './candidate.js';

/** axe's real target type allows shadow-DOM-piercing nested arrays
 *  (CrossTreeSelector = string | string[]). Flattened into one selector
 *  string here, joined with axe's own " >>> " shadow-boundary convention.
 *  This is a documented simplification: the full, unflattened target
 *  array is preserved in rawEvidenceForPage for exactness. */
export type AxeTargetInput = Array<string | string[]>;

export interface AxeNodeInput {
  html: string;
  target: AxeTargetInput;
  failureSummary?: string;
  impact?: string | null;
}

export interface AxeViolationInput {
  id: string;
  impact?: string | null;
  tags: string[];
  help: string;
  description: string;
  helpUrl?: string;
  nodes: AxeNodeInput[];
}

export interface AxeResultsInput {
  violations: AxeViolationInput[];
}

function flattenAxeTarget(target: AxeTargetInput): string {
  return target
    .map((entry) => (Array.isArray(entry) ? entry.join(' ') : entry))
    .join(' >>> ');
}

function truncateSnippet(html: string): string {
  return html.length > MAX_SNIPPET_LENGTH ? html.slice(0, MAX_SNIPPET_LENGTH) : html;
}

export function extractAxeCandidates(
  axe: AxeResultsInput,
  pageUrl: string,
): FindingCandidate[] {
  const candidates: FindingCandidate[] = [];

  for (const violation of axe.violations) {
    const wcagCriteria = wcagCriteriaFromAxeTags(violation.tags);

    for (const node of violation.nodes) {
      const selector = flattenAxeTarget(node.target);
      candidates.push({
        source: 'axe',
        ruleId: violation.id,
        category: 'accessibility',
        severity: severityFromAxe(node.impact ?? violation.impact),
        wcagCriteria,
        title: violation.help,
        description: violation.description,
        ...(violation.helpUrl !== undefined ? { helpUrl: violation.helpUrl } : {}),
        pageUrl,
        element: {
          pageUrl,
          selector,
          snippet: truncateSnippet(node.html),
        },
        rawEvidenceForPage: {
          impact: node.impact ?? violation.impact ?? null,
          target: node.target,
          failureSummary: node.failureSummary ?? null,
          tags: violation.tags,
        },
      });
    }
  }

  return candidates;
}
