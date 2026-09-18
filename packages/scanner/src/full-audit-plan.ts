/**
 * Staged deterministic full-audit planner (plan 021,
 * `docs/decisions/trade-offs.md` entry 64). Two decision times, because a
 * rendered-cost outlier cannot be chosen before rendered analysis has
 * produced the cost facts:
 *
 * 1. `buildContentAuditPlan` runs before any rendered work. It classifies
 *    every page's role from its `PageAuditProfile` signals and schedules
 *    render diff, axe, and the extended pass on every one of them,
 *    unconditionally in v1.
 * 2. `finalizeLighthousePlan` runs once rendered-cost profiles exist. It
 *    adds Lighthouse to the mandatory pages plus two representatives per
 *    repeated non-listing template family and language.
 *
 * All classification thresholds, family grouping, representative
 * selection, and tie-breaking live in this module so there is exactly one
 * place that decides "why did this page get fewer checks", auditable and
 * testable without a browser. `page-audit-profile.ts` only supplies the
 * raw signals and the template-family hash; it makes no scheduling
 * decision itself.
 */

import type { AuditPageRole, AuditPass } from '@odysseus/core';
import type { PageAuditProfile, PageRoleSignalKind } from './page-audit-profile.js';

export type { AuditPageRole, AuditPass } from '@odysseus/core';

export const FULL_AUDIT_PLANNER_VERSION = 'v1';

export interface RenderedCostProfile {
  url: string;
  domNodeCount: number;
  imageCount: number;
  resourceCount: number;
  knownTransferBytes: number;
  unknownTransferSizeCount: number;
}

export interface PageAuditDecision {
  url: string;
  role: AuditPageRole;
  confidence: 'high' | 'fallback';
  templateFamilyId?: string;
  language?: string;
  plannedPasses: readonly AuditPass[];
  reasonCodes: readonly string[];
}

/** Carry-forward markers, not role explanations: recorded on every stage-1
 *  decision's `reasonCodes` regardless of role, so stage 2 can tell a
 *  homepage or operator seed apart from an ordinary page using only the
 *  `FullAuditPlan` it receives, with no need to pass the original
 *  profiles through a second parameter. */
const HOMEPAGE_MARKER = 'homepage-url-present';
const OPERATOR_SEED_MARKER = 'operator-seed-present';

export interface FullAuditPlan {
  plannerVersion: typeof FULL_AUDIT_PLANNER_VERSION;
  decisions: readonly PageAuditDecision[];
}

const LISTING_SIGNAL_KINDS: readonly PageRoleSignalKind[] = [
  'pagination-relation',
  'numbered-pagination-control',
  'listing-structural-class',
  'listing-json-ld-type',
  'repeated-teaser-links',
];

/** At least two independent signal kinds, never raw text or a single
 *  weak signal, per plan 021 Step 3's classification requirements. */
const MIN_LISTING_SIGNAL_KINDS = 2;

interface RoleClassification {
  role: AuditPageRole;
  confidence: 'high' | 'fallback';
  reasonCodes: string[];
}

/** Exported for reuse by the crawl-frontier continuation guard (plan 021
 *  Step 6), which needs to know whether a page independently qualifies as
 *  a listing before treating a repeated outgoing query key on it as
 *  pagination evidence. Reads the same `LISTING_SIGNAL_KINDS` and
 *  `MIN_LISTING_SIGNAL_KINDS` that `classifyRole` uses below, so the
 *  "two independent signal kinds" threshold stays governed by exactly one
 *  constant rather than being redefined for this second caller. */
export function isConfirmedListing(profile: PageAuditProfile): boolean {
  const kinds = new Set(profile.roleSignals.map((s) => s.kind));
  return LISTING_SIGNAL_KINDS.filter((k) => kinds.has(k)).length >= MIN_LISTING_SIGNAL_KINDS;
}

