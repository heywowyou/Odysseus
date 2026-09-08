/**
 * Milestone 9c plan 006: what one prescanned hotel is worth as an outreach
 * target, as two independent numbers plus the reasons behind each one.
 *
 * Two numbers rather than one, because they answer different questions and
 * averaging them would hide both. *Brokenness* is how much is demonstrably
 * wrong with the site, measured from the prescan. *Ability* is whether this
 * establishment can act on it: whether it controls its own booking funnel,
 * whether it is independent rather than a chain property, and whether it is
 * large enough for the conversation to be worth either side's time. A very
 * broken site belonging to a chain property is not a prospect, and a
 * well-resourced independent with a healthy site is not one either.
 *
 * ## Why the shipped cost gates are not reused
 *
 * `../cost-gating/brokenness.ts` scores `Finding[]`. A prescan deliberately
 * produces no findings at all (see types/hotel-prescan.ts): it measures a site
 * cheaply, and turning measurements into findings is the paid audit's job.
 * Synthesizing findings from prescan facts just to reach `isProspectingWorthy`
 * would invent records the prescan never produced, so worthiness has its own
 * prescan-side predicate here and the shipped gates are untouched.
 *
 * ## Rules this file is bound by
 *
 * - **Missing is not false.** An absent fact scores zero and records an
 *   `unknown` reason. A hotel whose Sirene join never matched is not a small
 *   hotel; it is a hotel nobody has a headcount for, and a later analysis has
 *   to be able to tell those apart.
 * - **Metrics are banded, never exact.** Trade-off 35 measured request counts,
 *   bytes, CLS, blocking time and LCP all drifting between runs of the same
 *   site. A band survives that drift; a threshold on an exact value does not.
 * - **Weights are versioned and never edited in place.** A changed weight is a
 *   new configuration, so two campaigns' scores stay comparable. Only an
 *   `approved` configuration may produce a selected cohort.
 */

import { meetsEffectifThreshold } from './effectif-threshold.js';
import { HOTEL_RENDER_GAP_THRESHOLD_PERCENT } from './hotel-evidence.js';
import type { HotelGroupStatus } from '../types/hotel-candidate.js';
import type { HotelStarRating } from '../types/hotel-catalogue.js';
import type { Severity } from '../types/findings.js';
import type {
  HotelEvidenceSelectionReason,
  HotelEvidenceStatus,
} from '../types/hotel-prescan-evidence.js';

/** The configuration a run uses unless one is named explicitly. */
export const CURRENT_SCORING_VERSION = 'hotel-outreach-v1';

/** A material render gap at or above this percentage is the stronger band. The
 *  lower band reuses the evidence layer's own threshold, so "material enough to
 *  photograph" and "material enough to score" cannot drift apart. */
export const HOTEL_SEVERE_RENDER_GAP_PERCENT = 50;

export const HOTEL_SLOW_LCP_MS = 4000;
export const HOTEL_BLOCKING_MS = 600;
export const HOTEL_UNSTABLE_CLS = 0.25;

/** Guests, or rooms where a capacity is missing. Both are catalogue columns. */
export const HOTEL_MEANINGFUL_CAPACITY = 25;

export type HotelBrokennessComponentId =
  'render-gap' | 'booking-failure' | 'axe-critical' | 'axe-serious' | 'console-errors' | 'metrics';

export type HotelAbilityComponentId =
  'direct-booking' | 'star-rating' | 'capacity' | 'effectif' | 'independence';

/** Closed vocabulary, so a breakdown can be counted across a population rather
 *  than only read one row at a time. Every `*-unknown` value means the fact was
 *  never observed, which is deliberately distinct from observing it as absent. */
