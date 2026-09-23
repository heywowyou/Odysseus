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

/** A deterministic plan omission, never a failed surface capability. */
export type SurfaceSkipReason = 'family-sampled';

/** How far the bounded hydration sweep got on this surface (section 9).
 *  `not-run` is the honest value for a sweep that was never asked for. */
export type HydrationProgress = 'not-run' | 'stable' | 'bounded-expansion' | 'failed';

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
  // Readiness is what happened on the surface, not which surface it was. It
  // stays on the record but out of the identity, so a retry that reached
  // readiness competes with the attempt that timed out instead of becoming a
  // different surface that never has to agree with it.
  const { readinessOutcome: _readiness, ...identity } = body;
  const surfaceFingerprint = canonicalDigest(identity);
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
  hydrationProgress: HydrationProgress;
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

/** The viewport Playwright gives a context that does not set one, which is
 *  what every baseline rendered pass runs under. */
export const BASELINE_DESKTOP_VIEWPORT = { width: 1280, height: 720 } as const;

/**
 * The one mobile profile every mobile surface runs under, kept stable for
 * the whole evidence epoch so surfaces are comparable across pages and runs.
 * A phones-class viewport (390x844), a 3x device scale and touch, with the
 * same light/no-reduced-motion media defaults the desktop baseline gets.
 */
export const MOBILE_SURFACE_PROFILE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  hasTouch: true,
  media: { colorScheme: 'light', reducedMotion: 'no-preference' },
} as const;

/** Thrown before any navigation happens when a mobile surface would have to
 *  change the crawler identity to run. Fail closed: a mobile audit that
 *  requires impersonating a phone browser is refused, never attempted. */
export class SurfaceIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SurfaceIdentityError';
  }
}

/**
 * Client-facing capability/coverage language for what the mobile surface
 * proves (plan 059 correction 3.8: "The capability registry states this
 * limitation explicitly"). The mobile surface renders in a phone-class
 * viewport with touch; it does not send a phone vendor's user agent, so a
 * server that adapts its HTML to the User-Agent header serves the crawler
 * the same desktop variant as always, and that variant is what was checked.
 */
export interface SurfaceCapabilityStatement {
  code: string;
  fr: string;
  en: string;
}

/** A capability statement bound to the page it applies to: a surface that
 *  could not run, or cannot prove what its profile claims, is disclosed on
 *  the page's own evidence rather than silently omitted. */
export interface SurfaceLimitationRecord extends SurfaceCapabilityStatement {
  surfaceId?: string;
  detail?: string;
}

export const MOBILE_UA_NEGOTIATION_LIMITATION: SurfaceCapabilityStatement = {
  code: 'mobile-ua-negotiated-variant-untested',
  fr: "L'analyse mobile conserve l'identité de notre robot d'analyse : seules la fenêtre d'affichage et les capacités tactiles changent. Les variantes du site servies uniquement à un navigateur mobile identifié par son user-agent ne sont pas testées.",
  en: 'The mobile analysis keeps our published crawler identity: only the viewport and touch capabilities change. Variants of the site served only to a mobile browser identified by its user agent are not tested.',
};

/** The statement recorded on a page whose mobile surface could not run at
 *  all. A scanner failure is disclosed as such — it is never folded into a
 *  statement about the site. */
export const MOBILE_SURFACE_UNAVAILABLE: SurfaceCapabilityStatement = {
  code: 'mobile-surface-unavailable',
  fr: "La surface mobile d'une page n'a pas pu être analysée : la page n'a été vérifiée que dans le rendu de bureau.",
  en: "One page's mobile surface could not be analysed: the page was only verified in the desktop rendering.",
};

/** The statement recorded when the mobile surface was refused because the
 *  run's user agent is not the published crawler identity (fail closed —
 *  no impersonation, no partial mobile evidence). */
export const MOBILE_SURFACE_IDENTITY_REFUSED: SurfaceCapabilityStatement = {
  code: 'mobile-ua-identity-refused',
  fr: "La surface mobile a été refusée pour cette page : elle exige l'identité publiée de notre robot et une autre identité était configurée.",
  en: "One page's mobile surface was refused: it requires our published crawler identity and a different identity was configured.",
};

/**
 * The desktop baseline surface one page's rendered pass ran on: default
 * viewport, published crawler identity, a fresh context per page (render-diff
 * opens and closes its own), and no interaction beyond load.
 */
