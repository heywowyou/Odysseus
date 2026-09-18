/**
 * Browser surfaces, readiness, frame coverage and accessibility capability
 * contracts for Plan 059. These artifacts describe what was actually exposed
 * to checks; silence outside that capability can never be treated as a pass.
 */
import { canonicalDigest } from '@odysseus/core';

export const SCAN_SURFACE_VERSION = 'scan-surface-v1';
export const PAGE_READINESS_RECORD_VERSION = 'page-readiness-v1';
export const FRAME_COVERAGE_RECORD_VERSION = 'frame-coverage-v1';
export const ACCESSIBILITY_CAPABILITY_REGISTRY_VERSION = 'accessibility-capability-v1';

export type SurfaceInteractionState =
  'baseline' | 'hydrated' | 'consent-rejected' | `local-state:${string}`;

export type SurfaceReadinessOutcome = 'ready' | 'timeout' | 'unstable' | 'blocked';

export interface ScanSurfaceInput {
  evidenceEpoch: number;
  pageIdentity: string;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  hasTouch: boolean;
  media: {
    colorScheme: 'light' | 'dark' | 'no-preference';
    reducedMotion: 'reduce' | 'no-preference';
  };
  /** Must remain the published Odysseus identity on mobile surfaces. */
  userAgent: string;
  interactionState: SurfaceInteractionState;
  storageIsolationGroup: string;
  readinessOutcome: SurfaceReadinessOutcome;
}

export interface ScanSurface extends ScanSurfaceInput {
  version: typeof SCAN_SURFACE_VERSION;
  surfaceFingerprint: string;
  surfaceId: string;
}

export function buildScanSurface(input: ScanSurfaceInput): ScanSurface {
  if (input.viewport.width <= 0 || input.viewport.height <= 0) {
    throw new Error('buildScanSurface: viewport dimensions must be positive');
  }
  if (input.deviceScaleFactor <= 0) {
    throw new Error('buildScanSurface: deviceScaleFactor must be positive');
  }
  const body = { ...input, version: SCAN_SURFACE_VERSION } as const;
  const surfaceFingerprint = canonicalDigest(body);
  return {
    ...body,
    surfaceFingerprint,
    surfaceId: `surface:${surfaceFingerprint.slice('sha256:'.length, 'sha256:'.length + 20)}`,
  };
}

export interface PageReadinessRecordInput {
  evidenceEpoch: number;
  pageIdentity: string;
  surfaceId: string;
  navigationMilestone: 'commit' | 'domcontentloaded' | 'load' | 'none';
  httpStatus: number | null;
  domReady: boolean;
  fontsReady: boolean | null;
  networkQuiet: boolean;
  mutationQuiescent: boolean;
  hydrationProgress: 'not-run' | 'stable' | 'bounded-expansion' | 'failed';
  significantResourceFailures: readonly string[];
  outcome: SurfaceReadinessOutcome;
  diagnosticCode?: string;
}

export interface PageReadinessRecord extends PageReadinessRecordInput {
  version: typeof PAGE_READINESS_RECORD_VERSION;
  digest: string;
}

export function buildPageReadinessRecord(input: PageReadinessRecordInput): PageReadinessRecord {
  if (input.outcome === 'ready' && (!input.domReady || !input.networkQuiet)) {
    throw new Error(
      'buildPageReadinessRecord: ready requires DOM readiness and bounded network quiet',
    );
  }
  const body = {
    ...input,
    significantResourceFailures: [...new Set(input.significantResourceFailures)].sort(),
    version: PAGE_READINESS_RECORD_VERSION,
  } as const;
  return { ...body, digest: canonicalDigest(body) };
}

export type FrameTraversalCapability =
  'document-only' | 'open-shadow' | 'same-origin-frames' | 'cross-origin-frames';

export interface FrameCoverageRecordInput {
  evidenceEpoch: number;
  pageIdentity: string;
  surfaceId: string;
  frameUrl: string;
  frameOrigin: string;
  sameOrigin: boolean;
  materiality: 'material' | 'non-material' | 'unknown';
  traversedCheckIds: readonly string[];
  limitationReason?:
    | 'cross-origin-opaque'
    | 'third-party-flow'
    | 'tool-capability'
    | 'frame-load-failed'
    | 'not-applicable';
  evidenceRefs: readonly string[];
}

export interface FrameCoverageRecord extends FrameCoverageRecordInput {
  version: typeof FRAME_COVERAGE_RECORD_VERSION;
  digest: string;
}

export function buildFrameCoverageRecord(input: FrameCoverageRecordInput): FrameCoverageRecord {
  if (
    !input.sameOrigin &&
    input.materiality === 'material' &&
    input.traversedCheckIds.length === 0 &&
    input.limitationReason === undefined
  ) {
    throw new Error(
      'buildFrameCoverageRecord: an opaque material cross-origin frame requires a limitation reason',
    );
  }
  const body = {
    ...input,
    traversedCheckIds: [...new Set(input.traversedCheckIds)].sort(),
    evidenceRefs: [...new Set(input.evidenceRefs)].sort(),
    version: FRAME_COVERAGE_RECORD_VERSION,
  } as const;
  return { ...body, digest: canonicalDigest(body) };
}

export type CapabilityEvidenceKind = 'deterministic' | 'heuristic';

export interface AccessibilityCheckCapability {
  checkId: string;
  version: string;
  criterionRefs: readonly string[];
  evidenceKind: CapabilityEvidenceKind;
  proves: string;
  falseNegativeBoundary: string;
  traversal: {
    document: true;
    openShadowRoots: boolean;
    sameOriginFrames: boolean;
    crossOriginFrames: boolean;
  };
  requiredInteractionStates: readonly SurfaceInteractionState[];
  requiredSurfaceProfiles: readonly string[];
  manualGaps: readonly string[];
}

export interface AccessibilityCapabilityRegistryInput {
  checks: readonly AccessibilityCheckCapability[];
}

export interface AccessibilityCapabilityRegistry {
  version: typeof ACCESSIBILITY_CAPABILITY_REGISTRY_VERSION;
  checks: readonly AccessibilityCheckCapability[];
  digest: string;
}

export function buildAccessibilityCapabilityRegistry(
  input: AccessibilityCapabilityRegistryInput,
): AccessibilityCapabilityRegistry {
  const ids = new Set<string>();
  const checks = [...input.checks]
    .map((check) => {
      if (ids.has(check.checkId)) {
        throw new Error(`buildAccessibilityCapabilityRegistry: duplicate check ${check.checkId}`);
      }
      ids.add(check.checkId);
      return {
        ...check,
        criterionRefs: [...new Set(check.criterionRefs)].sort(),
        requiredInteractionStates: [...new Set(check.requiredInteractionStates)].sort(),
        requiredSurfaceProfiles: [...new Set(check.requiredSurfaceProfiles)].sort(),
        manualGaps: [...new Set(check.manualGaps)].sort(),
      };
    })
    .sort((a, b) => a.checkId.localeCompare(b.checkId));
  const body = { version: ACCESSIBILITY_CAPABILITY_REGISTRY_VERSION, checks } as const;
  return { ...body, digest: canonicalDigest(body) };
}

export function capabilityTraversalLevel(
  capability: AccessibilityCheckCapability,
): FrameTraversalCapability {
  if (capability.traversal.crossOriginFrames) return 'cross-origin-frames';
  if (capability.traversal.sameOriginFrames) return 'same-origin-frames';
  if (capability.traversal.openShadowRoots) return 'open-shadow';
  return 'document-only';
}
