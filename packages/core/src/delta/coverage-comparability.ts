/**
 * Cross-run observability for the findings delta (plan 059 sections 5.18
 * and 16, step 35). Pure and deterministic: two runs' coverage signatures
 * go in, and the answer to "may this observation be compared at all" comes
 * out before the delta says new, resolved or persistent.
 *
 * `dedupeKey` stays the identity of a finding; nothing here alters,
 * merges or splits one. The coverage signature decides only whether the
 * presence or the absence of a finding in one run may be read against the
 * other run. A current finding the baseline could not have seen is not a
 * client regression, and a baseline finding this run could not re-check is
 * not a repair.
 *
 * This module is the delta-side twin of the scanner's
 * `audit-environment-fingerprint.ts` comparability: the scanner owns the
 * evidence-graph side of the same section-16 contract and cannot be
 * imported here (core has no dependency on scanner), so the pairwise
 * question - which only the delta can answer, because it alone holds both
 * runs - lives here over the delta's own coverage shape. What the delta
 * needs is narrower than the scanner's: findings are classified per
 * observation, one check on one surface, and a legacy run whose checks
 * were never recorded must degrade to the shipped Plan-051/054 semantics
 * rather than to invented comparability.
 *
 * Deliberately absent from the coverage shape: the normalization contract.
 * The delta runs already carry it as `findingsProvenance`, and a changed
 * contract is disclosed there (`normalizationChanged`) with severity moves
 * suppressed, which is the shipped Plan-051/054 behavior for that slice.
 * Folding it in here too would let one slice answer twice.
 */

export const FINDINGS_DELTA_COVERAGE_VERSION = 'findings-delta-coverage-v1';

/** Where one finding was observed: the check whose accepted evidence saw
 *  it, on the surface it ran. Keyed by `dedupeKey` inside a run, because
 *  that key is the finding's identity within the run. */
export interface DeltaObservationCoordinates {
  checkId: string;
  surfaceId: string;
}

/** One check's observability in one run, mirroring the scanner's
 *  `CheckObservability` (whose frame-capability union is assignable to the
 *  string here because the delta never branches on specific levels, only
 *  on sameness). */
export interface DeltaCheckObservability {
  checkId: string;
  /** The implementation version of the check itself. A bump means its
   *  verdict on unchanged input may have changed. */
  version: string;
  /** Surface ids the check actually ran on in this run. */
  surfaces: readonly string[];
  frameCapability: string;
  /** True where the semantic classifier decides whether the check applies
   *  to a page at all (section 5.18 keeps the classifier's influence to
   *  exactly this case). */
  semanticallyConditional: boolean;
}

/**
 * One run's observability, carried from its persisted evidence.
 *
 * Every slice except `surfaces` is optional, and each optionality is a
 * truth claim, not a convenience. A run whose evidence predates the
 * coverage graph has no check detail and no finding coordinates: `checks`
 * and `observations` stay absent, and the comparison answers only the
 * surface question, which a pre-059 audit can answer honestly (it scanned
 * exactly `LEGACY_DELTA_SURFACES`). Absent scope and inventory signatures
 * mean the run cannot support scope-change disclosures either; unknown is
 * never reported as changed.
 */
export interface FindingsDeltaCoverage {
  version: typeof FINDINGS_DELTA_COVERAGE_VERSION;
  /** The run's declared scope digest. Absent for a legacy run. */
  scopeSignature?: string;
  /** The run's reconciled inventory digest. Absent for a legacy run. */
  inventorySignature?: string;
  capabilityRegistryVersion: string;
  semanticClassifierVersion?: string;
  /** Per-check observability. Absent for a legacy run: the check slice is
   *  unknown-legacy, never guessed from absence. */
  checks?: readonly DeltaCheckObservability[];
  /** The surfaces this run could observe, including ones no check used. */
  surfaces: readonly string[];
  /** Surface IDs omitted by the deterministic family sample. A finding
   *  from one of these surfaces is not comparable to this run, not a pass. */
  plannedOutOfScopeSurfaces?: readonly string[];
  /** Where each finding (by `dedupeKey`) was observed. Absent for a
   *  legacy run, whose findings carry no recorded coordinates. */
  observations?: Readonly<Record<string, DeltaObservationCoordinates>>;
}

/**
 * The surfaces every pre-coverage audit actually scanned: the baseline
 * desktop render plus the site-level requests (robots, sitemap, security
 * headers, cookies) that predate Plan 059. Stated positively rather than
 * left absent so that a genuinely new surface - a mobile render, a
 * hydration sweep - is newly observable against such a baseline, while
 * everything the legacy audit did see stays comparable.
 */
export const LEGACY_DELTA_SURFACES: readonly string[] = [
  'baseline-desktop',
  'surface:site-request',
];

/** Builds the honest coverage of a run that predates the coverage graph:
 *  the surfaces it is known to have scanned, and nothing else - no checks,
 *  no coordinates, no scope or inventory identity. */