export function baselineDesktopSurface(input: {
  evidenceEpoch: number;
  pageIdentity: string;
  userAgent: string;
  readinessOutcome: SurfaceReadinessOutcome;
}): ScanSurface {
  return buildScanSurface({
    evidenceEpoch: input.evidenceEpoch,
    pageIdentity: input.pageIdentity,
    viewport: BASELINE_DESKTOP_VIEWPORT,
    deviceScaleFactor: 1,
    hasTouch: false,
    media: { colorScheme: 'light', reducedMotion: 'no-preference' },
    userAgent: input.userAgent,
    interactionState: 'baseline',
    storageIsolationGroup: 'fresh-context-per-page',
    readinessOutcome: input.readinessOutcome,
  });
}

/**
 * The consent-rejected surface of one page (section 9): the desktop
 * profile, the unchanged crawler identity, and the recorded interaction
 * state. Built before the click so the record exists whatever the click
 * does; its readiness outcome is finalized from what actually happened.
 */
export function consentSurface(input: {
  evidenceEpoch: number;
  pageIdentity: string;
  userAgent: string;
}): ScanSurface {
  return buildScanSurface({
    evidenceEpoch: input.evidenceEpoch,
    pageIdentity: input.pageIdentity,
    viewport: BASELINE_DESKTOP_VIEWPORT,
    deviceScaleFactor: 1,
    hasTouch: false,
    media: { colorScheme: 'light', reducedMotion: 'no-preference' },
    userAgent: input.userAgent,
    interactionState: 'consent-rejected',
    storageIsolationGroup: 'fresh-context-per-page',
    readinessOutcome: 'ready',
  });
}

/**
 * The local-state surface of one page: the desktop rendering with the
 * page's bounded disclosure toggles opened (section 9, safe local state).
 * One surface per page, whatever the number of toggles, under the stable
 * `local-state:disclosures` interaction label.
 */
export function localStateSurface(input: {
  evidenceEpoch: number;
  pageIdentity: string;
  userAgent: string;
}): ScanSurface {
  return buildScanSurface({
    evidenceEpoch: input.evidenceEpoch,
    pageIdentity: input.pageIdentity,
    viewport: BASELINE_DESKTOP_VIEWPORT,
    deviceScaleFactor: 1,
    hasTouch: false,
    media: { colorScheme: 'light', reducedMotion: 'no-preference' },
    userAgent: input.userAgent,
    interactionState: 'local-state:disclosures',
    storageIsolationGroup: 'same-page-post-baseline',
    readinessOutcome: 'ready',
  });
}

/**
 * The mobile surface for one page (plan 059 sections 5.5 and 9): the stable
 * mobile profile, the unchanged crawler identity, baseline interaction, and
 * the same fresh-context-per-page storage isolation as the desktop pass.
 *
 * `crawlerUserAgent` is the published identity and `userAgent` is what the
 * run would put on the wire; the two must be byte-for-byte equal or this
 * throws before any navigation, so a caller can never quietly impersonate a
 * phone browser to reach a UA-negotiated variant (rejected alternative,
 * section 22).
 */
export function mobileSurface(input: {
  evidenceEpoch: number;
  pageIdentity: string;
  userAgent: string;
  crawlerUserAgent: string;
  readinessOutcome: SurfaceReadinessOutcome;
}): ScanSurface {
  if (input.userAgent !== input.crawlerUserAgent) {
    throw new SurfaceIdentityError(
      'mobileSurface: the mobile surface must keep the published crawler user agent; refusing to impersonate a mobile browser.',
    );
  }
  return buildScanSurface({
    evidenceEpoch: input.evidenceEpoch,
    pageIdentity: input.pageIdentity,
    viewport: MOBILE_SURFACE_PROFILE.viewport,
    deviceScaleFactor: MOBILE_SURFACE_PROFILE.deviceScaleFactor,
    hasTouch: MOBILE_SURFACE_PROFILE.hasTouch,
    media: { ...MOBILE_SURFACE_PROFILE.media },
    userAgent: input.crawlerUserAgent,
    interactionState: 'baseline',
    storageIsolationGroup: 'fresh-context-per-page',
    readinessOutcome: input.readinessOutcome,
  });
}
