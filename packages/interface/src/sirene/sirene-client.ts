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

import {
  SIRENE_TURNOVER_RELIABLE_EFFECTIF_CODES,
  type OperatorProfile,
  type Provenanced,
  type SireneLookupResult,
} from '@odysseus/core';

const SIRENE_SEARCH_URL = 'https://recherche-entreprises.api.gouv.fr/search';

/** INSEE's official French wording per tranche_effectif_salarie code.
 *  Kept here as the client's own reasonable default label; a report
 *  needing an English rendering translates by `code`, not by this
 *  string, keeping this client itself language-neutral. */
const EFFECTIF_BAND_LABELS_FR: Record<string, string> = {
  NN: 'Effectif non renseigné',
  '00': '0 salarié',
  '01': '1 à 2 salariés',
  '02': '3 à 5 salariés',
  '03': '6 à 9 salariés',
  '11': '10 à 19 salariés',
  '12': '20 à 49 salariés',
  '21': '50 à 99 salariés',
  '22': '100 à 199 salariés',
  '31': '200 à 249 salariés',
  '32': '250 à 499 salariés',
  '41': '500 à 999 salariés',
  '42': '1 000 à 1 999 salariés',
  '51': '2 000 à 4 999 salariés',
  '52': '5 000 à 9 999 salariés',
  '53': '10 000 salariés et plus',
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
    // Issue #78: the API's own missing-value sentinel for this field is 0,
    // not null or absent - a real hotel with EUR 64,713 of net profit the
    // same year reported ca: 0. Treating 0 as a measurement let
    // checkSmeExemption's "turnover === null" unknown-guard sail past a
    // value that is not a measurement at all, and a client was told, as a
    // verified registry fact, that their turnover was EUR 0. Falling
    // through to an earlier year on a 0 is deliberate: a real turnover of
    // exactly EUR 0 is not a thing an operating business has.
    if (typeof ca === 'number' && ca > 0) return ca;
  }
  return null;
}

function provenanced<T>(value: T, source: string, retrievedAt: Date): Provenanced<T> {
  return { value, source, retrievedAt };
}

function mapResultToProfile(result: RawSireneResult, retrievedAt: Date): OperatorProfile {
  const source = 'sirene-api';
  const code = result.tranche_effectif_salarie ?? 'NN';
  // Issue #87: EFFECTIF_BAND_LABELS_FR only covers INSEE's 16 documented
  // codes. Falling back to the raw code itself (`label = ... ?? code`)
  // would print a bare registry code like "53" where a client-facing
  // French sentence is expected, the same class of defect as the
  // accents-stripped label regression this file already guards against.
  // A code outside the table is honestly unrecognised, not a silently
  // acceptable label.
  const label = EFFECTIF_BAND_LABELS_FR[code] ?? `Tranche d'effectif non reconnue (code ${code})`;
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
