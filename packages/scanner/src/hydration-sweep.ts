/**
 * The bounded hydration sweep (plan 059 section 9, "Hydration sweep").
 *
 * A page that loads more content as the visitor scrolls is a different page
 * at the bottom than at the top, and links that exist only after that
 * scroll are real links of the site. The sweep is the deterministic,
 * bounded way the scanner sees them: scroll by viewport steps, watch the
 * document grow, stop when it stopped growing — or at the bound, recording
 * that expansion was still happening when the bound arrived, which is an
 * explicit surface limitation, never a claim that the page was exhausted.
 *
 * Everything it records is a fact about the document: start/end scroll
 * height, DOM node and resource growth, how many steps it took, whether
 * the document went quiet, and whether the bound cut it off. It runs after
 * every read-only and mutating check has finished with the page, so the
 * immutable baseline evidence is never taken from a half-hydrated state
 * (section 9, "Baseline first").
 */
import type { Page } from 'playwright';
import type { HydrationProgress, SurfaceCapabilityStatement } from './evidence-surfaces.js';
import type { SurfaceLink } from './surface-discovery.js';

/** Statement for a page whose sweep could not run at all. */
export const HYDRATION_SWEEP_UNAVAILABLE: SurfaceCapabilityStatement = {
  code: 'hydration-sweep-unavailable',
  fr: "Le balayage de chargement progressif d'une page n'a pas pu être effectué.",
  en: "One page's hydration sweep could not be performed.",
};

/** Statement for a page whose content kept expanding past the sweep bound:
 *  the page holds more content (and possibly more links) than the surface
 *  saw. This is the explicit surface limitation section 9 requires. */
export const HYDRATION_BOUND_LIMITATION: SurfaceCapabilityStatement = {
  code: 'hydration-bound-reached',
  fr: "Le contenu d'une page continuait de s'afficher pendant le défilement effectué par notre outil d'analyse : la page n'a été analysée que jusqu'à la limite de ce balayage.",
  en: "One page's content kept loading while our analysis tool scrolled: the page was analysed only up to the bound of that sweep.",
};

/** Scroll steps the sweep will pay for at most. A real lazy page settles
 *  in a handful of steps; this bound exists so an infinite feed cannot
 *  turn one page into unbounded work. */
export const HYDRATION_MAX_STEPS = 30;

/** How long one step waits for the document to react to the scroll before
 *  measuring. Short and fixed: the sweep is a probe, not a settle wait. */
const HYDRATION_STEP_SETTLE_MS = 250;

/** Consecutive no-growth steps that count as quiescence. */
export const HYDRATION_STABLE_STEPS_FOR_QUIESCENCE = 2;

export interface HydrationSweepRecord {
  startScrollHeight: number;
  endScrollHeight: number;
  startDomNodeCount: number;
  endDomNodeCount: number;
  startResourceCount: number;
  endResourceCount: number;
  /** Scroll steps actually taken, bounded by HYDRATION_MAX_STEPS. */
  steps: number;
  /** The document stopped growing before the bound. */
  quiescent: boolean;
  /** Growth was still happening when the step bound ended the sweep: the
   *  page holds more content than this surface saw. */
  continuedExpansionAtBound: boolean;
  progress: Exclude<HydrationProgress, 'not-run'>;
  /** Why the sweep ended early, when it did (the page navigated away
   *  mid-sweep, or a measurement could not be read). */
  abortReason?: string;
  /** Same-origin anchors present only after the sweep, ready for
   *  inventory discovery under `hydrated-link` provenance. Filled by the
   *  caller, which owns link normalization against the landed URL. */
  discoveredLinks?: SurfaceLink[];
}

/** One measured point of the sweep. */
export interface HydrationSweepObservation {
  scrollHeight: number;
  domNodeCount: number;
  resourceCount: number;
}

/**
 * Derives the sweep record from its measurements. Pure, so the contract is
 * testable without a browser:
 * - `failed` when the sweep aborted (it never silently becomes a pass);
 * - `stable` when nothing grew;
 * - `bounded-expansion` when content grew, whether or not the document
 *   went quiet, with `continuedExpansionAtBound` naming the bound case.
 */