function classifyRole(profile: PageAuditProfile): RoleClassification {
  const kinds = new Set(profile.roleSignals.map((s) => s.kind));

  // A form/booking signal promotes to transactional unconditionally: it is
  // the strongest, least ambiguous signal available and this repository
  // would rather over-schedule a page that turned out not to transact
  // than under-schedule one that does. A link-out to a third-party
  // booking engine (issue #86) carries the same intent and the same
  // reasoning, since a hotel handing booking off to a PMS has no
  // same-document form to detect at all.
  //
  // Issue #89: the reason code names the mechanism that actually fired.
  // Collapsing both kinds under 'transactional-form-detected' recorded a
  // form as the provenance for a decision no form was involved in, on
  // every page of every site whose booking is a link-out - which is the
  // population the link-out signal exists for.
  if (kinds.has('transactional-form') || kinds.has('external-transactional-link')) {
    const reasonCodes = [
      ...(kinds.has('transactional-form') ? ['transactional-form-detected'] : []),
      ...(kinds.has('external-transactional-link') ? ['transactional-link-out-detected'] : []),
    ];
    return {
      role: 'transactional',
      confidence: 'high',
      reasonCodes,
    };
  }

  const listingKindCount = LISTING_SIGNAL_KINDS.filter((k) => kinds.has(k)).length;
  const isListing = listingKindCount >= MIN_LISTING_SIGNAL_KINDS;
  const isContent = kinds.has('content-json-ld-type');

  if (isListing && isContent) {
    // Genuine conflict: strong listing evidence and a strong content
    // type on the same page. Never pick a side by guessing; fuller
    // coverage is the only safe default.
    return {
      role: 'unknown',
      confidence: 'fallback',
      reasonCodes: ['conflicting-listing-and-content-signals'],
    };
  }
  if (isListing) {
    return {
      role: 'listing',
      confidence: 'high',
      reasonCodes: [
        `listing-signals:${LISTING_SIGNAL_KINDS.filter((k) => kinds.has(k)).join(',')}`,
      ],
    };
  }
  if (isContent) {
    return { role: 'content', confidence: 'high', reasonCodes: ['content-json-ld'] };
  }
  if (listingKindCount === 1) {
    // A single listing-ish signal (e.g. one pagination control, or a URL
    // path resembling a category) is exactly the weak evidence plan 021
    // says cannot reduce work: it never promotes to `listing` alone.
    return {
      role: 'unknown',
      confidence: 'fallback',
      reasonCodes: ['insufficient-listing-signals'],
    };
  }
  if (kinds.has('noindex-robots') || kinds.has('canonical-elsewhere')) {
    return { role: 'utility', confidence: 'fallback', reasonCodes: ['utility-signal-only'] };
  }
  return { role: 'unknown', confidence: 'fallback', reasonCodes: ['no-role-signals'] };
}

/** Stage 1: every eligible HTML page receives rendered, axe, and extended. */
export function buildContentAuditPlan(profiles: readonly PageAuditProfile[]): FullAuditPlan {
  const decisions: PageAuditDecision[] = profiles.map((profile) => {
    const classification = classifyRole(profile);
    const kinds = new Set(profile.roleSignals.map((s) => s.kind));
    const carryForwardMarkers = [
      ...(kinds.has('homepage-url') ? [HOMEPAGE_MARKER] : []),
      ...(kinds.has('operator-seed') ? [OPERATOR_SEED_MARKER] : []),
    ];
    return {
      url: profile.url,
      role: classification.role,
      confidence: classification.confidence,
      ...(profile.templateFamilyId !== undefined
        ? { templateFamilyId: profile.templateFamilyId }
        : {}),
      ...(profile.language !== undefined ? { language: profile.language } : {}),
      plannedPasses: ['rendered', 'axe', 'extended'],
      reasonCodes: [...classification.reasonCodes, ...carryForwardMarkers],
    };
  });

  return {
    plannerVersion: FULL_AUDIT_PLANNER_VERSION,
    decisions: sortByUrl(decisions),
  };
}

function sortByUrl<T extends { url: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.url.localeCompare(b.url));
}

/** Plan 059 section 12: which run-count class a Lighthouse-selected page
 *  belongs to. The homepage, transactional pages and operator seeds are owed
 *  three runs; every other representative a primary run. */
export function performancePageClassOf(
  decision: PageAuditDecision,
): 'homepage' | 'transactional' | 'operator-seed' | 'selected' {
  if (decision.reasonCodes.includes(HOMEPAGE_MARKER)) return 'homepage';
  if (decision.role === 'transactional') return 'transactional';
  if (decision.reasonCodes.includes(OPERATOR_SEED_MARKER)) return 'operator-seed';
  return 'selected';
}

