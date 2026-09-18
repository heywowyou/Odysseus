import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCruxFieldData, fetchCruxFieldDataAcquisition } from './crux.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchCruxFieldData', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports available: true with the three field metrics on a successful record', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          record: {
            key: { origin: 'https://example.com' },
            metrics: {
              largest_contentful_paint: { percentiles: { p75: 4200 } },
              cumulative_layout_shift: { percentiles: { p75: '0.30' } },
              interaction_to_next_paint: { percentiles: { p75: 600 } },
            },
          },
        }),
      ),
    );

    const result = await fetchCruxFieldData('https://example.com', 'fake-key');

    expect(result.available).toBe(true);
    expect(result.lcp).toEqual({ p75: 4200 });
    expect(result.cls).toEqual({ p75: 0.3 });
    expect(result.inp).toEqual({ p75: 600 });
  });

  it('reports available: false, not a thrown error, when CrUX has no record (404)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: { code: 404 } }, 404)));

    const result = await fetchCruxFieldData('https://tiny-site.example', 'fake-key');

    expect(result).toEqual({ available: false });
  });

  it('reports available: false with a fetchError on a network failure, without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unreachable')));

    const result = await fetchCruxFieldData('https://example.com', 'fake-key');

    expect(result.available).toBe(false);
    expect(result.fetchError).toBeDefined();
  });

  it('distinguishes no public data from provider failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: { code: 404 } }, 404)));

    const noData = await fetchCruxFieldDataAcquisition('https://tiny-site.example', 'fake-key');
    expect(noData).toEqual({
      status: 'no-public-data',
      granularity: 'origin',
      fieldData: { available: false },
    });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('provider unavailable')));
    const failed = await fetchCruxFieldDataAcquisition('https://example.com', 'fake-key');
    expect(failed.status).toBe('provider-error');
    expect(failed.granularity).toBe('origin');
    expect(failed.fieldData.available).toBe(false);
    expect(failed.providerError).toContain('provider unavailable');
    expect(failed.fieldData.fetchError).toContain('provider unavailable');
  });
});
