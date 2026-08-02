/**
 * Normalization orchestrator: turns raw per-page scanner output into the
 * locked Finding[] shape.
 *
 * packages/core deliberately declares its own narrow structural input
 * types for axe/Lighthouse data (see normalize-axe.ts / normalize-
 * lighthouse.ts) rather than depending on axe-core/lighthouse/playwright
 * for types. Those packages are scanner's dependencies, not core's: core
 * is meant to be the lightest package in the workspace, and Lighthouse in
 * particular pulls in a large dependency tree. Because TypeScript is
 * structurally typed, scanner's real PageScanResult (whose axe/lighthouse
 * fields carry the full SDK types) is assignable to these narrower
 * interfaces with zero adapter code.
 */

import {
  FINDINGS_SCHEMA_VERSION,
  MAX_ELEMENTS_PER_FINDING,
  type Finding,
  type FindingElement,
} from '../types/findings.js';
import { maxSeverity } from './severity.js';
import { computeDedupeKey } from './dedupe.js';
import { assignFindingIds } from './finding-id.js';
import { compareCriteria } from './wcag-tags.js';
import { extractAxeCandidates, type AxeResultsInput } from './normalize-axe.js';
import { extractLighthouseCandidates, type LighthouseResultInput } from './normalize-lighthouse.js';
import { extractRenderDiffCandidates } from './normalize-renderdiff.js';
import type { FindingCandidate } from './candidate.js';
import type { RenderDiffResult } from '../types/findings.js';

export interface NormalizePageInput {
  url: string;
  axe?: AxeResultsInput;
  axeError?: string;
  lighthouse?: LighthouseResultInput;
  lighthouseError?: string;
  renderDiff?: RenderDiffResult;
  renderDiffError?: string;
}

export interface NormalizeAuditInput {
  auditId: string;
  /** Used for both firstSeenAt and lastSeenAt this milestone (cross-run
   *  population is Milestone 10). */
  startedAt: Date;
  pages: NormalizePageInput[];
}

function collectCandidates(input: NormalizeAuditInput): FindingCandidate[] {
  const candidates: FindingCandidate[] = [];

  for (const page of input.pages) {
    if (page.axe) candidates.push(...extractAxeCandidates(page.axe, page.url));
    if (page.lighthouse) candidates.push(...extractLighthouseCandidates(page.lighthouse, page.url));
    if (page.renderDiff) candidates.push(...extractRenderDiffCandidates(page.renderDiff, page.url));
  }

  return candidates;
}

function mergeGroup(
  auditId: string,
  dedupeKey: string,
  group: FindingCandidate[],
  startedAt: Date,
): Omit<Finding, 'findingId'> {
  const first = group[0];
  if (!first) throw new Error('normalize: mergeGroup called with an empty group');

  const severity = group
    .map((c) => c.severity)
    .reduce((acc, s) => maxSeverity(acc, s));

  const pageUrls = [...new Set(group.map((c) => c.pageUrl))].sort();

  const wcagCriteria = [...new Set(group.flatMap((c) => c.wcagCriteria))].sort(compareCriteria);

  const elements: FindingElement[] = group
    .filter((c): c is FindingCandidate & { element: FindingElement } => c.element !== null)
    .slice(0, MAX_ELEMENTS_PER_FINDING)
    .map((c) => c.element);

  // Last write wins if two candidates in the same group land on the same
  // page (e.g. two Lighthouse detail items sharing a selector). Documented
  // rather than silently accepted: this is a real, if rare, information
  // loss and worth knowing about if a finding's evidence looks thin.
  const perPage: Record<string, unknown> = {};
  for (const candidate of group) {
    perPage[candidate.pageUrl] = candidate.rawEvidenceForPage;
  }

  return {
    auditId,
    schemaVersion: FINDINGS_SCHEMA_VERSION,
    source: first.source,
    ruleId: first.ruleId,
    category: first.category,
    severity,
    wcagCriteria,
    title: first.title,
    description: first.description,
    ...(first.helpUrl !== undefined ? { helpUrl: first.helpUrl } : {}),
    pageUrls,
    occurrences: group.length,
    elements,
    rawEvidence: {
      dedupeComponents: {
        source: first.source,
        ruleId: first.ruleId,
        selector: first.element?.selector ?? '',
      },
      perPage,
    },
    dedupeKey,
    firstSeenAt: startedAt,
    lastSeenAt: startedAt,
  };
}

export function normalizeAudit(input: NormalizeAuditInput): Finding[] {
  const candidates = collectCandidates(input);

  const groups = new Map<string, FindingCandidate[]>();
  for (const candidate of candidates) {
    const key = computeDedupeKey(candidate.source, candidate.ruleId, candidate.element?.selector ?? '');
    const group = groups.get(key);
    if (group) {
      group.push(candidate);
    } else {
      groups.set(key, [candidate]);
    }
  }

  const merged = [...groups.entries()].map(([dedupeKey, group]) =>
    mergeGroup(input.auditId, dedupeKey, group, input.startedAt),
  );

  return assignFindingIds(merged);
}