function isMandatoryRegardlessOfFamily(
  decision: PageAuditDecision,
): { mandatory: true; reasonCode: string } | { mandatory: false } {
  if (decision.reasonCodes.includes(HOMEPAGE_MARKER)) {
    return { mandatory: true, reasonCode: 'homepage' };
  }
  if (decision.role === 'transactional') {
    return { mandatory: true, reasonCode: 'transactional-role' };
  }
  if (decision.reasonCodes.includes(OPERATOR_SEED_MARKER)) {
    return { mandatory: true, reasonCode: 'operator-seed' };
  }
  if (decision.confidence === 'fallback' || decision.role === 'unknown') {
    return { mandatory: true, reasonCode: 'unknown-or-fallback-role' };
  }
  return { mandatory: false };
}

/** `(resourceCount, imageCount, domNodeCount, knownTransferBytes,
 *  unknownTransferSizeCount)` descending, then URL ascending. Resource
 *  count deliberately precedes known bytes so an unreported transfer size
 *  is never read as evidence a resource was free. Changing this tuple
 *  requires a planner-version bump (plan 021 binding decision 8). */
function compareCostDescending(a: RenderedCostProfile, b: RenderedCostProfile): number {
  return (
    b.resourceCount - a.resourceCount ||
    b.imageCount - a.imageCount ||
    b.domNodeCount - a.domNodeCount ||
    b.knownTransferBytes - a.knownTransferBytes ||
    b.unknownTransferSizeCount - a.unknownTransferSizeCount ||
    a.url.localeCompare(b.url)
  );
}

function familyKey(decision: PageAuditDecision): string {
  // A page with no template family (`templateFamilyId` absent) is always
  // its own singleton family, never grouped with any other page that
  // also lacks one: absence of structural evidence must never become a
  // shared default bucket. Language is part of the key: two languages
  // sharing one template are still two families for representative
  // selection, per binding decision 7.
  const family = decision.templateFamilyId ?? `unique:${decision.url}`;
  return `${family}::${decision.language ?? ''}`;
}

/** Stage 2: add Lighthouse selections after rendered cost facts exist. */
export function finalizeLighthousePlan(
  contentPlan: FullAuditPlan,
  renderedCosts: ReadonlyMap<string, RenderedCostProfile>,
): FullAuditPlan {
  const selections = new Map<string, Set<string>>(); // url -> reasonCodes

  const addSelection = (url: string, reasonCode: string): void => {
    const existing = selections.get(url) ?? new Set<string>();
    existing.add(reasonCode);
    selections.set(url, existing);
  };

  for (const decision of contentPlan.decisions) {
    const mandatory = isMandatoryRegardlessOfFamily(decision);
    if (mandatory.mandatory) addSelection(decision.url, mandatory.reasonCode);
  }

  const groups = new Map<string, PageAuditDecision[]>();
  for (const decision of contentPlan.decisions) {
    const key = familyKey(decision);
    const members = groups.get(key) ?? [];
    members.push(decision);
    groups.set(key, members);
  }

  const sortedFamilyKeys = [...groups.keys()].sort();
  for (const key of sortedFamilyKeys) {
    const members = sortByUrl(groups.get(key)!);

    if (members.length === 1) {
      addSelection(members[0]!.url, 'unique-template-family');
      continue;
    }

    const isRepeatedHighConfidenceListing = members.every(
      (m) => m.role === 'listing' && m.confidence === 'high',
    );
    if (isRepeatedHighConfidenceListing) {
      // Exempt: content checks already cover every member. A member that
      // is separately mandatory (transactional, seed, homepage, unknown)
      // was already selected above and keeps that reason code.
      continue;
    }

    const stable = members[0]!; // members already URL-ascending
    addSelection(stable.url, 'family-representative-stable');

    const withCost = members
      .map((m) => ({ decision: m, cost: renderedCosts.get(m.url) }))
      .filter(
        (entry): entry is { decision: PageAuditDecision; cost: RenderedCostProfile } =>
          entry.cost !== undefined,
      );
    if (withCost.length > 0) {
      const outlier = [...withCost].sort((a, b) => compareCostDescending(a.cost, b.cost))[0]!;
      addSelection(outlier.decision.url, 'family-representative-cost-outlier');
    }
  }

  const decisions = contentPlan.decisions.map((decision) => {
    const reasonCodes = selections.get(decision.url);
    if (reasonCodes === undefined) return decision;
    return {
      ...decision,
      plannedPasses: [...decision.plannedPasses, 'lighthouse'] as readonly AuditPass[],
      reasonCodes: [...decision.reasonCodes, ...[...reasonCodes].sort()],
    };
  });

  return {
    plannerVersion: contentPlan.plannerVersion,
    decisions: sortByUrl(decisions),
  };
}
