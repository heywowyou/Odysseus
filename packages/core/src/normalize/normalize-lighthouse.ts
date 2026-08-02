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
import { severityFromLighthouse } from './severity.js';
import {
  LIGHTHOUSE_EMISSION_SCORE_THRESHOLD,
  LIGHTHOUSE_EXCLUDED_AUDITS,
  MAX_LIGHTHOUSE_DETAILS_ITEMS,
} from './constants.js';
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
} as const;

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
      const severity = severityFromLighthouse(audit.score, auditRef.weight);

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
