/**
 * Odysseus findings model, version 1.
 *
 * LOCKED CONTRACT. Do not modify without an explicit decision, because
 * every downstream layer reads this shape: dedupe, LLM input, PDF
 * template, monitoring diffs, and stored historical audits.
 *
 * If this shape must change, bump FINDINGS_SCHEMA_VERSION and write a
 * migration. Never change it silently.
 */

export const FINDINGS_SCHEMA_VERSION = 1 as const;

/** Which scanner produced the finding. Never inferred, always recorded. */
export type FindingSource = 'axe' | 'lighthouse' | 'custom' | 'renderdiff';

export type FindingCategory =
  | 'accessibility'
  | 'seo'
  | 'performance'
  | 'rendering';

/**
 * One unified severity scale across all scanners. See severity.ts for the
 * mapping rules. Scanner-native severities are recorded in rawEvidence so
 * the mapping stays auditable.
 */
export type Severity = 'critical' | 'serious' | 'moderate' | 'minor';

/** A single occurrence of a finding on a single page. */
export interface FindingElement {
  /** Page this occurrence was found on. */
  pageUrl: string;
  /** CSS selector as reported by the scanner, before normalization. */
  selector: string;
  /** Truncated outer HTML of the offending element. Cap at 500 chars. */
  snippet: string;
  /** Reference to a stored screenshot, if one was captured. */
  screenshotRef?: string;
}

export interface Finding {
  /** Stable ID within an audit. Referenced by the LLM layer, so it must
   *  survive the whole pipeline unchanged. */
  findingId: string;
  auditId: string;

  schemaVersion: typeof FINDINGS_SCHEMA_VERSION;

  source: FindingSource;
  /** Scanner rule identifier, verbatim. Examples: 'color-contrast'
   *  (axe), 'largest-contentful-paint' (lighthouse),
   *  'meta-description-missing' (custom), 'text-missing-from-raw-html'
   *  (renderdiff). Never invented, never rewritten. */
  ruleId: string;

  category: FindingCategory;
  severity: Severity;

  /** WCAG success criteria, dotted notation, e.g. ['1.4.3'].
   *  Populated for accessibility findings, empty otherwise. This is what
   *  makes the report cite EN 301 549 referenced criteria rather than
   *  opinions. */
  wcagCriteria: string[];

  /** Short human-readable title, taken from the scanner, not generated. */
  title: string;
  /** Scanner-provided description. The LLM rewrites this for the report
   *  but must not replace it here. */
  description: string;
  /** Scanner documentation URL, where available. */
  helpUrl?: string;

  /** Every page this finding appears on, after dedupe. */
  pageUrls: string[];
  /** Total occurrences across all pages. A site-wide issue appears once
   *  with a count, not 400 times. */
  occurrences: number;
  /** Sample occurrences. Cap stored elements at MAX_ELEMENTS_PER_FINDING
   *  to keep documents bounded on large sites. */
  elements: FindingElement[];

  /** Unmodified scanner output for this finding, including its native
   *  severity. Kept so any mapping or normalization decision can be
   *  re-derived and defended if a client's developer challenges it. */
  rawEvidence: Record<string, unknown>;

  /** Dedupe key: see normalize/dedupe.ts. Stored so historical runs can
   *  be compared for the monitoring tier. */
  dedupeKey: string;

  firstSeenAt: Date;
  lastSeenAt: Date;
}

export const MAX_ELEMENTS_PER_FINDING = 20;
export const MAX_SNIPPET_LENGTH = 500;

/**
 * The render diff is the single most sellable artifact the tool produces,
 * so it gets a typed shape of its own rather than living loose in
 * rawEvidence.
 */
export interface RenderDiffResult {
  pageUrl: string;
  /** Visible text character count in the raw, non-JavaScript fetch. */
  rawTextLength: number;
  /** Visible text character count after full render. */
  renderedTextLength: number;
  /** Percentage of rendered visible text absent from the raw HTML.
   *  0 means a crawler sees everything. 100 means it sees nothing. */
  missingPercent: number;
  rawScreenshotRef?: string;
  renderedScreenshotRef?: string;
  /** Console errors captured during render. Often explains the failure. */
  consoleErrors: string[];
  httpStatus: number;
}
