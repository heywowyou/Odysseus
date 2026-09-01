import type { AuditManifest, ManifestPageEntry } from '../types/manifest.js';
import type { Finding } from '../types/findings.js';
import type { JourneyDecision } from './preparation.js';
import {
  JOURNEY_IDS,
  type JourneyId,
  type JourneyStepId,
  type JourneyStepState,
} from './vocabulary.js';

/**
 * Evidence-aware journey policy, plan 019 step 3. Journeys are suggested
 * from captured evidence, the operator can only confirm or remove, and a
 * displayed step always reads exactly one of the three approved states.
 * `no-issue-detected` requires positive evidence that the relevant
 * deterministic check ran successfully; absence of a finding is never a
 * pass. Evidence comes from the on-disk manifest and findings artifacts,
 * not the Mongo audit document, whose schema deliberately does not persist
 * `siteSignals` (trade-off 62).
 */

export type JourneyDetectorKey = 'axe' | 'render-diff';

export interface JourneyStepDefinition {
  stepId: JourneyStepId;
  detector: JourneyDetectorKey;
}

export interface JourneyDefinition {
  journeyId: JourneyId;
  steps: readonly JourneyStepDefinition[];
}

/**
 * The closed catalogue. Every entry must keep a typed suggestion predicate
 * and a detector with per-page success evidence; UI copy alone is
 * insufficient for a new step.
 */
export const JOURNEY_CATALOGUE: readonly JourneyDefinition[] = [
  {
    journeyId: 'discovery-navigation',
    steps: [
      { stepId: 'arrival-page', detector: 'render-diff' },
      { stepId: 'main-pages', detector: 'axe' },
    ],
  },
  {
    journeyId: 'transaction-booking',
    steps: [
      { stepId: 'booking-page', detector: 'render-diff' },
      { stepId: 'booking-form', detector: 'axe' },
    ],
  },
];

export type JourneyExclusionReason =
  | 'evidence-unavailable'
  | 'no-visited-pages'
  | 'no-transactional-flow'
  | 'no-transactional-page-visited';

export type StepNotEvaluatedReason = 'no-page-in-scope' | 'detector-failed' | 'detector-absent';

export type JourneySuggestion =
  | { journeyId: JourneyId; available: true }
  | { journeyId: JourneyId; available: false; reason: JourneyExclusionReason };

export interface JourneyEvidence {
  manifest: AuditManifest;
  findings: readonly Finding[];
}

export interface ResolvedJourneyStep {
  stepId: JourneyStepId;
  state: JourneyStepState;
  notEvaluatedReason?: StepNotEvaluatedReason;
}

export interface ResolvedJourney {
  journeyId: JourneyId;
  steps: readonly ResolvedJourneyStep[];
}

function urlKey(url: string): string {
  return url.replace(/\/+$/, '');
}

function visitedPages(manifest: AuditManifest): ManifestPageEntry[] {
  return manifest.pages.filter((page) => page.status === 'visited');
}

/** The arrival page: the site URL itself when visited, otherwise the
 *  shallowest visited page, ties broken lexicographically for determinism. */
function selectArrivalPage(
  manifest: AuditManifest,
  visited: readonly ManifestPageEntry[],
): ManifestPageEntry | undefined {
  const siteKey = urlKey(manifest.siteUrl);
  return (
    visited.find((page) => urlKey(page.url) === siteKey) ??
    [...visited].sort((left, right) => {
      if (left.depth !== right.depth) return left.depth - right.depth;
      return left.url.localeCompare(right.url);
    })[0]
  );
}

function transactionalPageUrls(manifest: AuditManifest): string[] {
  const evidence = manifest.siteSignals?.transactionalFlowEvidence ?? [];
  return [...new Set(evidence.map((entry) => entry.pageUrl))];
}

function isDetectorSuccessful(entry: ManifestPageEntry, detector: JourneyDetectorKey): boolean {
  if (entry.status !== 'visited') return false;
  if (detector === 'axe') return entry.errors?.axe === undefined;
  // A successful render pass always records `renderDiffMissingPercent`;
  // requiring it keeps absence of the pass from reading as a clean pass.
  return entry.errors?.renderDiff === undefined && entry.renderDiffMissingPercent !== undefined;
}

function hasMatchingFinding(
  findings: readonly Finding[],
  detector: JourneyDetectorKey,
  scopedUrls: ReadonlySet<string>,
): boolean {
  const source = detector === 'axe' ? 'axe' : 'renderdiff';
  return findings.some(
    (finding) =>
      finding.source === source &&
      finding.pageUrls.some((pageUrl) => scopedUrls.has(urlKey(pageUrl))),
  );
}

function suggestDiscovery(manifest: AuditManifest): JourneySuggestion {
  if (visitedPages(manifest).length === 0) {
    return { journeyId: 'discovery-navigation', available: false, reason: 'no-visited-pages' };
  }
  return { journeyId: 'discovery-navigation', available: true };
}

function suggestTransaction(manifest: AuditManifest): JourneySuggestion {
  if (!manifest.siteSignals?.hasTransactionalFlow) {
    return { journeyId: 'transaction-booking', available: false, reason: 'no-transactional-flow' };
  }
  const visitedKeys = new Set(visitedPages(manifest).map((page) => urlKey(page.url)));
  const covered = transactionalPageUrls(manifest).some((url) => visitedKeys.has(urlKey(url)));
  if (!covered) {
    return {
      journeyId: 'transaction-booking',
      available: false,
      reason: 'no-transactional-page-visited',
    };
  }
  return { journeyId: 'transaction-booking', available: true };
}

