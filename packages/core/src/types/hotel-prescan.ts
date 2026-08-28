/**
 * Types for the hotel prescan's stored result (milestone 9c plan 004).
 *
 * These live in `core` rather than in `scanner` because three packages read
 * them and only one produces them: `store` persists a prescan, `interface`
 * orchestrates and reports on runs of them, and plan 006's scoring will read
 * them as its input. `scanner`'s own `PrescanResult` is the shape of one
 * measurement in flight; this is the shape of one that has been recorded.
 *
 * Deliberately not part of the findings model. A prescan produces no
 * findings, no severities, and no remediation copy: it measures a site
 * cheaply enough to decide whether approaching its owner is worthwhile, and
 * the paid audit is what turns measurements into findings. Keeping the two
 * vocabularies apart is what stops the prescan drifting back into the audit
 * pipeline it was separated from.
 */

export type HotelPrescanStatus = 'complete' | 'blocked-by-robots' | 'homepage-unreachable';

export type HotelPrescanPageRole = 'homepage' | 'booking' | 'content';

export type HotelPrescanRoleAbsenceReason =
  'no-candidate-link' | 'offsite-only' | 'duplicate-of-selected-page';

export interface HotelPrescanRoleAbsence {
  role: HotelPrescanPageRole;
  reason: HotelPrescanRoleAbsenceReason;
}

/** Axe output reduced to counts and rule ids. The full node lists belong to
 *  a paid audit's normalize pass; a prescan keeps only what a person needs to
 *  judge whether the site is worth a conversation. */
export interface HotelPrescanAxeFacts {
  violationCount: number;
  byImpact: { critical: number; serious: number; moderate: number; minor: number };
  ruleIds: string[];
  affectedElementCount: number;
}

/** Measured directly from the browser, never from Lighthouse. Every field is
 *  nullable because a metric that could not be observed must be
 *  distinguishable from one observed as zero - see page-metrics.ts, where a
 *  long-task observer reporting nothing on a fast page and a long-task
 *  observer that never attached look identical unless this distinction is
 *  preserved. */
export interface HotelPrescanMetrics {
  largestContentfulPaintMs: number | null;
  cumulativeLayoutShift: number | null;
  longTaskCount: number | null;
  mainThreadBlockingMs: number | null;
  requestCount: number;
  transferBytes: number;
  thirdPartyRequestCount: number;
  thirdPartyHosts: string[];
  sizeUnavailableCount: number;
  /** How long the page was observed for. CLS and long tasks accrue over
   *  time, so two prescans with different windows are not comparable and a
   *  later comparison must be able to see that. */
  observationWindowMs: number;
  failures: string[];
}

export interface HotelPrescanPage {
  role: HotelPrescanPageRole;
  url: string;
  httpStatus?: number;
  missingPercent?: number;
  rawTextLength?: number;
  renderedTextLength?: number;
  /** Relative to the prescan directory, never absolute. */
  rawScreenshotRef?: string;
  renderedScreenshotRef?: string;
  consoleErrorCount?: number;
  axe?: HotelPrescanAxeFacts;
  axeError?: string;
  metrics?: HotelPrescanMetrics;
  metricsError?: string;
  /** How this hotel's booking funnel is built, where it is visible on the
   *  page: an embedded widget, a payment script, a delegated engine. */
  bookingEvidenceKinds?: string[];
  error?: string;
  skippedByRobots?: boolean;
  durationMs: number;
}

/** One recorded prescan of one candidate. Immutable: see prescans.ts. */
export interface HotelPrescan {
  prescanId: string;
  candidateId: string;
  resolutionVersion: string;
  qualificationVersion: string;
  /** Bumped by hand when what a prescan measures changes, never edited in
   *  place, for the reason CURRENT_QUALIFICATION_VERSION gives: a later
   *  comparison must not silently mix two definitions of the same number. */
  prescanVersion: string;
  /** The job that produced it, so a prescan is always traceable to a run. */
  scanJobId: string;
  domain: string;
  startUrl: string;
  status: HotelPrescanStatus;
  pages: HotelPrescanPage[];
  absentRoles: HotelPrescanRoleAbsence[];
  /** Off-site booking destinations found on the homepage. Evidence that the
   *  funnel is delegated, which is a fact about the hotel's setup rather
   *  than a defect. */
  offsiteBookingLinks: string[];
  robotsTxtFound: boolean;
  effectiveDelayMs: number;
  /** Relative to the prescans root, so a stored prescan survives the
   *  artifacts root moving or being read from another machine. */
  artifactsDir: string;
  /** Self-reported by the browser that actually ran, matching the manifest
   *  rule that a recorded tool version is what ran, not what is installed. */
  browserVersion: string;
  startedAt: Date;
  durationMs: number;
  /** Optional only so stored v1 prescans remain readable. Every v2 scanner
   *  and job result supplies a strict evidence object. */
  evidence?: import('./hotel-prescan-evidence.js').HotelPrescanEvidence;
}
