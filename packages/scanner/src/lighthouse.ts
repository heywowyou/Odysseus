import lighthouse, { type Result } from 'lighthouse';
import { getLighthouseTimeoutMs } from './config.js';

export interface LighthouseOptions {
  timeoutMs?: number;
}

/**
 * Runs Lighthouse against the given URL over the Chromium instance already
 * listening on debugPort. Lighthouse cannot accept a Playwright Page and
 * always performs its own navigation to collect trace-based Core Web
 * Vitals, so this is a separate load from the render-diff raw/rendered
 * pair, accepted as the unavoidable cost of getting real CWV data.
 */
export async function runLighthouse(
  url: string,
  debugPort: number,
  options: LighthouseOptions = {},
): Promise<Result> {
  const maxWaitForLoadedMs = options.timeoutMs ?? getLighthouseTimeoutMs();

  // blockedUrlPatterns was tried here to stop Lighthouse's SourceMaps
  // gatherer from fetching third-party .map files (see lighthouse-worker.ts
  // for why that gatherer can't just be skipped). It does nothing: the
  // gatherer fetches via the CDP `Network.loadNetworkResource` command,
  // which is documented to bypass `Network.setBlockedURLs` by design (it
  // exists so DevTools can always load a source map regardless of
  // page-level blocking). Confirmed against a real crash before removing.
  // Isolation, not blocking, is the actual fix - see runLighthouseIsolated.
  const runnerResult = await lighthouse(url, {
    port: debugPort,
    logLevel: 'error',
    maxWaitForLoad: maxWaitForLoadedMs,
    // Only the two categories whose audits can become findings. The
    // accessibility and best-practices categories were requested purely so
    // their scores could be recorded on the manifest, but no consumer ever
    // read those fields, and Lighthouse's accessibility category runs a
    // second axe pass we already run ourselves. Asking for them costs real
    // time per page for a number nobody looks at. See
    // LIGHTHOUSE_EXCLUDED_CATEGORIES in @odysseus/core.
    onlyCategories: ['performance', 'seo'],
  });

  if (!runnerResult) {
    throw new Error(`runLighthouse: no result returned for ${url}`);
  }

  return runnerResult.lhr;
}
