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
  /** Lighthouse's own declaration that this audit supersedes older ones.
   *  Present on the "insight" audits, which ship alongside the legacy
   *  audits they replace rather than removing them. See
   *  SUPERSEDED_AUDIT_IDS below for why we read it. */
  replacesAudits?: string[];
}

export interface LighthouseResultInput {
  categories: Record<string, LighthouseCategoryInput>;
  audits: Record<string, LighthouseAuditInput>;
}

const SCANNED_CATEGORIES: Array<{ id: string; category: FindingCategory }> = [
  { id: 'performance', category: 'performance' },
  { id: 'seo', category: 'seo' },
];

/** B4 (2026-08-24): audits that report one defect about a whole class of
 *  files, not a defect at a place in a page. For these the DOM node is
 *  incidental - it is merely wherever one affected file happens to be
 *  rendered - so all of an audit's items collapse into a single site-wide
 *  finding whose evidence is the list of affected file URLs.
 *
 *  Without this, one image referenced from twenty pages became twenty
 *  findings, because the fine dedupe pass keys on the selector and the
 *  selector differs per page. Worse on sites whose slider generates its
 *  wrapper id at runtime (swiper-wrapper-3bd6608a838df14e): the same image
 *  on the same page produced a different key on every scan. A real
 *  haaitza.com audit had 102 of 305 findings in exactly this shape, a third
 *  of the annex, all restating one instruction about a handful of images.
 *
 *  Keying on the file URL instead was tried first and measured on all three
 *  reference audits. It made things worse, not better: 99 findings became
 *  127, 305 became 381, 650 became 871, because splitting one container
 *  selector into its several distinct images outweighed merging one image
 *  across pages. That is the right identity for a *defect* and the wrong
 *  granularity for a *report* - "serve your images in a modern format" is
 *  one instruction a client carries out once, and printing it sixty five
 *  times with a different filename each time is what made the annex read as
 *  padding. The file list is evidence for the one finding, not sixty five
 *  findings.
 *
 *  Every entry here was confirmed against real Lighthouse output to carry a
 *  populated item-level `url`, and to be an audit whose remediation is one
 *  action over a set of files. Do not add an audit whose items describe
 *  genuinely independent problems needing separate decisions; collapsing
 *  those would hide real findings, which is a worse failure than a long
 *  annex. */
export const RESOURCE_IDENTIFIED_LIGHTHOUSE_AUDITS: ReadonlySet<string> = new Set([
  'modern-image-formats',
  'uses-optimized-images',
  'uses-responsive-images',
  'offscreen-images',
  'unsized-images',
  'efficient-animated-content',
  'uses-text-compression',
  'render-blocking-resources',
  'unused-css-rules',
  'unused-javascript',
  'legacy-javascript',
  'duplicated-javascript',
  'uses-long-cache-ttl',
  // D13: the successor to modern-image-formats / uses-optimized-images /
  // efficient-animated-content / uses-responsive-images, all four of which
  // it suppresses via replacesAudits. Its items carry a url and no node,
  // which is why it needs the url-only path added for D12. Confirmed
  // against real scan output before allowlisting, per the rule above.
  'image-delivery-insight',
  'render-blocking-insight',
  'cache-insight',
  'duplicated-javascript-insight',
  'legacy-javascript-insight',
  'font-display-insight',
]);

/** The resource URL an item is about, when this audit is resource-identified
 *  and the item actually carries one. Returns undefined otherwise, so the
 *  caller falls back to selector identity rather than collapsing on a
 *  missing value (every item with no url would otherwise share the identity
 *  '' and merge into a single finding). */
function resourceIdentityForItem(auditId: string, item: Record<string, unknown>): string | undefined {
  if (!RESOURCE_IDENTIFIED_LIGHTHOUSE_AUDITS.has(auditId)) return undefined;
  const url = item['url'];
  return typeof url === 'string' && url.length > 0 ? url : undefined;
}

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

/** The exact gate the candidate loop applies, extracted so the supersession
 *  set below cannot drift from it. An audit that would not itself produce a
 *  finding must not suppress anything. */
function auditEmitsFinding(audit: LighthouseAuditInput, auditId: string): boolean {
  if (SKIPPED_DISPLAY_MODES.has(audit.scoreDisplayMode)) return false;
  if (EXCLUDED_AUDITS.has(auditId)) return false;
  return audit.score !== null && audit.score < LIGHTHOUSE_EMISSION_SCORE_THRESHOLD;
}

/** Every distinct file an audit's items name, capped the same way the
 *  candidate paths cap theirs. Ignores whether the audit is allowlisted: the
 *  absorb path needs a replaced audit's files even when only its successor
 *  is allowlisted. */
