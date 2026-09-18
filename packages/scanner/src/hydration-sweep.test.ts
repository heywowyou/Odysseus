import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Page } from 'playwright';
import {
  HYDRATION_MAX_STEPS,
  HYDRATION_STABLE_STEPS_FOR_QUIESCENCE,
  runHydrationSweep,
  summarizeHydrationSweep,
  type HydrationSweepObservation,
} from './hydration-sweep.js';

describe('summarizeHydrationSweep', () => {
  const start: HydrationSweepObservation = {
    scrollHeight: 800,
    domNodeCount: 200,
    resourceCount: 10,
  };

  it('reports a page that never grew as stable and quiescent', () => {
    const record = summarizeHydrationSweep({
      start,
      observations: [
        { scrollHeight: 800, domNodeCount: 200, resourceCount: 10 },
        { scrollHeight: 800, domNodeCount: 200, resourceCount: 10 },
      ],
    });

    expect(record.progress).toBe('stable');
    expect(record.quiescent).toBe(true);
    expect(record.continuedExpansionAtBound).toBe(false);
    expect(record.steps).toBe(2);
    expect(record.endScrollHeight).toBe(800);
  });

  it('reports growth that settled as bounded expansion, not an error', () => {
    const record = summarizeHydrationSweep({
      start,
      observations: [
        { scrollHeight: 1600, domNodeCount: 400, resourceCount: 12 },
        { scrollHeight: 1600, domNodeCount: 400, resourceCount: 12 },
      ],
    });

    expect(record.progress).toBe('bounded-expansion');
    expect(record.quiescent).toBe(true);
    expect(record.continuedExpansionAtBound).toBe(false);
    expect(record.endScrollHeight).toBe(1600);
    expect(record.endDomNodeCount).toBe(400);
    expect(record.endResourceCount).toBe(12);
  });

  it('names the bound explicitly when growth was still happening at it', () => {
    const growing = Array.from({ length: HYDRATION_MAX_STEPS }, (_, step) => ({
      scrollHeight: 800 + (step + 1) * 1000,
      domNodeCount: 200 + (step + 1) * 50,
      resourceCount: 10,
    }));
    const record = summarizeHydrationSweep({ start, observations: growing });

    expect(record.steps).toBe(HYDRATION_MAX_STEPS);
    expect(record.progress).toBe('bounded-expansion');
    expect(record.quiescent).toBe(false);
    expect(record.continuedExpansionAtBound).toBe(true);
  });

  it('records an aborted sweep as failed with its reason, never as a pass', () => {
    const record = summarizeHydrationSweep({
      start,
      observations: [{ scrollHeight: 1600, domNodeCount: 400, resourceCount: 12 }],
      abortReason: 'the page navigated away during the sweep',
    });

    expect(record.progress).toBe('failed');
    expect(record.quiescent).toBe(false);
    expect(record.abortReason).toBe('the page navigated away during the sweep');
  });

  it('needs two consecutive stable steps for quiescence', () => {
    const record = summarizeHydrationSweep({
      start,
      observations: [
        { scrollHeight: 1600, domNodeCount: 400, resourceCount: 10 },
        { scrollHeight: 2400, domNodeCount: 500, resourceCount: 10 },
      ],
    });

    expect(record.quiescent).toBe(false);
    expect(record.progress).toBe('bounded-expansion');
    expect(record.continuedExpansionAtBound).toBe(false);
  });

  it(`requires at least ${HYDRATION_STABLE_STEPS_FOR_QUIESCENCE} observations to call quiescence`, () => {
    const record = summarizeHydrationSweep({
      start,
      observations: [{ scrollHeight: 800, domNodeCount: 200, resourceCount: 10 }],
    });

    expect(record.quiescent).toBe(false);
    expect(record.continuedExpansionAtBound).toBe(false);
    expect(record.progress).toBe('stable');
  });
});

/** Offline sweep harness: metrics advance with every measurement, the
 *  scroll evaluate is recognized by its source, and the page can be made
 *  to navigate away after N steps. */
function makeSweepPage(options: {
  metricsFor?: (step: number) => {
    scrollHeight: number;
    domNodeCount: number;
    resourceCount: number;
  };
  navigateAfterSteps?: number;
}): { page: Page; steps: number } {
  let step = 0;
  const page = {
    url: () => {
      const limit = options.navigateAfterSteps ?? Number.POSITIVE_INFINITY;
      return step >= limit ? 'https://example.com/redirected' : 'https://example.com/';
    },
    evaluate: async (fn: () => unknown) => {
      const source = fn.toString();
      if (source.includes('scrollTo')) {
        step += 1;
        return undefined;
      }
      return (
        options.metricsFor?.(step) ?? { scrollHeight: 800, domNodeCount: 200, resourceCount: 10 }
      );
    },
  };
  return {
    page: page as unknown as Page,
    get steps() {
      return step;
    },
  };
}

describe('runHydrationSweep', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('settles on a static page after the quiescence steps and records stable', async () => {
    vi.useFakeTimers();
    const { page } = makeSweepPage({});
    const pending = runHydrationSweep(page);
    await vi.advanceTimersByTimeAsync(60_000);
    const record = await pending;

    expect(record.progress).toBe('stable');
    expect(record.quiescent).toBe(true);
    expect(record.steps).toBe(HYDRATION_STABLE_STEPS_FOR_QUIESCENCE);
  });

  it('measures a lazy page growing then settling', async () => {
    vi.useFakeTimers();
    const { page } = makeSweepPage({
      // The start measurement lands at step 0; every scroll reaches the
      // taller, node-richer document.
      metricsFor: (step) =>
        step >= 1
          ? { scrollHeight: 2400, domNodeCount: 400, resourceCount: 12 }
          : { scrollHeight: 1600, domNodeCount: 300, resourceCount: 10 },
    });
    const pending = runHydrationSweep(page);
    await vi.advanceTimersByTimeAsync(60_000);
    const record = await pending;

    expect(record.startScrollHeight).toBe(1600);
    expect(record.endScrollHeight).toBe(2400);
    expect(record.endDomNodeCount).toBe(400);
    expect(record.progress).toBe('bounded-expansion');
    expect(record.quiescent).toBe(true);
    expect(record.continuedExpansionAtBound).toBe(false);
  });

  it('stops at the step bound with the continued-expansion limitation on an infinite feed', async () => {
    vi.useFakeTimers();
    const { page } = makeSweepPage({
      metricsFor: (step) => ({
        scrollHeight: 800 + step * 1000 + 1000,
        domNodeCount: 200 + step * 10,
        resourceCount: 10,
      }),
    });
    const pending = runHydrationSweep(page);
    await vi.advanceTimersByTimeAsync(600_000);
    const record = await pending;

    expect(record.steps).toBe(HYDRATION_MAX_STEPS);
    expect(record.continuedExpansionAtBound).toBe(true);
    expect(record.progress).toBe('bounded-expansion');
  });

  it('aborts as failed when the page navigates itself away mid-sweep', async () => {
    vi.useFakeTimers();
    const { page } = makeSweepPage({ navigateAfterSteps: 2 });
    const pending = runHydrationSweep(page);
    await vi.advanceTimersByTimeAsync(60_000);
    const record = await pending;

    expect(record.progress).toBe('failed');
    expect(record.abortReason).toBe('the page navigated away during the sweep');
    expect(record.steps).toBe(2);
  });
});