export type HotelScoreReason =
  | 'render-gap-severe'
  | 'render-gap-material'
  | 'render-gap-below-threshold'
  | 'render-gap-unknown'
  | 'booking-page-failure-captured'
  | 'generic-failure-captured'
  | 'no-failure-captured'
  | 'axe-critical-many'
  | 'axe-critical-present'
  | 'axe-critical-none'
  | 'axe-serious-many'
  | 'axe-serious-several'
  | 'axe-serious-present'
  | 'axe-serious-none'
  | 'axe-unknown'
  | 'console-errors-many'
  | 'console-errors-present'
  | 'console-errors-none'
  | 'console-errors-unknown'
  | 'metrics-poor'
  | 'metrics-acceptable'
  | 'metrics-unobserved'
  | 'direct-booking-on-own-domain'
  | 'direct-booking-detected-by-prescan'
  | 'booking-offsite-only'
  | 'booking-path-undetected'
  | 'star-rating-four-or-five'
  | 'star-rating-three'
  | 'star-rating-unknown'
  | 'capacity-meaningful'
  | 'capacity-small'
  | 'capacity-unknown'
  | 'effectif-ten-or-more'
  | 'effectif-under-ten-or-unmatched'
  | 'room-count-fifty-or-more'
  | 'room-count-twenty-five-to-forty-nine'
  | 'room-count-under-twenty-five'
  | 'room-count-unknown'
  | 'independent'
  | 'not-independent';

export interface HotelScoreComponent<Id extends string> {
  id: Id;
  points: number;
  reason: HotelScoreReason;
}

export interface HotelOutreachScoreConfig {
  version: string;
  /** Only an approved configuration may produce a selected cohort. An
   *  unapproved one still scores, so weights can be calibrated against a real
   *  population before anybody is contacted on their strength. */
  approved: boolean;
  brokenness: Record<HotelBrokennessComponentId, readonly number[]>;
  ability: Record<HotelAbilityComponentId, readonly number[]>;
  abilitySources: {
    directBooking: 'site-facts' | 'prescan-v4';
    effectif: 'sirene' | 'room-count-with-sirene-fallback';
  };
}

/**
 * Approved by the operator on 2026-08-28. Each band is written highest first,
 * matching the order the component functions test them in, so a reader can
 * check a weight against its rule without following control flow.
 *
 * Both sides total exactly 100 when every band fires, which is a property of
 * the numbers rather than a clamp: a clamp would silently compress differences
 * between the most broken sites, and ranking is the whole purpose here.
 */
export const HOTEL_OUTREACH_SCORE_CONFIGS: Readonly<Record<string, HotelOutreachScoreConfig>> = {
  'hotel-outreach-v1': {
    version: 'hotel-outreach-v1',
    approved: true,
    brokenness: {
      'render-gap': [30, 18],
      'booking-failure': [25, 12],
      'axe-critical': [20, 12],
      'axe-serious': [12, 7, 3],
      'console-errors': [8, 4],
      metrics: [5],
    },
    ability: {
      'direct-booking': [30, 10],
      'star-rating': [20, 12],
      capacity: [15],
      effectif: [20],
      independence: [15],
    },
    abilitySources: {
      directBooking: 'site-facts',
      effectif: 'sirene',
    },
  },
  /** Calibration only until the operator reviews the v1-to-v2 score diff.
   * This is deliberately a new configuration rather than an edit of v1:
   * prescan booking evidence and Atout France room counts widen the facts the
   * score reads, so the resulting rows must remain comparable by version. */
  'hotel-outreach-v2': {
    version: 'hotel-outreach-v2',
    approved: false,
    brokenness: {
      'render-gap': [30, 18],
      'booking-failure': [25, 12],
      'axe-critical': [20, 12],
      'axe-serious': [12, 7, 3],
      'console-errors': [8, 4],
      metrics: [5],
    },
    ability: {
      'direct-booking': [30, 10],
      'star-rating': [20, 12],
      capacity: [15],
      effectif: [20, 12],
      independence: [15],
    },
    abilitySources: {
      directBooking: 'prescan-v4',
      effectif: 'room-count-with-sirene-fallback',
    },
  },
};

/** One page's measurements, reduced to what scoring reads. Assembled by the
 *  caller from a stored prescan, the same "caller resolves, this function only
 *  decides" split qualifyHotelCandidate uses. */
export interface HotelScorePageFacts {
  missingPercent?: number | null;
  axeCritical?: number | null;
  axeSerious?: number | null;
  consoleErrorCount?: number | null;
  largestContentfulPaintMs?: number | null;
  mainThreadBlockingMs?: number | null;
  cumulativeLayoutShift?: number | null;
}

