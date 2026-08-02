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

  const runnerResult = await lighthouse(url, {
    port: debugPort,
    logLevel: 'error',
    maxWaitForLoad: maxWaitForLoadedMs,
    onlyCategories: ['performance', 'accessibility', 'seo', 'best-practices'],
  });

  if (!runnerResult) {
    throw new Error(`runLighthouse: no result returned for ${url}`);
  }

  return runnerResult.lhr;
}
