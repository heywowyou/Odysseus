/**
 * Lighthouse candidate extraction.
 *
 * Same reasoning as normalize-axe.ts for why this declares its own narrow
 * structural subset of Lighthouse's real LHR shape rather than depending
 * on the `lighthouse` package for types.
 *
 * Only the 'performance' and 'seo' categories are scanned for findings.
 * 'accessibility' and 'best-practices' are deliberately excluded this
 * milestone; see constants.ts (LIGHTHOUSE_EXCLUDED_CATEGORIES) for why.
 * Their scores are still collected via
 * extractLighthouseExcludedCategoryScores, for the audit manifest.
 */

import { MAX_ELEMENTS_PER_FINDING } from '../types/findings.js';
import type { FindingCategory } from '../types/findings.js';
import type {
  CoreWebVitalMeasurement,
  CoreWebVitals,
  LighthouseExcludedCategoryScores,
} from '../types/manifest.js';
import { capAt, severityFromLighthouse } from './severity.js';
import {
  LIGHTHOUSE_EMISSION_SCORE_THRESHOLD,
  LIGHTHOUSE_EXCLUDED_AUDITS,
  MAX_LIGHTHOUSE_DETAILS_ITEMS,
} from './constants.js';
import { CORE_WEB_VITAL_THRESHOLDS, rateCoreWebVital } from './cwv-thresholds.js';
import type { FindingCandidate } from './candidate.js';

export interface LighthouseAuditRefInput {
  id: string;
  weight: number;
}

export interface LighthouseCategoryInput {
  score: number | null;
  auditRefs: LighthouseAuditRefInput[];
}

export interface LighthouseAuditInput {
  score: number | null;
  scoreDisplayMode: string;
  title: string;
  description: string;
  /** The raw measurement behind `score` (e.g. milliseconds for LCP). Not
   *  every audit has one; score is a normalized ranking, this is the
   *  actual measurement the report needs to show alongside it. */
  numericValue?: number;
  /** Human-readable rendering of numericValue (e.g. "3.2 s"). */
  displayValue?: string;
  /** items is typed loosely (not Array<Record<string, unknown>>) because
   *  Lighthouse's real Details union includes variants (e.g. Checklist)
   *  whose "items" is a Record keyed by id, not an array. Narrowing this
   *  further would make the real Result type structurally unassignable
   *  here. Checked with Array.isArray at the one call site that reads it. */
  details?: {
    type?: string;
    items?: unknown;
  };
}

export interface LighthouseResultInput {
  categories: Record<string, LighthouseCategoryInput>;
  audits: Record<string, LighthouseAuditInput>;
}

const SCANNED_CATEGORIES: Array<{ id: string; category: FindingCategory }> = [
  { id: 'performance', category: 'performance' },
  { id: 'seo', category: 'seo' },
];

const SKIPPED_DISPLAY_MODES = new Set(['informative', 'notApplicable', 'manual', 'error']);

const EXCLUDED_AUDITS = new Set<string>(LIGHTHOUSE_EXCLUDED_AUDITS);

interface LighthouseNodeValue {
  type: 'node';
  selector?: string;
  snippet?: string;
}

function isNodeValue(value: unknown): value is LighthouseNodeValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'node'
  );
}

/** An audit's item row can carry a node-typed value under any column
 *  name (e.g. Lighthouse's tap-targets audit names it "tapTarget", not
 *  "node"), so every value in the row is checked rather than a fixed
 *  key. */
function findNodeValueInItem(item: Record<string, unknown>): LighthouseNodeValue | undefined {
  for (const value of Object.values(item)) {
    if (isNodeValue(value)) return value;
  }
  return undefined;
}

export function extractLighthouseExcludedCategoryScores(
  lhr: LighthouseResultInput,
): LighthouseExcludedCategoryScores {
  return {
    accessibility: lhr.categories['accessibility']?.score ?? null,
    bestPractices: lhr.categories['best-practices']?.score ?? null,
  };
}