function resourceUrlsForAudit(auditId: string, audit: LighthouseAuditInput): string[] {
  const rawItems = audit.details?.items;
  if (!Array.isArray(rawItems)) return [];
  const urls = (rawItems as Array<Record<string, unknown>>)
    .map((item) => item['url'])
    .filter((url): url is string => typeof url === 'string' && url.length > 0);
  return [...new Set(urls)].slice(0, MAX_LIGHTHOUSE_DETAILS_ITEMS);
}

/** Whether an audit carries detail a reader could act on: at least one item
 *  naming a DOM node or a file. Insights that report through a nested table,
 *  a checklist, or a network tree have neither at item level, so they render
 *  as a row with an empty selector column and no file list.
 *
 *  Used to decide whether a successor may suppress what it replaces. On the
 *  review site cls-culprits-insight, document-latency-insight,
 *  lcp-discovery-insight and network-dependency-tree-insight all emit but
 *  carry no actionable item, while the legacy audits they replace carry real
 *  ones - layout-shifts had 15 items and uses-text-compression 8 files. A
 *  successor that renders as a bare row cannot stand in for those. */
function auditHasActionableDetail(audit: LighthouseAuditInput): boolean {
  const rawItems = audit.details?.items;
  if (!Array.isArray(rawItems)) return false;
  return (rawItems as Array<Record<string, unknown>>).some((item) => {
    if (findNodeValueInItem(item) !== undefined) return true;
    const url = item['url'];
    return typeof url === 'string' && url.length > 0;
  });
}

/** D13 (2026-08-25, Lagnonu review): Lighthouse ships its newer "insight"
 *  audits *alongside* the legacy audits they supersede, and each insight
 *  names them in `replacesAudits`. Emitting both put the same defect in the
 *  report twice under two names - image-delivery-insight next to
 *  modern-image-formats and uses-responsive-images, render-blocking-insight
 *  next to render-blocking-resources, cache-insight next to
 *  uses-long-cache-ttl - all confirmed against real scan output.
 *
 *  Suppression is deliberately conditional on the insight *itself emitting*,
 *  because the two sides genuinely disagree and a blanket rule would lose
 *  real findings: on the review site document-latency-insight scored 1 while
 *  the uses-text-compression it replaces scored 0.5 with eight real files,
 *  and font-display-insight scored 0 while font-display passed. Under this
 *  rule a legacy audit is dropped only when its successor is already
 *  reporting the same problem, so nothing can ever go unreported.
 *
 *  Resolved across the whole audit rather than per page: a successor that
 *  emits on some pages and not others would otherwise leave the legacy audit
 *  standing as its own finding, and the client would read the same image
 *  problem under four rule names. Measured on haaitza.com, where
 *  image-delivery-insight does not emit on every page: per-page supersession
 *  left modern-image-formats, uses-responsive-images and uses-optimized-images
 *  all still present alongside it. Maps each replaced
 *  audit to the successor absorbing it, because the replaced audit's own file
 *  list still has to be carried over: measured on the reference audits, the
 *  successor's file set is not a superset of what it replaces. Suppressing
 *  outright silently dropped 14 image URLs on sas-fernande.fr and 6 on
 *  lagnonu.fr, which is losing evidence, not removing a duplicate. */
export function computeSupersededAudits(
  reports: readonly LighthouseResultInput[],
): ReadonlyMap<string, string> {
  const superseded = new Map<string, string>();
  for (const lhr of reports) {
    for (const [auditId, audit] of Object.entries(lhr.audits)) {
      if (!audit.replacesAudits?.length) continue;
      if (!auditEmitsFinding(audit, auditId)) continue;
    // A successor with no actionable item of its own would replace a file
    // list with a blank row. Measured, not assumed: see
    // auditHasActionableDetail above for the four insights this excludes.
      if (!auditHasActionableDetail(audit)) continue;
      for (const replaced of audit.replacesAudits) superseded.set(replaced, auditId);
    }
  }
  return superseded;
}