export interface HotelScoreEvidenceFacts {
  status: HotelEvidenceStatus;
  /** Absent when the specific-failure asset was omitted. */
  specificFailureReason?: HotelEvidenceSelectionReason | null;
  summarySeverities: readonly Severity[];
}

export interface HotelOutreachScoreInput {
  candidateId: string;
  pages: readonly HotelScorePageFacts[];
  evidence: HotelScoreEvidenceFacts;
  starRating?: HotelStarRating | null;
  capacity?: number | null;
  roomCount?: number | null;
  groupStatus: HotelGroupStatus;
  effectifBandCode?: string | null;
  /** Fixed booking-mechanism labels from a v4 prescan. The raw scanner
   * observations that produced them, including selectors and exact URLs, are
   * intentionally never available to the scorer. */
  bookingEvidenceKinds?: readonly string[];
  /** The persisted prescan contract that supplied bookingEvidenceKinds. */
  prescanVersion?: string;
  /** A same-origin reservation path, from the qualification's site facts. */
  reservationUrl?: string | null;
  /** Off-domain booking destinations. Proves a funnel exists, not that the
   *  hotel controls it. */
  offsiteBookingCount?: number | null;
}

const DIRECT_BOOKING_EVIDENCE_KINDS = new Set([
  'booking-engine-script',
  'checkout-form',
  'payment-embed',
  'booking-engine-domain-reference',
  'booking-iframe',
  'delegated-booking-single-property',
]);

function hasDirectBookingEvidence(kinds: readonly string[] | undefined): boolean {
  return kinds?.some((kind) => DIRECT_BOOKING_EVIDENCE_KINDS.has(kind)) ?? false;
}

export interface HotelOutreachScore {
  scoringVersion: string;
  brokenness: {
    total: number;
    components: HotelScoreComponent<HotelBrokennessComponentId>[];
  };
  ability: {
    total: number;
    components: HotelScoreComponent<HotelAbilityComponentId>[];
  };
  worthy: boolean;
}

/** Sums a nullable per-page count, returning null when no page reported one at
 *  all. Zero observed and never observed are different facts, and the caller
 *  turns them into different reasons. */
function sumObserved(
  pages: readonly HotelScorePageFacts[],
  read: (page: HotelScorePageFacts) => number | null | undefined,
): number | null {
  let total = 0;
  let observed = false;
  for (const page of pages) {
    const value = read(page);
    if (value === null || value === undefined) continue;
    observed = true;
    total += value;
  }
  return observed ? total : null;
}

function maxObserved(
  pages: readonly HotelScorePageFacts[],
  read: (page: HotelScorePageFacts) => number | null | undefined,
): number | null {
  let best: number | null = null;
  for (const page of pages) {
    const value = read(page);
    if (value === null || value === undefined) continue;
    best = best === null ? value : Math.max(best, value);
  }
  return best;
}

function band<Id extends string>(
  id: Id,
  points: number,
  reason: HotelScoreReason,
): HotelScoreComponent<Id> {
  return { id, points, reason };
}