export function buildLegacyFindingsDeltaCoverage(): FindingsDeltaCoverage {
  return {
    version: FINDINGS_DELTA_COVERAGE_VERSION,
    capabilityRegistryVersion: 'unknown-legacy',
    surfaces: LEGACY_DELTA_SURFACES,
  };
}

export type NewlyObservableCoverageReason =
  'check-absent-in-baseline' | 'surface-absent-in-baseline';

export type NotComparableCoverageReason =
  | 'check-absent-in-current'
  | 'check-version-changed'
  | 'semantic-classifier-changed'
  | 'frame-capability-changed'
  | 'surface-absent-in-current'
  | 'surface-planned-out-of-scope';

/** Section 16's answers for one observation, before the delta may call it
 *  new, resolved or persistent. `comparable` means "use the shipped
 *  Plan-051/054 semantics", which is also the legacy degradation. */
export type DeltaObservationComparability =
  | { kind: 'comparable' }
  | { kind: 'newly-observable'; reason: NewlyObservableCoverageReason }
  | { kind: 'not-comparable'; reason: NotComparableCoverageReason };

function findCheck(
  coverage: FindingsDeltaCoverage,
  checkId: string,
): DeltaCheckObservability | undefined {
  return coverage.checks?.find((check) => check.checkId === checkId);
}

/**
 * Whether one finding's check-and-surface observation may be compared
 * between two runs.
 *
 * The check question is answered only when both runs recorded their
 * checks; a legacy run's silence is not evidence that a check was absent,
 * so it can never produce `newly-observable` (check-absent-in-baseline)
 * or `not-comparable` (check-absent-in-current) on its own. The surface
 * question is always answered, including against a legacy run, because
 * the surfaces a pre-coverage run scanned are known. Check-level answers
 * come first: a check the baseline never ran makes the surface question
 * moot in the direction that matters - everything it saw is newly
 * observable.
 */
export function compareDeltaObservationAcrossRuns(
  baseline: FindingsDeltaCoverage,
  current: FindingsDeltaCoverage,
  observation: DeltaObservationCoordinates,
): DeltaObservationComparability {
  if (baseline.checks !== undefined && current.checks !== undefined) {
    const before = findCheck(baseline, observation.checkId);
    const after = findCheck(current, observation.checkId);
    if (before === undefined) {
      return { kind: 'newly-observable', reason: 'check-absent-in-baseline' };
    }
    if (after === undefined) {
      return { kind: 'not-comparable', reason: 'check-absent-in-current' };
    }
    if (before.version !== after.version) {
      return { kind: 'not-comparable', reason: 'check-version-changed' };
    }
    if (
      (before.semanticallyConditional || after.semanticallyConditional) &&
      baseline.semanticClassifierVersion !== current.semanticClassifierVersion
    ) {
      return { kind: 'not-comparable', reason: 'semantic-classifier-changed' };
    }
    if (before.frameCapability !== after.frameCapability) {
      return { kind: 'not-comparable', reason: 'frame-capability-changed' };
    }
  }

  if (!baseline.surfaces.includes(observation.surfaceId)) {
    return { kind: 'newly-observable', reason: 'surface-absent-in-baseline' };
  }
  if (!current.surfaces.includes(observation.surfaceId)) {
    return {
      kind: 'not-comparable',
      reason: current.plannedOutOfScopeSurfaces?.includes(observation.surfaceId)
        ? 'surface-planned-out-of-scope'
        : 'surface-absent-in-current',
    };
  }
  return { kind: 'comparable' };
}

export interface DeltaCoverageSliceComparison {
  /** The declared scope differs. Never incomparability: findings are
   *  rescoped and paired within the shared scope and the difference is
   *  disclosed. Unknown on either side is `false`, not a change. */
  scopeChanged: boolean;
  /** The reconciled inventory differs - a site that gained or lost pages.
   *  Same treatment as scope: rescope and disclose, never a regression. */
  inventoryChanged: boolean;
  /** Recorded for provenance. Deliberately not a comparability signal on
   *  its own; a versioned registry bump says nothing about one specific
   *  check's ability to see, which the per-check slices carry. */
  capabilityRegistryChanged: boolean;
}

/** Compares the two runs' scope/inventory/registry slices for disclosure
 *  beside rescoped pairing. Slices unknown on either side are `false`: a
 *  legacy run discloses no scope change because it claims no scope. */
export function compareDeltaCoverageSlices(
  baseline: FindingsDeltaCoverage,
  current: FindingsDeltaCoverage,
): DeltaCoverageSliceComparison {
  return {
    scopeChanged:
      baseline.scopeSignature !== undefined &&
      current.scopeSignature !== undefined &&
      baseline.scopeSignature !== current.scopeSignature,
    inventoryChanged:
      baseline.inventorySignature !== undefined &&
      current.inventorySignature !== undefined &&
      baseline.inventorySignature !== current.inventorySignature,
    capabilityRegistryChanged:
      baseline.capabilityRegistryVersion !== current.capabilityRegistryVersion,
  };
}