export function extractLighthouseCandidates(
  lhr: LighthouseResultInput,
  pageUrl: string,
  /** Audit-wide supersession map, from computeSupersededAudits over every
   *  page's report. Defaults to this page alone, which is correct for a
   *  single-page caller and for tests, but collapses less across a real
   *  multi-page audit. */
  supersededAudits?: ReadonlyMap<string, string>,
): FindingCandidate[] {
  const candidates: FindingCandidate[] = [];
  const superseded = supersededAudits ?? computeSupersededAudits([lhr]);

  for (const { id: categoryId, category } of SCANNED_CATEGORIES) {
    const lhCategory = lhr.categories[categoryId];
    if (!lhCategory) continue;

    for (const auditRef of lhCategory.auditRefs) {
      const audit = lhr.audits[auditRef.id];
      if (!audit) continue;
      if (!auditEmitsFinding(audit, auditRef.id)) continue;

      // D13: this audit's successor is already reporting the same defect, so
      // it must not become a second finding. Its file list is still carried
      // across under the successor's rule id, so the client ends up with one
      // finding naming every affected file rather than two findings each
      // naming some of them.
      const successorId = superseded.get(auditRef.id);
      if (successorId !== undefined) {
        const successor = lhr.audits[successorId];
        const absorbedUrls = successor === undefined ? [] : resourceUrlsForAudit(auditRef.id, audit);
        if (successor !== undefined && absorbedUrls.length > 0) {
          candidates.push({
            source: 'lighthouse',
            ruleId: successorId,
            category,
            severity: capSeverityByCoreWebVitalRating(
              severityFromLighthouse(successor.score, auditRef.weight),
              successorId,
              successor.numericValue,
            ),
            wcagCriteria: [],
            title: successor.title,
            description: successor.description,
            pageUrl,
            element: null,
            dedupeIdentity: '',
            rawEvidenceForPage: {
              score: successor.score,
              scoreDisplayMode: successor.scoreDisplayMode,
              numericValue: successor.numericValue ?? null,
              displayValue: successor.displayValue ?? null,
              title: successor.title,
              resourceUrls: absorbedUrls,
              absorbedFrom: auditRef.id,
            },
          });
        }
        continue;
      }

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

      const isResourceAudit = RESOURCE_IDENTIFIED_LIGHTHOUSE_AUDITS.has(auditRef.id);

      if (nodeItems.length > 0) {
        for (const { item, node } of nodeItems) {
          const resourceUrl = resourceIdentityForItem(auditRef.id, item);
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
            // Empty identity, so every item of this audit lands in one group
            // for the whole site (ruleId is already part of the key). The
            // file URLs travel as evidence below, not as separate findings.
            ...(isResourceAudit ? { dedupeIdentity: '' } : {}),
            rawEvidenceForPage: {
              score: audit.score,
              scoreDisplayMode: audit.scoreDisplayMode,
              numericValue: audit.numericValue ?? null,
              displayValue: audit.displayValue ?? null,
              title: audit.title,
              node,
              // The affected file. mergeGroup lifts these into
              // rawEvidence.resourceUrls so the report can list what to fix,
              // which is the whole point of collapsing these into one
              // finding rather than dropping the detail.
              ...(resourceUrl === undefined ? {} : { resourceUrl }),
            },
          });
        }
        continue;
      }

      // 2026-08-25 Lagnonu review, D12. Trade-off 30's resource collapse
      // only ever fired for audits whose items carry a `node`, because the
      // branch above is the only one that reads resourceIdentityForItem.
      // Measured against a real scan: of the thirteen allowlisted audits,
      // only modern-image-formats carries node items. The six that fired on
      // this site (uses-text-compression, unused-css-rules,
      // render-blocking-resources, legacy-javascript, unused-javascript,
      // uses-long-cache-ttl) carry a url and no node, so they fell through
      // here and rendered as annex rows with an empty selector column and
      // no file list - a finding reported on 65 pages with nothing on it to
      // act on.
      //
      // One candidate per page carrying the whole page's file list, NOT one
      // candidate per file: `occurrences` is `group.length` (normalize.ts),
      // so a candidate per file would multiply a client-facing number by the
      // file count. Measured on the three reference audits before settling
      // on this shape - per-file candidates moved total occurrences 3671 to
      // 6772 on Lagnonu alone, breaking the invariant trade-off 30 relies on
      // to prove a regrouping neither dropped nor invented anything.
      if (isResourceAudit) {
        const resourceUrls = [
          ...new Set(
            items
              .map((item) => resourceIdentityForItem(auditRef.id, item))
              .filter((url): url is string => url !== undefined),
          ),
        ].slice(0, MAX_LIGHTHOUSE_DETAILS_ITEMS);

        if (resourceUrls.length > 0) {
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
            dedupeIdentity: '',
            rawEvidenceForPage: {
              score: audit.score,
              scoreDisplayMode: audit.scoreDisplayMode,
              numericValue: audit.numericValue ?? null,
              displayValue: audit.displayValue ?? null,
              title: audit.title,
              resourceUrls,
            },
          });
          continue;
        }
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