function scoreBrokenness(
  input: HotelOutreachScoreInput,
  config: HotelOutreachScoreConfig,
): HotelScoreComponent<HotelBrokennessComponentId>[] {
  const weights = config.brokenness;
  const components: HotelScoreComponent<HotelBrokennessComponentId>[] = [];

  const gap = maxObserved(input.pages, (page) => page.missingPercent);
  if (gap === null) components.push(band('render-gap', 0, 'render-gap-unknown'));
  else if (gap >= HOTEL_SEVERE_RENDER_GAP_PERCENT)
    components.push(band('render-gap', weights['render-gap'][0] as number, 'render-gap-severe'));
  else if (gap >= HOTEL_RENDER_GAP_THRESHOLD_PERCENT)
    components.push(band('render-gap', weights['render-gap'][1] as number, 'render-gap-material'));
  else components.push(band('render-gap', 0, 'render-gap-below-threshold'));

  const failureReason = input.evidence.specificFailureReason ?? null;
  if (failureReason === null) components.push(band('booking-failure', 0, 'no-failure-captured'));
  else if (failureReason.startsWith('booking-'))
    components.push(
      band(
        'booking-failure',
        weights['booking-failure'][0] as number,
        'booking-page-failure-captured',
      ),
    );
  else
    components.push(
      band('booking-failure', weights['booking-failure'][1] as number, 'generic-failure-captured'),
    );

  const critical = sumObserved(input.pages, (page) => page.axeCritical);
  if (critical === null) components.push(band('axe-critical', 0, 'axe-unknown'));
  else if (critical >= 3)
    components.push(
      band('axe-critical', weights['axe-critical'][0] as number, 'axe-critical-many'),
    );
  else if (critical >= 1)
    components.push(
      band('axe-critical', weights['axe-critical'][1] as number, 'axe-critical-present'),
    );
  else components.push(band('axe-critical', 0, 'axe-critical-none'));

  const serious = sumObserved(input.pages, (page) => page.axeSerious);
  if (serious === null) components.push(band('axe-serious', 0, 'axe-unknown'));
  else if (serious >= 5)
    components.push(band('axe-serious', weights['axe-serious'][0] as number, 'axe-serious-many'));
  else if (serious >= 2)
    components.push(
      band('axe-serious', weights['axe-serious'][1] as number, 'axe-serious-several'),
    );
  else if (serious >= 1)
    components.push(
      band('axe-serious', weights['axe-serious'][2] as number, 'axe-serious-present'),
    );
  else components.push(band('axe-serious', 0, 'axe-serious-none'));

  const consoleErrors = sumObserved(input.pages, (page) => page.consoleErrorCount);
  if (consoleErrors === null) components.push(band('console-errors', 0, 'console-errors-unknown'));
  else if (consoleErrors >= 10)
    components.push(
      band('console-errors', weights['console-errors'][0] as number, 'console-errors-many'),
    );
  else if (consoleErrors >= 1)
    components.push(
      band('console-errors', weights['console-errors'][1] as number, 'console-errors-present'),
    );
  else components.push(band('console-errors', 0, 'console-errors-none'));

  const lcp = maxObserved(input.pages, (page) => page.largestContentfulPaintMs);
  const blocking = maxObserved(input.pages, (page) => page.mainThreadBlockingMs);
  const cls = maxObserved(input.pages, (page) => page.cumulativeLayoutShift);
  if (lcp === null && blocking === null && cls === null)
    components.push(band('metrics', 0, 'metrics-unobserved'));
  else if (
    (lcp !== null && lcp >= HOTEL_SLOW_LCP_MS) ||
    (blocking !== null && blocking >= HOTEL_BLOCKING_MS) ||
    (cls !== null && cls >= HOTEL_UNSTABLE_CLS)
  )
    components.push(band('metrics', weights.metrics[0] as number, 'metrics-poor'));
  else components.push(band('metrics', 0, 'metrics-acceptable'));

  return components;
}

