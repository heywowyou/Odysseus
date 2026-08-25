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

/** 2026-08-25 Lagnonu review, D4b. Rules whose defect belongs to a group of
 *  controls rather than to each control individually. A real report listed
 *  `target-size` twenty one times over four annex pages: twenty of them were
 *  the pagination dots of one carousel, differing only by
 *  `[aria-label="Go to slide N"]`. The client has one thing to do - make that
 *  control group bigger - and reads it twenty one times.
 *
 *  The identity is the container, taken as the selector's ancestor path, so
 *  controls in different containers stay separate findings. Deliberately not
 *  selector normalization: trade-off 3 rejected stripping :nth-child(), and
 *  trade-off 30 confirmed the reasoning with real counter-examples where
 *  pattern-stripping merged genuinely distinct elements. Nothing is guessed
 *  here - two controls merge only when their own selectors state the same
 *  parent.
 *
 *  A selector with no ancestor path keeps its own identity rather than
 *  collapsing onto a shared empty string, the same "never merge on absent
 *  data" rule normalize-lighthouse.ts's resourceIdentityForItem follows. */
const CONTAINER_IDENTIFIED_AXE_RULES: ReadonlySet<string> = new Set(['target-size']);

function containerIdentity(ruleId: string, selector: string): string | undefined {
  if (!CONTAINER_IDENTIFIED_AXE_RULES.has(ruleId)) return undefined;
  const lastCombinator = selector.lastIndexOf('>');
  if (lastCombinator === -1) return undefined;
  const container = selector.slice(0, lastCombinator).trim();
  return container.length > 0 ? container : undefined;
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
        ...(() => {
          const identity = containerIdentity(violation.id, selector);
          return identity === undefined ? {} : { dedupeIdentity: identity };
        })(),
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
