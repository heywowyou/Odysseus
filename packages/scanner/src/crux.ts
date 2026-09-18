/**
 * Milestone 8.6: Chrome UX Report (CrUX) field data - real Chrome users'
 * Core Web Vitals for the audited origin, fetched once per audit, not
 * per page: CrUX only reports at origin or URL granularity, and origin
 * is the right grain for a site-wide performance signal that
 * complements Lighthouse's per-page lab simulation. Requires
 * CRUX_API_KEY (config.ts's getCruxApiKey()); scan-site.ts skips this
 * fetch entirely when no key is configured, rather than calling it and
 * getting an auth error every time.
 *
 * CrUX has a minimum-traffic threshold before an origin gets a public
 * record at all - crux-api's queryRecord() returns null in that case,
 * which this module reports as `{ available: false }` rather than
 * throwing or guessing. See CruxFieldDataResult's own doc comment
 * (@odysseus/core, types/manifest.ts) for why this is recorded in the
 * manifest rather than invented as a Finding, and why "available: false"
 * must never render as a pass.
 */

import { createQueryRecord } from 'crux-api';
import type { CruxFieldDataResult } from '@odysseus/core';

/** Google's own published "poor" thresholds for the three Core Web
 *  Vitals CrUX reports, in the CrUX API's native units (ms for LCP/INP,
 *  unitless for CLS). See
 *  https://web.dev/articles/defining-core-web-vitals-thresholds */
export const CRUX_POOR_THRESHOLDS = {
  lcp: 4000,
  cls: 0.25,
  inp: 500,
};

interface CruxRecordMetrics {
  largest_contentful_paint?: { percentiles?: { p75?: number | string } };
  cumulative_layout_shift?: { percentiles?: { p75?: number | string } };
  interaction_to_next_paint?: { percentiles?: { p75?: number | string } };
}

type CruxAcquisitionStatus = 'available' | 'no-public-data' | 'provider-error';

interface CruxFieldDataAcquisition {
  status: CruxAcquisitionStatus;
  granularity: 'origin';
  fieldData: CruxFieldDataResult;
  providerError?: string;
}

/**
 * Plan 059: keep a genuine CrUX no-data response distinct from a provider,
 * transport, authentication or quota failure. The compatibility field-data
 * payload remains unchanged for existing manifest/report consumers.
 */
async function fetchCruxFieldDataAcquisition(
  origin: string,
  apiKey: string,
): Promise<CruxFieldDataAcquisition> {
  try {
    const queryRecord = createQueryRecord({ key: apiKey, fetch: globalThis.fetch });
    const response = (await queryRecord({ origin })) as {
      record: { metrics: CruxRecordMetrics };
    } | null;
    if (!response) {
      return {
        status: 'no-public-data',
        granularity: 'origin',
        fieldData: { available: false },
      };
    }

    const metrics = response.record.metrics;
    const lcp = metrics.largest_contentful_paint?.percentiles?.p75;
    const cls = metrics.cumulative_layout_shift?.percentiles?.p75;
    const inp = metrics.interaction_to_next_paint?.percentiles?.p75;
    const fieldData: CruxFieldDataResult = {
      available: true,
      ...(lcp !== undefined ? { lcp: { p75: Number(lcp) } } : {}),
      ...(cls !== undefined ? { cls: { p75: Number(cls) } } : {}),
      ...(inp !== undefined ? { inp: { p75: Number(inp) } } : {}),
    };
    return { status: 'available', granularity: 'origin', fieldData };
  } catch (error) {
    const providerError = error instanceof Error ? error.message : String(error);
    return {
      status: 'provider-error',
      granularity: 'origin',
      fieldData: { available: false, fetchError: providerError },
      providerError,
    };
  }
}

/** Compatibility wrapper for callers that only need the historical payload. */
export async function fetchCruxFieldData(
  origin: string,
  apiKey: string,
): Promise<CruxFieldDataResult> {
  const acquisition = await fetchCruxFieldDataAcquisition(origin, apiKey);
  if (acquisition.status === 'provider-error') {
    throw new Error(
      `CrUX acquisition failed: ${acquisition.providerError ?? 'unknown provider error'}`,
    );
  }
  return acquisition.fieldData;
}
