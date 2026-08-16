/**
 * Types for milestone 9a's prospect-qualification pipeline. Kept separate
 * from entity.ts: OperatorProfile/SireneLookupResult model a single
 * SIREN's live-API-resolved profile for the paid-audit obligation engine,
 * while these types model the bulk, stock-file-derived candidate funnel
 * that feeds packages/store's prospects collection. See
 * docs/prospect-qualification.md for the governing spec.
 */

import type { EffectifBand } from './entity.js';

/** One row surviving AFNIC Fichier A's own filter (ORG holder, no
 *  populated withdrawal date) - not the raw CSV row shape, which has
 *  several fields (registrar geo, IDN flag) this pipeline never reads. */
export interface AfnicRow {
  domain: string;
  titulaireType: string;
  titulaireCountry?: string;
  titulaireDepartment?: string;
  idn: boolean;
  creationDate?: string;
  withdrawalDate?: string;
}

/** One Sirene stock row that already cleared the NAF-allowlist,
 *  effectifs-threshold, and etatAdministratif filters at index-build time
 *  (see packages/interface's sirene-stock-index.ts) - never an
 *  unfiltered stock row. */
export interface SireneIndexEntry {
  siren: string;
  denomination: string;
  naf: string;
  effectifBand: EffectifBand;
  etatAdministratif: string;
}

export interface ContactAddress {
  /** Full address, lowercased. */
  value: string;
  localPart: string;
  /** Must equal the site's own domain - see docs/prospect-qualification.md
   *  section 6, "role addresses only, on the company's own domain". */
  domain: string;
}

export type ProspectQualificationFailureReason =
  | 'no-siren-extracted'
  | 'siren-not-in-qualifying-sirene-set'
  | 'domain-suppressed'
  | 'no-qualifying-contact-address';

export interface ProspectQualificationInput {
  sireneMatch: SireneIndexEntry | null;
  siren: string | null;
  domainSuppressed: boolean;
  contactAddress: ContactAddress | null;
}

export interface ProspectQualificationResult {
  qualified: boolean;
  /** Empty iff qualified. Accumulates every failing condition rather than
   *  short-circuiting on the first, since an operator debugging why a
   *  domain didn't qualify benefits from seeing every failing leg. */
  reasons: ProspectQualificationFailureReason[];
}
