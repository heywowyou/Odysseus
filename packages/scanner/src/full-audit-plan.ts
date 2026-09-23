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

/** v2: site-wide signals are discounted before role classification, and an
 *  unknown/fallback page in a repeated family is covered by that family's
 *  representatives instead of being measured unconditionally. */
export const FULL_AUDIT_PLANNER_VERSION = 'v3';

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

export type SurfaceSampleReason =
  'homepage' | 'mandatory' | 'family-representative' | 'unique-family' | 'family-sampled';

export interface SurfaceSampleDecision {
  url: string;
  selected: boolean;
  reason: SurfaceSampleReason;
}

export interface FullAuditPlan {
  plannerVersion: typeof FULL_AUDIT_PLANNER_VERSION;
  decisions: readonly PageAuditDecision[];
  /** Ordered like the input inventory. It is separate from URL-sorted
   *  Lighthouse decisions because family representatives follow inventory
   *  order, not lexical URL order. */
  surfaceSampling: readonly SurfaceSampleDecision[];
}

/** Exported so the report-facing semantic classifier
 *  (`page-semantic-profile.ts`, plan 059 step 26) reads the exact same
 *  listing evidence vocabulary as the scheduler instead of redefining it. */
export const LISTING_SIGNAL_KINDS: readonly PageRoleSignalKind[] = [
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

/** Signal kinds that can come from markup repeated on every page (a booking
 *  widget in a div-built header, a navigation menu) rather than from the
 *  page itself. The extractor already skips semantic header/nav/footer for
 *  links (issue #88), but forms get no such exclusion, and a site built from
 *  plain divs defeats it for links too. */
const SITE_WIDE_CANDIDATE_KINDS: readonly PageRoleSignalKind[] = [
  'transactional-form',
  'external-transactional-link',
  'repeated-teaser-links',
];

/** Below this many pages a share says little about what is site-wide, and a
 *  small site's Lighthouse cost is small anyway. */
const SITE_WIDE_MIN_PAGES = 10;

/** A candidate kind present on at least this share of a site's pages is
 *  treated as layout rather than page evidence. */
const SITE_WIDE_MIN_SHARE = 0.25;

/** The leading integer every candidate kind's detail starts with ("2
 *  form(s)", "3 link(s)", "27"). Undefined means the detail cannot be read,
 *  and such a signal is never discounted. */
function signalCount(detail: string): number | undefined {
  const match = /^\d+/u.exec(detail);
  return match === null ? undefined : Number(match[0]);
}

/**
 * For each candidate kind common enough to be site layout, the count a
 * typical page carries: the most frequent count, ties going to the smaller
 * one so fewer pages lose the signal. A page whose count stays at or below
 * it gets nothing from that kind; a page with more (a second, page-specific
 * booking form, a teaser group larger than the menu) keeps the signal,
 * because the surplus is about the page.
 */
function siteWideSignalBaselines(
  profiles: readonly PageAuditProfile[],
): ReadonlyMap<PageRoleSignalKind, number> {
  const baselines = new Map<PageRoleSignalKind, number>();
  if (profiles.length < SITE_WIDE_MIN_PAGES) return baselines;
  for (const kind of SITE_WIDE_CANDIDATE_KINDS) {
    const frequency = new Map<number, number>();
    let pagesWithKind = 0;
    for (const profile of profiles) {
      const signal = profile.roleSignals.find((s) => s.kind === kind);
      if (signal === undefined) continue;
      pagesWithKind += 1;
      const count = signalCount(signal.detail);
      if (count !== undefined) frequency.set(count, (frequency.get(count) ?? 0) + 1);
    }
    if (pagesWithKind / profiles.length < SITE_WIDE_MIN_SHARE || frequency.size === 0) continue;
    const [typical] = [...frequency].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]!;
    baselines.set(kind, typical);
  }
  return baselines;
}

function discountSiteWideSignals(
  profile: PageAuditProfile,
  baselines: ReadonlyMap<PageRoleSignalKind, number>,
): { profile: PageAuditProfile; discounted: PageRoleSignalKind[] } {
  const discounted: PageRoleSignalKind[] = [];
  const roleSignals = profile.roleSignals.filter((signal) => {
    const typical = baselines.get(signal.kind);
    const count = signalCount(signal.detail);
    if (typical === undefined || count === undefined || count > typical) return true;
    discounted.push(signal.kind);
    return false;
  });
  return { profile: { ...profile, roleSignals }, discounted };
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
  const baselines = siteWideSignalBaselines(profiles);
  const decisions: PageAuditDecision[] = profiles.map((original) => {
    const { profile, discounted } = discountSiteWideSignals(original, baselines);
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
      reasonCodes: [
        ...classification.reasonCodes,
        ...discounted.map((kind) => `site-wide-signal-discounted:${kind}`),
        ...carryForwardMarkers,
      ],
    };
  });

  const decisionsByUrl = new Map(decisions.map((decision) => [decision.url, decision]));
  const familyMembers = new Map<string, PageAuditDecision[]>();
  for (const profile of profiles) {
    const decision = decisionsByUrl.get(profile.url);
    if (decision === undefined) continue;
    const key = familyKey(decision);
    const members = familyMembers.get(key) ?? [];
    members.push(decision);
    familyMembers.set(key, members);
  }
  const selectedByUrl = new Map<string, SurfaceSampleDecision>();
  for (const profile of profiles) {
    const decision = decisionsByUrl.get(profile.url);
    if (decision === undefined) continue;
    const members = familyMembers.get(familyKey(decision)) ?? [];
    const familyIndex = members.findIndex((member) => member.url === decision.url);
    const mandatory = isMandatoryRegardlessOfFamily(decision);
    const homepage = decision.reasonCodes.includes(HOMEPAGE_MARKER);
    const selected = homepage || mandatory.mandatory || familyIndex < 2;
    const reason: SurfaceSampleReason = homepage
      ? 'homepage'
      : mandatory.mandatory
        ? 'mandatory'
        : members.length === 1
          ? 'unique-family'
          : familyIndex < 2
            ? 'family-representative'
            : 'family-sampled';
    selectedByUrl.set(profile.url, { url: profile.url, selected, reason });
  }

  return {
    plannerVersion: FULL_AUDIT_PLANNER_VERSION,
    decisions: sortByUrl(decisions),
    surfaceSampling: profiles.flatMap((profile) => {
      const sample = selectedByUrl.get(profile.url);
      return sample === undefined ? [] : [sample];
    }),
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
  // An unknown or fallback role is deliberately not mandatory any more (v2).
  // It never reduces coverage on its own: a page alone in its family is
  // still measured as `unique-template-family`, an unknown page can never
  // make its family a skipped listing family, and a repeated family still
  // gets its stable and cost-outlier representatives. Measuring every
  // unknown page made the family sample a no-op on real sites, where most
  // pages carry no decisive role signal.
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
    surfaceSampling: contentPlan.surfaceSampling,
  };
}
