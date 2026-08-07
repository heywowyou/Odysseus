/**
 * The operator behind an audited site: the company profile the obligation
 * engine (compliance/assessObligations.ts) reads to decide EU
 * Accessibility Act / loi 2023-171 scope. Every field is wrapped in
 * Provenanced<T> because a legal determination built from an unsourced
 * fact is not defensible: the same reasoning findings.ts already applies
 * to rawEvidence.
 */

export interface Provenanced<T> {
  value: T;
  /** Free-text origin, e.g. 'sirene-api', 'lcen-mentions-legales-scan',
   *  'sirene-lookup:not-found', 'sirene-lookup:api-unreachable',
   *  'sirene-lookup:etablissement-fermee'. Deliberately an open string,
   *  not a closed union, so a new failure or origin label never requires
   *  touching this file. */
  source: string;
  retrievedAt: Date;
}

/** INSEE tranche_effectif_salarie code, e.g. 'NN', '00', '01' ... '53'. */
export interface EffectifBand {
  code: string;
  label: string;
}

export interface OperatorProfile {
  siren: Provenanced<string>;
  denomination: Provenanced<string>;
  naf: Provenanced<string>;
  legalForm: Provenanced<string>;
  /** null when no SIREN was ever found, or the Sirene lookup failed in any
   *  way. This is the field assessObligations reads first to decide
   *  whether the exemption test can even be evaluated. */
  effectifBand: Provenanced<EffectifBand | null>;
  /** null whenever effectifBand.code is not in the small set of bands
   *  Sirene's financial fields are reliable for, or the lookup failed
   *  outright. See compliance/regimes.ts's
   *  SIRENE_TURNOVER_RELIABLE_EFFECTIF_CODES. */
  turnover: Provenanced<number | null>;
}

export type SireneLookupResult =
  | { status: 'found'; profile: OperatorProfile }
  | { status: 'not-found'; siren: string }
  | { status: 'api-unreachable'; siren: string; detail: string }
  | { status: 'etablissement-fermee'; siren: string };
