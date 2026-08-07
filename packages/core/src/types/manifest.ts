/**
 * Audit manifest, written to both manifest.json on disk and the `audits`
 * MongoDB collection. This is what makes `normalize <dir>` work fully
 * offline: everything needed to re-run normalization lives in the
 * manifest plus the per-page scan.json files, no database required.
 *
 * Not a locked contract (unlike findings.ts/severity.ts/llm-output.ts),
 * but changes here still ripple into packages/scanner and packages/store,
 * so treat it as stable once milestones 5/6 start depending on it.
 */

import { FINDINGS_SCHEMA_VERSION } from './findings.js';

export type ManifestKind = 'audit' | 'render-diff';

export interface ToolVersions {
  odysseusVersion: string;
  findingsSchemaVersion: typeof FINDINGS_SCHEMA_VERSION;
  /** null when every page's axe pass failed, so there is no successful
   *  result to read testEngine.version from. */
  axeCoreVersion: string | null;
  /** null when every page's Lighthouse pass failed. */
  lighthouseVersion: string | null;
  playwrightVersion: string;
  chromiumVersion: string;
}

export interface AuditConfigSnapshot {
  maxPages: number;
  maxDepth: number;
  crawlDelayMs: number;
  pageTimeoutMs: number;
  lighthouseTimeoutMs: number;
  userAgent: string;
  /** Number of pages the scan phase processed at once. Each lane keeps
   *  crawlDelayMs pacing independently; this does not change politeness
   *  per request, only how many page-lanes run concurrently. */
  scanConcurrency: number;
}

/**
 * Deliberately duplicates scanner's CrawledPageStatus union by value, not
 * by import: packages/core must not depend on packages/scanner. Keep the
 * two in sync by hand.
 */
export type ManifestPageStatus = 'visited' | 'skipped-robots' | 'skipped-non-html' | 'error';

/**
 * Lighthouse's accessibility and best-practices categories are excluded
 * from finding emission this milestone (see CLAUDE.md), but their scores
 * are still worth keeping so the numbers aren't lost.
 */
export interface LighthouseExcludedCategoryScores {
  accessibility: number | null;
  bestPractices: number | null;
}

/** A single Lighthouse metric audit's score plus the raw measurement
 *  behind it. Score is a normalized ranking; numericValue/displayValue
 *  are the actual measurement a report needs to show ("your homepage
 *  takes 4.2 seconds"), per docs/normalization-rules.md section 4. */
export interface CoreWebVitalMeasurement {
  score: number | null;
  numericValue: number | null;
  displayValue: string | null;
}

/** LCP and CLS only, plus TBT as the lab-available proxy for
 *  responsiveness. INP is deliberately not included: Lighthouse in
 *  navigation mode (the only mode this scanner runs) never produces an
 *  INP audit at all, because INP requires an actual user interaction
 *  during the trace and the scanner only loads the page. Decided during
 *  Milestone 6 planning; do not add an inp field populated with null,
 *  and do not label tbt as INP. */
export interface CoreWebVitals {
  lcp: CoreWebVitalMeasurement;
  cls: CoreWebVitalMeasurement;
  tbt: CoreWebVitalMeasurement;
}

export interface ManifestPageEntry {
  url: string;
  /** Path relative to the audit directory, e.g. "pages/contact-d4e5f6".
   *  Absent for pages the crawler never scanned at all (status
   *  'skipped-robots' or crawl-phase 'error'), since nothing was written
   *  to disk for them. */
  pageDir?: string;
  depth: number;
  status: ManifestPageStatus;
  httpStatus?: number;
  /** Recorded for every page regardless of whether a render-diff finding
   *  was emitted, so a healthy site's numbers aren't lost. */
  renderDiffMissingPercent?: number;
  lighthouseExcludedCategoryScores?: LighthouseExcludedCategoryScores;
  /** Recorded for every page with a successful Lighthouse pass,
   *  regardless of score, so a page with good vitals isn't lost the way
   *  it is in findings.json (which only carries these numbers for pages
   *  that failed Lighthouse's emission threshold). Absent for audits
   *  captured before Milestone 6 and for pages whose Lighthouse pass
   *  failed entirely; report generation must render an explicit "not
   *  measured" state rather than assume this field exists. */
  coreWebVitals?: CoreWebVitals;
  /** Populated for status 'error': the crawl-phase failure (e.g. a
   *  navigation timeout) that meant this page was never scanned at all.
   *  Distinct from `errors` below, which covers per-scanner failures on a
   *  page that was otherwise successfully visited and scanned. */
  crawlError?: string;
  errors: {
    renderDiff?: string;
    axe?: string;
    lighthouse?: string;
  };
}

export interface AuditManifest {
  auditId: string;
  kind: ManifestKind;
  siteUrl: string;
  /** ISO 8601. manifest.json is disk JSON, so no native Date here. */
  startedAt: string;
  finishedAt: string;
  /** Stamped only by the `normalize` command when it re-runs
   *  normalization offline against stored scan.json files. */
  renormalizedAt?: string;
  tool: ToolVersions;
  config: AuditConfigSnapshot;
  crawl: {
    startUrl: string;
    visitedCount: number;
    maxPages: number;
    maxDepth: number;
    robotsTxtFound: boolean;
    effectiveDelayMs: number;
  };
  pages: ManifestPageEntry[];
}
