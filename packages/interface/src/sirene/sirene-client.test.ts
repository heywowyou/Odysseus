import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSireneProfile } from './sirene-client.js';

const originalFetch = global.fetch;

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('fetchSireneProfile', () => {
  it('maps a found, active establishment into an OperatorProfile', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({
        results: [
          {
            siren: '652014051',
            nom_complet: 'CARREFOUR',
            activite_principale: '70.10Z',
            nature_juridique: '5599',
            etat_administratif: 'A',
            tranche_effectif_salarie: '02',
            finances: { 2023: { ca: 84_908_000_000, resultat_net: 0 } },
          },
        ],
      }),
    );

    const result = await fetchSireneProfile('652014051');
    expect(result.status).toBe('found');
    if (result.status !== 'found') throw new Error('expected found');
    expect(result.profile.denomination.value).toBe('CARREFOUR');
    expect(result.profile.effectifBand.value?.code).toBe('02');
    expect(result.profile.turnover.value).toBe(84_908_000_000);
    expect(result.profile.turnover.source).toBe('sirene-api');
  });

  it('does not populate turnover for an effectif band outside the reliable set', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({
        results: [
          {
            siren: '503932568',
            nom_complet: 'CARREFOUR',
            etat_administratif: 'A',
            tranche_effectif_salarie: '22',
            finances: { 2023: { ca: 1_000_000 } },
          },
        ],
      }),
    );

    const result = await fetchSireneProfile('503932568');
    expect(result.status).toBe('found');
    if (result.status !== 'found') throw new Error('expected found');
    expect(result.profile.turnover.value).toBeNull();
    expect(result.profile.turnover.source).toBe('sirene-api:turnover-unreliable-for-band');
  });

  // Issue #78: ca: 0 is the API's own missing-value sentinel, not a real
  // measurement - a real 25-room hotel reported ca: 0 alongside
  // resultat_net: 64713 for the same year. Treating 0 as a value let
  // checkSmeExemption's turnover===null guard sail past it and claim the
  // SME exemption on the strength of an absent figure.
  it('treats a reported turnover of exactly 0 as no value, falling back to an earlier year', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({
        results: [
          {
            siren: '849964887',
            nom_complet: 'LE GRAND CHALET',
            etat_administratif: 'A',
            tranche_effectif_salarie: '02',
            finances: {
              2024: { ca: 0, resultat_net: 64_713 },
              2023: { ca: 512_000, resultat_net: 12_000 },
            },
          },
        ],
      }),
    );

    const result = await fetchSireneProfile('849964887');
    expect(result.status).toBe('found');
    if (result.status !== 'found') throw new Error('expected found');
    expect(result.profile.turnover.value).toBe(512_000);
  });

  it('reports no turnover value at all when every year is 0', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({
        results: [
          {
            siren: '849964887',
            nom_complet: 'LE GRAND CHALET',
            etat_administratif: 'A',
            tranche_effectif_salarie: '02',
            finances: { 2024: { ca: 0, resultat_net: 64_713 } },
          },
        ],
      }),
    );

    const result = await fetchSireneProfile('849964887');
    expect(result.status).toBe('found');
    if (result.status !== 'found') throw new Error('expected found');
    expect(result.profile.turnover.value).toBeNull();
    expect(result.profile.turnover.source).toBe('sirene-api');
  });

  it('renders the effectif band label with correct French accents, not the ASCII-folded typo', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({
        results: [
          {
            siren: '503932568',
            nom_complet: 'CARREFOUR',
            etat_administratif: 'A',
            tranche_effectif_salarie: '22',
            finances: { 2023: { ca: 1_000_000 } },
          },
        ],
      }),
    );

    const result = await fetchSireneProfile('503932568');
    expect(result.status).toBe('found');
    if (result.status !== 'found') throw new Error('expected found');
    // Real regression: this label used to read "100 a 199 salaries",
    // missing both accents.
    expect(result.profile.effectifBand.value?.label).toBe('100 à 199 salariés');
  });

  // Issue #87: a code outside the 16 documented INSEE bands used to fall
  // back to the raw code itself as the label, so a client-facing string
  // could read as a bare "99" instead of a French sentence.
  it('never renders the raw code as the label for a code outside the known table', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({
        results: [
          {
            siren: '503932568',
            nom_complet: 'CARREFOUR',
            etat_administratif: 'A',
            tranche_effectif_salarie: '99',
            finances: {},
          },
        ],
      }),
    );

    const result = await fetchSireneProfile('503932568');
    expect(result.status).toBe('found');
    if (result.status !== 'found') throw new Error('expected found');
    expect(result.profile.effectifBand.value?.code).toBe('99');
    expect(result.profile.effectifBand.value?.label).not.toBe('99');
    expect(result.profile.effectifBand.value?.label).toContain('99');
  });

  it('returns not-found when the API returns zero results', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(jsonResponse({ results: [] }));
    expect(await fetchSireneProfile('000000000')).toEqual({
      status: 'not-found',
      siren: '000000000',
    });
  });

  it('returns etablissement-fermee when the establishment is not active', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      jsonResponse({ results: [{ siren: '111111116', etat_administratif: 'C' }] }),
    );
    expect(await fetchSireneProfile('111111116')).toEqual({
      status: 'etablissement-fermee',
      siren: '111111116',
    });
  });

  const NO_WAIT = { retryDelaysMs: [0, 0] };

  it('returns api-unreachable when every attempt throws', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('network down'));
    const result = await fetchSireneProfile('732829320', NO_WAIT);
    expect(result).toEqual({
      status: 'api-unreachable',
      siren: '732829320',
      detail: 'network down',
    });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('returns api-unreachable when every attempt answers a server error', async () => {
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse({}, false, 503));
    const result = await fetchSireneProfile('732829320', NO_WAIT);
    expect(result).toEqual({ status: 'api-unreachable', siren: '732829320', detail: 'HTTP 503' });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('retries a rate-limited or failed attempt and returns the answer that follows', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(jsonResponse({}, false, 429))
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce(
        jsonResponse({
          results: [{ siren: '381225325', nom_complet: 'HOTEL LE LAC', etat_administratif: 'A' }],
        }),
      );
    const result = await fetchSireneProfile('381225325', NO_WAIT);
    expect(result.status).toBe('found');
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry a client error other than rate limiting', async () => {
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse({}, false, 400));
    const result = await fetchSireneProfile('732829320', NO_WAIT);
    expect(result).toEqual({ status: 'api-unreachable', siren: '732829320', detail: 'HTTP 400' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
