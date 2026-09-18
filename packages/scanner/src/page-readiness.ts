/**
 * What the rendered page looked like at the moment checks read it (plan 059
 * sections 5.6, 5.7 and 9).
 *
 * The rendered pass waits for `load` and then a bounded, best-effort network
 * idle, and a page that never goes idle is still scanned. That trade is right,
 * but it used to be invisible: nothing recorded whether the evidence came from
 * a settled page or one still moving. These observations are that record. They
 * are taken on the same navigation the checks use, never on a second load, and
 * they are serialisable so they persist on the page's scan.json with the rest
 * of its evidence.
 */
import type { Frame, Page, Response } from 'playwright';
import type { SurfaceReadinessOutcome } from './evidence-surfaces.js';

/** Resource types whose failure can change what a check sees. An image or a
 *  beacon failing does not; a stylesheet or a script can. */
const SIGNIFICANT_RESOURCE_TYPES = new Set(['document', 'stylesheet', 'script']);

/** How long the page must stay free of DOM mutations to count as quiescent.
 *  Short on purpose: it is a snapshot of state, not a second settle wait. */
const MUTATION_QUIET_WINDOW_MS = 400;

/** A frame whose element covers less than this many CSS pixels is a pixel,
 *  a beacon or a hidden helper, not content a visitor interacts with. */
const MATERIAL_FRAME_MIN_AREA = 120 * 80;

export interface RenderedReadinessObservation {
  navigationMilestone: 'load';
  httpStatus: number | null;
  domReady: boolean;
  fontsReady: boolean | null;
  networkQuiet: boolean;
  mutationQuiescent: boolean;
  /** `resourceType origin+path`, query strings dropped so a token in a URL
   *  never reaches stored evidence. Bounded and sorted. */
  significantResourceFailures: string[];
  outcome: SurfaceReadinessOutcome;
}

export interface FrameObservation {
  frameUrl: string;
  frameOrigin: string;
  sameOrigin: boolean;
  materiality: 'material' | 'non-material' | 'unknown';
  /** Whether axe-core was present in the frame after the axe pass. axe
   *  descends into child frames but skips one it cannot reach without
   *  saying so, so presence is checked per frame instead of assumed. */
  axeTraversed: boolean;
}

const MAX_RECORDED_FAILURES = 25;

function redactedResource(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`.slice(0, 200);
  } catch {
    return 'unparseable-url';
  }
}

/**
 * Starts recording significant resource failures on a page. Must be attached
 * before navigation; the returned reader is called once the page has settled.
 */
export function watchSignificantResourceFailures(page: Page): () => string[] {
  const failures = new Set<string>();
  const record = (resourceType: string, url: string): void => {
    if (!SIGNIFICANT_RESOURCE_TYPES.has(resourceType)) return;
    if (failures.size >= MAX_RECORDED_FAILURES) return;
    failures.add(`${resourceType} ${redactedResource(url)}`);
  };
  page.on('requestfailed', (request) => record(request.resourceType(), request.url()));
  page.on('response', (response) => {
    if (response.status() >= 400) record(response.request().resourceType(), response.url());
  });
  return () => [...failures].sort();
}

/**
 * Classifies readiness. `ready` needs a complete document, a network that went
 * idle within the settle bound and a DOM that stopped changing; a page that
 * loaded but kept moving is `unstable`, which is a fact about the evidence and
 * never an error.
 */
export function readinessOutcome(input: {
  domReady: boolean;
  networkQuiet: boolean;
  mutationQuiescent: boolean;
}): SurfaceReadinessOutcome {
  if (!input.domReady) return 'unstable';
  return input.networkQuiet && input.mutationQuiescent ? 'ready' : 'unstable';
}

export async function observeRenderedReadiness(
  page: Page,
  input: {
    response: Response | null;
    networkQuiet: boolean;
    readFailures: () => string[];
  },
): Promise<RenderedReadinessObservation> {
  const state = await page.evaluate(async (quietWindowMs) => {
    const mutations = await new Promise<number>((resolve) => {
      let count = 0;
      const observer = new MutationObserver((records) => {
        count += records.length;
      });
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
      setTimeout(() => {
        observer.disconnect();
        resolve(count);
      }, quietWindowMs);
    });
    const fonts = (document as Document & { fonts?: { status: string } }).fonts;
    return {
      domReady: document.readyState === 'complete',
      fontsReady: fonts === undefined ? null : fonts.status === 'loaded',
      mutationQuiescent: mutations === 0,
    };
  }, MUTATION_QUIET_WINDOW_MS);
  return {
    navigationMilestone: 'load',
    httpStatus: input.response?.status() ?? null,
    domReady: state.domReady,
    fontsReady: state.fontsReady,
    networkQuiet: input.networkQuiet,
    mutationQuiescent: state.mutationQuiescent,
    significantResourceFailures: input.readFailures(),
    outcome: readinessOutcome({
      domReady: state.domReady,
      networkQuiet: input.networkQuiet,
      mutationQuiescent: state.mutationQuiescent,
    }),
  };
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return 'null';
  }
}

async function frameMateriality(frame: Frame): Promise<FrameObservation['materiality']> {
  try {
    const element = await frame.frameElement();
    const box = await element.boundingBox();
    if (box === null) return 'non-material';
    return box.width * box.height >= MATERIAL_FRAME_MIN_AREA ? 'material' : 'non-material';
  } catch {
    return 'unknown';
  }
}

/**
 * Every child frame of the page with its origin, size-based materiality and
 * whether the axe pass reached it. Called after axe has run, on the same page.
 */
export async function observeFrames(page: Page, pageUrl: string): Promise<FrameObservation[]> {
  const pageOrigin = originOf(pageUrl);
  const observations: FrameObservation[] = [];
  for (const frame of page.frames()) {
    if (frame === page.mainFrame() || frame.isDetached()) continue;
    const rawUrl = frame.url();
    // An about:blank or srcdoc frame inherits its parent's origin; its content
    // is written by the page itself, so it is first-party.
    const inherited = rawUrl === '' || rawUrl.startsWith('about:');
    const frameUrl = inherited ? 'about:blank' : redactedResource(rawUrl);
    const frameOrigin = inherited ? pageOrigin : originOf(rawUrl);
    // axe leaves its global in every frame it was injected into; a frame it
    // could not enter (or one that refuses evaluation) has none.
    const axeTraversed = await frame
      .evaluate(() => typeof (window as unknown as { axe?: unknown }).axe === 'object')
      .catch(() => false);
    observations.push({
      frameUrl,
      frameOrigin,
      sameOrigin: frameOrigin === pageOrigin,
      materiality: await frameMateriality(frame),
      axeTraversed,
    });
  }
  return observations.sort((a, b) => a.frameUrl.localeCompare(b.frameUrl));
}