const CORE_WEB_VITAL_AUDIT_IDS = {
  lcp: 'largest-contentful-paint',
  cls: 'cumulative-layout-shift',
  tbt: 'total-blocking-time',
  fcp: 'first-contentful-paint',
  speedIndex: 'speed-index',
} as const;

/** item 9: the reverse of CORE_WEB_VITAL_AUDIT_IDS, so a Lighthouse audit
 *  id encountered in extractLighthouseCandidates can be matched back to
 *  its raw-value threshold row in CORE_WEB_VITAL_THRESHOLDS. */
const AUDIT_ID_TO_CWV_KEY = new Map<string, keyof typeof CORE_WEB_VITAL_AUDIT_IDS>(
  Object.entries(CORE_WEB_VITAL_AUDIT_IDS).map(([key, auditId]) => [auditId, key as keyof typeof CORE_WEB_VITAL_AUDIT_IDS]),
);

/** item 9: severityFromLighthouse (locked severity.ts) grades a finding
 *  from Lighthouse's own nonlinear 0-1 score, which the report's Core Web
 *  Vitals table never consults - that table independently rates the same
 *  metric's raw measurement against CORE_WEB_VITAL_THRESHOLDS' fixed ms
 *  values into a bon/à améliorer/insuffisant status. The two disagreeing
 *  is not a hypothetical: a real report showed TBT 560ms graded "à
 *  améliorer" by the table while the underlying finding carried
 *  "Critique", the highest severity tier in the document.
 *
 *  This does not replace severityFromLighthouse's score-based severity
 *  (a locked, general-purpose mapping used for every Lighthouse audit,
 *  not just the five Core Web Vitals) - it caps the result for the five
 *  audits that have a raw-value threshold row, so a metric this report
 *  will separately display as "good" or "needs improvement" can never
 *  simultaneously back a "Critique" finding. Only 'critical' is capped
 *  (down to 'serious'); 'serious'/'moderate'/'minor' pass through
 *  unchanged, since the doc's complaint was specifically about the
 *  contradiction with the highest tier. */
function capSeverityByCoreWebVitalRating(
  severity: ReturnType<typeof severityFromLighthouse>,
  auditId: string,
  numericValue: number | undefined,
): ReturnType<typeof severityFromLighthouse> {
  if (numericValue === undefined) return severity;
  const key = AUDIT_ID_TO_CWV_KEY.get(auditId);
  if (!key) return severity;
  const threshold = CORE_WEB_VITAL_THRESHOLDS.find((t) => t.key === key);
  if (!threshold) return severity;

  const rating = rateCoreWebVital(numericValue, threshold.good, threshold.needsImprovement);
  if (rating === 'poor') return severity;
  return capAt(severity, 'serious');
}

function extractCoreWebVitalMeasurement(
  lhr: LighthouseResultInput,
  auditId: string,
): CoreWebVitalMeasurement {
  const audit = lhr.audits[auditId];
  if (!audit) return { score: null, numericValue: null, displayValue: null };
  return {
    score: audit.score,
    numericValue: audit.numericValue ?? null,
    displayValue: audit.displayValue ?? null,
  };
}

/** Recorded unconditionally, unlike extractLighthouseCandidates: this is
 *  about capturing the measurement, not deciding whether it is a defect,
 *  so neither LIGHTHOUSE_EMISSION_SCORE_THRESHOLD nor
 *  SKIPPED_DISPLAY_MODES applies here. INP is deliberately not read:
 *  Lighthouse in navigation mode never emits an INP audit, since INP
 *  requires an actual user interaction during the trace. TBT is recorded
 *  instead, as the lab-available proxy for responsiveness. */
