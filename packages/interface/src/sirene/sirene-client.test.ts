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

  it('returns api-unreachable when the fetch itself throws', async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('network down'));
    const result = await fetchSireneProfile('732829320');
    expect(result).toEqual({
      status: 'api-unreachable',
      siren: '732829320',
      detail: 'network down',
    });
  });

  it('returns api-unreachable for a non-2xx HTTP response', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(jsonResponse({}, false, 503));
    const result = await fetchSireneProfile('732829320');
    expect(result).toEqual({ status: 'api-unreachable', siren: '732829320', detail: 'HTTP 503' });
  });
});