/**
 * One suggestion per catalogue journey, in catalogue order, each with a
 * typed reason when unavailable. `null` evidence (artifacts missing) makes
 * every journey unavailable; it never falls back to suggesting them anyway.
 */
export function suggestJourneys(evidence: JourneyEvidence | null): JourneySuggestion[] {
  if (!evidence) {
    return JOURNEY_IDS.map((journeyId) => ({
      journeyId,
      available: false,
      reason: 'evidence-unavailable' as const,
    }));
  }
  const byId: Record<JourneyId, JourneySuggestion> = {
    'discovery-navigation': suggestDiscovery(evidence.manifest),
    'transaction-booking': suggestTransaction(evidence.manifest),
  };
  return JOURNEY_IDS.map((journeyId) => byId[journeyId]);
}

function resolveStep(
  evidence: JourneyEvidence,
  step: JourneyStepDefinition,
  scopedUrls: readonly string[],
): ResolvedJourneyStep {
  if (scopedUrls.length === 0) {
    return { stepId: step.stepId, state: 'not-evaluated', notEvaluatedReason: 'no-page-in-scope' };
  }
  const keys = new Set(scopedUrls.map(urlKey));
  if (hasMatchingFinding(evidence.findings, step.detector, keys)) {
    return { stepId: step.stepId, state: 'issue-observed' };
  }

  const entriesByUrl = new Map(evidence.manifest.pages.map((page) => [urlKey(page.url), page]));
  const states = scopedUrls.map((url) => {
    const entry = entriesByUrl.get(urlKey(url));
    if (!entry || entry.status !== 'visited') return 'detector-absent' as const;
    if (isDetectorSuccessful(entry, step.detector)) return 'success' as const;
    return detectorFailureKind(entry, step.detector);
  });

  // `no-issue-detected` needs every scoped page positively evaluated; one
  // failed or missing detector anywhere in scope downgrades the step.
  if (states.every((state) => state === 'success')) {
    return { stepId: step.stepId, state: 'no-issue-detected' };
  }
  const notEvaluatedReason: StepNotEvaluatedReason = states.includes('detector-failed')
    ? 'detector-failed'
    : 'detector-absent';
  return { stepId: step.stepId, state: 'not-evaluated', notEvaluatedReason };
}

/** Distinguishes a recorded detector failure from a pass that never ran:
 *  an axe error string is written only on failure, while the render pass
 *  proves itself by having recorded `renderDiffMissingPercent`. */
function detectorFailureKind(
  entry: ManifestPageEntry,
  detector: JourneyDetectorKey,
): StepNotEvaluatedReason {
  if (detector === 'axe') return 'detector-failed';
  return entry.errors?.renderDiff !== undefined ? 'detector-failed' : 'detector-absent';
}

function scopeForStep(
  manifest: AuditManifest,
  journeyId: JourneyId,
  stepId: JourneyStepId,
): string[] {
  const visited = visitedPages(manifest);
  if (journeyId === 'discovery-navigation') {
    if (stepId === 'arrival-page') {
      const arrival = selectArrivalPage(manifest, visited);
      return arrival ? [arrival.url] : [];
    }
    return visited.map((page) => page.url);
  }
  const visitedKeys = new Set(visited.map((page) => urlKey(page.url)));
  return transactionalPageUrls(manifest).filter((url) => visitedKeys.has(urlKey(url)));
}

/**
 * Resolve one journey from current evidence, or null when the evidence does
 * not support it. Stored decisions never widen this: a confirmed journey
 * that has lost its evidence is excluded by the caller.
 */
export function resolveJourney(
  evidence: JourneyEvidence | null,
  journeyId: JourneyId,
): ResolvedJourney | null {
  const definition = JOURNEY_CATALOGUE.find((entry) => entry.journeyId === journeyId);
  if (!evidence || !definition) return null;
  const suggestion = suggestJourneys(evidence).find((entry) => entry.journeyId === journeyId);
  if (!suggestion?.available) return null;
  return {
    journeyId,
    steps: definition.steps.map((step) =>
      resolveStep(evidence, step, scopeForStep(evidence.manifest, journeyId, step.stepId)),
    ),
  };
}

export interface ConfirmedJourneysResolution {
  confirmed: ResolvedJourney[];
  /** Confirmed journeys the current evidence can no longer support. */
  excluded: { journeyId: JourneyId; reason: JourneyExclusionReason }[];
}

/**
 * Apply stored operator decisions to the current evidence. Resolution is
 * recomputed every time so stored prose cannot drift from what the evidence
 * actually shows; a stored confirmation can only narrow, never create, a
 * journey the evidence excludes.
 */
export function resolveConfirmedJourneys(
  evidence: JourneyEvidence | null,
  decisions: readonly JourneyDecision[],
): ConfirmedJourneysResolution {
  const suggestions = suggestJourneys(evidence);
  const confirmed: ResolvedJourney[] = [];
  const excluded: ConfirmedJourneysResolution['excluded'] = [];

  for (const journeyId of JOURNEY_IDS) {
    const decision = decisions.find((entry) => entry.journeyId === journeyId);
    if (!decision || decision.decision !== 'confirmed') continue;
    const suggestion = suggestions.find((entry) => entry.journeyId === journeyId);
    const resolved = resolveJourney(evidence, journeyId);
    if (resolved && suggestion?.available) confirmed.push(resolved);
    else if (suggestion && !suggestion.available) {
      excluded.push({ journeyId, reason: suggestion.reason });
    } else {
      excluded.push({ journeyId, reason: 'evidence-unavailable' });
    }
  }
  return { confirmed, excluded };
}
