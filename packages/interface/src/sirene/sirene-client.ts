/**
 * Thin client for recherche-entreprises.api.gouv.fr, no auth required.
 * Lives in packages/interface (I/O orchestration charter), not
 * packages/core (no I/O allowed there) and not a new package (interface
 * already depends on store+core and already does exactly this kind of
 * external-I/O-plus-pipeline-stage work).
 *
 * Field names below are read from the API's live response shape
 * (confirmed against https://recherche-entreprises.api.gouv.fr/search),
 * not from documentation alone.
 */

import { SIRENE_TURNOVER_RELIABLE_EFFECTIF_CODES, type OperatorProfile, type Provenanced, type SireneLookupResult } from '@odysseus/core';

const SIRENE_SEARCH_URL = 'https://recherche-entreprises.api.gouv.fr/search';

/** INSEE's official French wording per tranche_effectif_salarie code.
 *  Kept here as the client's own reasonable default label; a report
 *  needing an English rendering translates by `code`, not by this
 *  string, keeping this client itself language-neutral. */
const EFFECTIF_BAND_LABELS_FR: Record<string, string> = {
  NN: 'Effectif non renseigne',
  '00': '0 salarie',
  '01': '1 a 2 salaries',
  '02': '3 a 5 salaries',
  '03': '6 a 9 salaries',
  '11': '10 a 19 salaries',
  '12': '20 a 49 salaries',
  '21': '50 a 99 salaries',
  '22': '100 a 199 salaries',
  '31': '200 a 249 salaries',
  '32': '250 a 499 salaries',
  '41': '500 a 999 salaries',
  '42': '1 000 a 1 999 salaries',
  '51': '2 000 a 4 999 salaries',
  '52': '5 000 a 9 999 salaries',
  '53': '10 000 salaries et plus',
};

interface RawSireneFinances {
  [year: string]: { ca?: number | null; resultat_net?: number | null } | undefined;
}

interface RawSireneResult {
  siren: string;
  nom_complet?: string | null;
  activite_principale?: string | null;
  nature_juridique?: string | null;
  etat_administratif?: string | null;
  tranche_effectif_salarie?: string | null;
  finances?: RawSireneFinances | null;
}

interface RawSireneSearchResponse {
  results?: RawSireneResult[];
}

function latestTurnover(finances: RawSireneFinances | null | undefined): number | null {
  if (!finances) return null;
  const years = Object.keys(finances).sort().reverse();
  for (const year of years) {
    const ca = finances[year]?.ca;
    if (typeof ca === 'number') return ca;
  }
  return null;
}

function provenanced<T>(value: T, source: string, retrievedAt: Date): Provenanced<T> {
  return { value, source, retrievedAt };
}

function mapResultToProfile(result: RawSireneResult, retrievedAt: Date): OperatorProfile {
  const source = 'sirene-api';
  const code = result.tranche_effectif_salarie ?? 'NN';
  const label = EFFECTIF_BAND_LABELS_FR[code] ?? code;
  const turnoverReliable = SIRENE_TURNOVER_RELIABLE_EFFECTIF_CODES.includes(code);

  return {
    siren: provenanced(result.siren, source, retrievedAt),
    denomination: provenanced(result.nom_complet ?? '', source, retrievedAt),
    naf: provenanced(result.activite_principale ?? '', source, retrievedAt),
    legalForm: provenanced(result.nature_juridique ?? '', source, retrievedAt),
    effectifBand: provenanced({ code, label }, source, retrievedAt),
    turnover: turnoverReliable
      ? provenanced(latestTurnover(result.finances), source, retrievedAt)
      : provenanced(null, 'sirene-api:turnover-unreliable-for-band', retrievedAt),
  };
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function fetchSireneProfile(siren: string): Promise<SireneLookupResult> {
  const url = `${SIRENE_SEARCH_URL}?q=${encodeURIComponent(siren)}&per_page=1`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    return { status: 'api-unreachable', siren, detail: errorDetail(error) };
  }

  if (!response.ok) {
    return { status: 'api-unreachable', siren, detail: `HTTP ${response.status}` };
  }

  let data: RawSireneSearchResponse;
  try {
    data = (await response.json()) as RawSireneSearchResponse;
  } catch (error) {
    return { status: 'api-unreachable', siren, detail: errorDetail(error) };
  }

  const result = data.results?.find((candidate) => candidate.siren === siren) ?? data.results?.[0];
  if (!result) return { status: 'not-found', siren };

  if (result.etat_administratif !== 'A') return { status: 'etablissement-fermee', siren };

  return { status: 'found', profile: mapResultToProfile(result, new Date()) };
}