export function extractCoreWebVitals(lhr: LighthouseResultInput): CoreWebVitals {
  return {
    lcp: extractCoreWebVitalMeasurement(lhr, CORE_WEB_VITAL_AUDIT_IDS.lcp),
    cls: extractCoreWebVitalMeasurement(lhr, CORE_WEB_VITAL_AUDIT_IDS.cls),
    tbt: extractCoreWebVitalMeasurement(lhr, CORE_WEB_VITAL_AUDIT_IDS.tbt),
    fcp: extractCoreWebVitalMeasurement(lhr, CORE_WEB_VITAL_AUDIT_IDS.fcp),
    speedIndex: extractCoreWebVitalMeasurement(lhr, CORE_WEB_VITAL_AUDIT_IDS.speedIndex),
  };
}

export function extractLighthouseCandidates(
  lhr: LighthouseResultInput,
  pageUrl: string,
): FindingCandidate[] {
  const candidates: FindingCandidate[] = [];

  for (const { id: categoryId, category } of SCANNED_CATEGORIES) {
    const lhCategory = lhr.categories[categoryId];
    if (!lhCategory) continue;

    for (const auditRef of lhCategory.auditRefs) {
      const audit = lhr.audits[auditRef.id];
      if (!audit) continue;
      if (SKIPPED_DISPLAY_MODES.has(audit.scoreDisplayMode)) continue;
      if (EXCLUDED_AUDITS.has(auditRef.id)) continue;
      if (audit.score === null || audit.score >= LIGHTHOUSE_EMISSION_SCORE_THRESHOLD) continue;

      // The score<0.9 gate above means severityFromLighthouse's own
      // score<0.9?'serious':'minor' branch can never return 'minor' via
      // the score path here (that arm only fires for score>=0.9, which
      // never reaches this point). 'minor' is still reachable through
      // severityFromLighthouse's separate weight===0 early return, for
      // diagnostic-only audits. Both are intentional; do not "fix" this
      // as dead code.
      const severity = capSeverityByCoreWebVitalRating(
        severityFromLighthouse(audit.score, auditRef.weight),
        auditRef.id,
        audit.numericValue,
      );

      const rawItems = audit.details?.items;
      const items: Array<Record<string, unknown>> = Array.isArray(rawItems) ? rawItems : [];
      const nodeItems = items
        .map((item) => ({ item, node: findNodeValueInItem(item) }))
        .filter((entry): entry is { item: Record<string, unknown>; node: LighthouseNodeValue } =>
          entry.node !== undefined,
        )
        .slice(0, MAX_ELEMENTS_PER_FINDING);

      if (nodeItems.length > 0) {
        for (const { node } of nodeItems) {
          candidates.push({
            source: 'lighthouse',
            ruleId: auditRef.id,
            category,
            severity,
            wcagCriteria: [],
            title: audit.title,
            description: audit.description,
            pageUrl,
            element: {
              pageUrl,
              selector: node.selector ?? '',
              snippet: node.snippet ?? '',
            },
            rawEvidenceForPage: {
              score: audit.score,
              scoreDisplayMode: audit.scoreDisplayMode,
              numericValue: audit.numericValue ?? null,
              displayValue: audit.displayValue ?? null,
              title: audit.title,
              node,
            },
          });
        }
        continue;
      }

      const truncatedItems = items.slice(0, MAX_LIGHTHOUSE_DETAILS_ITEMS);
      candidates.push({
        source: 'lighthouse',
        ruleId: auditRef.id,
        category,
        severity,
        wcagCriteria: [],
        title: audit.title,
        description: audit.description,
        pageUrl,
        element: null,
        rawEvidenceForPage: {
          score: audit.score,
          scoreDisplayMode: audit.scoreDisplayMode,
          numericValue: audit.numericValue ?? null,
          displayValue: audit.displayValue ?? null,
          title: audit.title,
          details: {
            type: audit.details?.type ?? null,
            items: truncatedItems,
            truncated: items.length > MAX_LIGHTHOUSE_DETAILS_ITEMS,
            totalItems: items.length,
          },
        },
      });
    }
  }

  return candidates;
}