function scoreAbility(
  input: HotelOutreachScoreInput,
  config: HotelOutreachScoreConfig,
): HotelScoreComponent<HotelAbilityComponentId>[] {
  const weights = config.ability;
  const components: HotelScoreComponent<HotelAbilityComponentId>[] = [];

  const reservationUrlPresent =
    input.reservationUrl !== null &&
    input.reservationUrl !== undefined &&
    input.reservationUrl !== '';
  const hasV4DirectBookingEvidence =
    input.prescanVersion === 'v4' && hasDirectBookingEvidence(input.bookingEvidenceKinds);
  if (
    (config.abilitySources.directBooking === 'prescan-v4' && hasV4DirectBookingEvidence) ||
    reservationUrlPresent
  )
    components.push(
      band(
        'direct-booking',
        weights['direct-booking'][0] as number,
        config.abilitySources.directBooking === 'prescan-v4' && hasV4DirectBookingEvidence
          ? 'direct-booking-detected-by-prescan'
          : 'direct-booking-on-own-domain',
      ),
    );
  else if ((input.offsiteBookingCount ?? 0) > 0)
    components.push(
      band('direct-booking', weights['direct-booking'][1] as number, 'booking-offsite-only'),
    );
  else components.push(band('direct-booking', 0, 'booking-path-undetected'));

  const rating = input.starRating ?? null;
  if (rating === null) components.push(band('star-rating', 0, 'star-rating-unknown'));
  else if (rating >= 4)
    components.push(
      band('star-rating', weights['star-rating'][0] as number, 'star-rating-four-or-five'),
    );
  else if (rating === 3)
    components.push(band('star-rating', weights['star-rating'][1] as number, 'star-rating-three'));
  else components.push(band('star-rating', 0, 'star-rating-unknown'));

  // Rooms stand in for guests only where a capacity is missing: the two count
  // different things, and preferring the column that answers the question
  // keeps a 30-room hotel with a recorded capacity from being scored twice.
  const size = input.capacity ?? input.roomCount ?? null;
  if (size === null) components.push(band('capacity', 0, 'capacity-unknown'));
  else if (size >= HOTEL_MEANINGFUL_CAPACITY)
    components.push(band('capacity', weights.capacity[0] as number, 'capacity-meaningful'));
  else components.push(band('capacity', 0, 'capacity-small'));

  if (config.abilitySources.effectif === 'room-count-with-sirene-fallback') {
    const roomCount = input.roomCount ?? null;
    if (roomCount !== null && roomCount >= 50)
      components.push(band('effectif', weights.effectif[0] as number, 'room-count-fifty-or-more'));
    else if (roomCount !== null && roomCount >= 25)
      components.push(
        band('effectif', weights.effectif[1] as number, 'room-count-twenty-five-to-forty-nine'),
      );
    else if (meetsEffectifThreshold(input.effectifBandCode))
      components.push(band('effectif', weights.effectif[0] as number, 'effectif-ten-or-more'));
    else if (roomCount === null) components.push(band('effectif', 0, 'room-count-unknown'));
    else components.push(band('effectif', 0, 'room-count-under-twenty-five'));
  } else if (meetsEffectifThreshold(input.effectifBandCode))
    components.push(band('effectif', weights.effectif[0] as number, 'effectif-ten-or-more'));
  else components.push(band('effectif', 0, 'effectif-under-ten-or-unmatched'));

  if (input.groupStatus === 'independent')
    components.push(band('independence', weights.independence[0] as number, 'independent'));
  else components.push(band('independence', 0, 'not-independent'));

  return components;
}

/**
 * Worth an outreach email at all, decided from the prescan rather than from
 * findings. Deliberately stricter than "the site has something wrong with it":
 * the campaign shows one render comparison and one measured failure, so a
 * hotel with nothing photographable has nothing to open a conversation with.
 */
export function isHotelOutreachWorthy(input: HotelOutreachScoreInput): boolean {
  if (input.evidence.status !== 'complete') return false;
  const gap = maxObserved(input.pages, (page) => page.missingPercent);
  if (gap !== null && gap >= HOTEL_RENDER_GAP_THRESHOLD_PERCENT) return true;
  return input.evidence.summarySeverities.some(
    (severity) => severity === 'critical' || severity === 'serious',
  );
}

export function getHotelOutreachScoreConfig(version: string): HotelOutreachScoreConfig {
  const config = HOTEL_OUTREACH_SCORE_CONFIGS[version];
  if (config === undefined) throw new Error(`Unknown hotel outreach scoring version: ${version}`);
  return config;
}

/**
 * Pure and total: same input, same output, no I/O, no clock, no randomness.
 * Component order is fixed by this function rather than by the input, so two
 * runs over the same facts arriving in a different page order are identical
 * documents and a diff between them means a real change.
 */
export function computeHotelOutreachScore(
  input: HotelOutreachScoreInput,
  config: HotelOutreachScoreConfig = getHotelOutreachScoreConfig(CURRENT_SCORING_VERSION),
): HotelOutreachScore {
  const brokenness = scoreBrokenness(input, config);
  const ability = scoreAbility(input, config);
  const sum = (components: readonly { points: number }[]): number =>
    components.reduce((total, component) => total + component.points, 0);
  return {
    scoringVersion: config.version,
    brokenness: { total: sum(brokenness), components: brokenness },
    ability: { total: sum(ability), components: ability },
    worthy: isHotelOutreachWorthy(input),
  };
}