export function summarizeHydrationSweep(input: {
  start: HydrationSweepObservation;
  observations: readonly HydrationSweepObservation[];
  abortReason?: string;
}): HydrationSweepRecord {
  const { start, observations, abortReason } = input;
  const end = observations.at(-1) ?? start;
  // Quiescence: the last two measurements agree on height and DOM size.
  const stableTail =
    observations.length >= HYDRATION_STABLE_STEPS_FOR_QUIESCENCE &&
    observations
      .slice(-HYDRATION_STABLE_STEPS_FOR_QUIESCENCE)
      .every((observation, index, tail) =>
        index === 0
          ? true
          : observation.scrollHeight === tail[index - 1]!.scrollHeight &&
            observation.domNodeCount === tail[index - 1]!.domNodeCount,
      );
  const quiescent = abortReason === undefined && stableTail;
  const grew =
    end.scrollHeight > start.scrollHeight ||
    end.domNodeCount > start.domNodeCount ||
    end.resourceCount > start.resourceCount;
  const reachedBound = abortReason === undefined && observations.length >= HYDRATION_MAX_STEPS;
  const progress: Exclude<HydrationProgress, 'not-run'> = abortReason
    ? 'failed'
    : grew
      ? 'bounded-expansion'
      : 'stable';
  return {
    startScrollHeight: start.scrollHeight,
    endScrollHeight: end.scrollHeight,
    startDomNodeCount: start.domNodeCount,
    endDomNodeCount: end.domNodeCount,
    startResourceCount: start.resourceCount,
    endResourceCount: end.resourceCount,
    steps: observations.length,
    quiescent,
    continuedExpansionAtBound: reachedBound && !stableTail,
    progress,
    ...(abortReason !== undefined ? { abortReason } : {}),
  };
}

interface SweepDocumentMetrics {
  scrollHeight: number;
  domNodeCount: number;
  resourceCount: number;
}

async function measure(page: Page): Promise<SweepDocumentMetrics> {
  return page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    domNodeCount: document.getElementsByTagName('*').length,
    resourceCount: performance.getEntriesByType('resource').length,
  }));
}

/**
 * Runs the sweep on an already-loaded page. Deterministic: scroll to the
 * bottom, wait the fixed step settle, measure, repeat until the document
 * is quiet for two consecutive steps or the step bound is reached. The
 * page is never navigated by the sweep; if it navigates itself away (a
 * scroll-triggered redirect), the sweep records `failed` with the reason
 * and stops.
 */
export async function runHydrationSweep(page: Page): Promise<HydrationSweepRecord> {
  const startedUrl = page.url();
  let start: SweepDocumentMetrics;
  try {
    start = await measure(page);
  } catch (error) {
    return summarizeHydrationSweep({
      start: { scrollHeight: 0, domNodeCount: 0, resourceCount: 0 },
      observations: [],
      abortReason: error instanceof Error ? error.message : 'unmeasurable document',
    });
  }
  const observations: HydrationSweepObservation[] = [];
  let abortReason: string | undefined;
  for (let step = 0; step < HYDRATION_MAX_STEPS; step += 1) {
    await new Promise((resolve) => setTimeout(resolve, HYDRATION_STEP_SETTLE_MS));
    try {
      await page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
      });
      const measurement = await measure(page);
      observations.push(measurement);
      if (page.url() !== startedUrl) {
        abortReason = 'the page navigated away during the sweep';
        break;
      }
      const stable = observations
        .slice(-HYDRATION_STABLE_STEPS_FOR_QUIESCENCE)
        .every((observation, index, tail) =>
          index === 0
            ? true
            : observation.scrollHeight === tail[index - 1]!.scrollHeight &&
              observation.domNodeCount === tail[index - 1]!.domNodeCount,
        );
      if (stable && observations.length >= HYDRATION_STABLE_STEPS_FOR_QUIESCENCE) break;
    } catch (error) {
      abortReason = error instanceof Error ? error.message : 'scroll measurement failed';
      break;
    }
  }
  return summarizeHydrationSweep({
    start,
    observations,
    ...(abortReason !== undefined ? { abortReason } : {}),
  });
}
