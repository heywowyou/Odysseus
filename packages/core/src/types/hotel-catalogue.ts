/**
 * Types for milestone 9c's hotel source catalogue: one normalized row per
 * establishment per ingest run, before any identity resolution or website
 * qualification. Kept separate from prospecting.ts, which models the shipped
 * 9a domain-first funnel (AFNIC row in, qualification event out). These rows
 * are the opposite direction: an establishment arrives named and classified,
 * and its usable domain is still unknown.
 *
 * Both source contracts, including literal column headers and the counts they
 * yielded when measured, are recorded in advisor-plans/README.md under
 * "Measured source facts". Two properties of those sources shape this file:
 *
 * 1. Neither source carries SIRET or SIREN, so there is no company-identifier
 *    field here. The identifier arrives later, from the hotel's own published
 *    identification during cheap qualification.
 * 2. Atout France writes missing values as the literal string '-'. Adapters
 *    normalize that to an absent optional field; a '-' must never reach a
 *    stored record, where it would read as real data.
 */

/** Official French tourism classification, one to five stars. Only Atout
 *  France's value is authoritative: DATAtourisme carries a
 *  contributor-supplied rating that is inconsistently populated and must
 *  never be promoted to the campaign gate. */
export type HotelStarRating = 1 | 2 | 3 | 4 | 5;

export type HotelCatalogueSourceName = 'atout-france' | 'datatourisme';

/** Why a source row was not accepted, counted per ingest run so a yield
 *  report can explain a shortfall rather than only state one. */
export type HotelSourceSkipReason =
  'not-a-hotel-typology' | 'missing-establishment-name' | 'malformed-row';

/** One establishment as a single source described it, at one version of that
 *  source. Insert-only: a later ingest run writes a new record rather than
 *  correcting this one, so provenance stays auditable. */
export interface HotelSourceRecord {
  source: HotelCatalogueSourceName;
  /** The source's own stable identifier for this establishment. Atout France
   *  publishes no id column, so its adapter derives a deterministic one from
   *  the fields that identify an establishment; DATAtourisme supplies
   *  URI_ID_du_POI directly. */
  sourceId: string;
  /** Fingerprint of the exact file this row came from, so a record can be
   *  traced back to one download rather than to a source in general. */
  sourceVersion: string;
  retrievedAt: Date;
  /** Licence the row is redistributed under, recorded per row because the two
   *  sources publish under different open licences. */
  licence: string;
  name: string;
  address?: string;
  postcode?: string;
  commune?: string;
  /** The website the source declares. Not yet a usable own domain: this may be
   *  an aggregator link, a parked domain, or a chain's corporate site, all of
   *  which are attrited by cheap qualification, not here. */
  declaredWebsite?: string;
  /** The source's own typology label, kept verbatim for provenance even though
   *  adapters have already filtered on it. */
  accommodationType: string;
  starRating?: HotelStarRating;
  roomCount?: number;
  capacity?: number;
  /** Non-fatal parse observations, e.g. an unrecognised classification string.
   *  A row with warnings is still accepted; warnings exist so a silent
   *  contract drift shows up in the yield report. */
  warnings: string[];
}

/** Counters one adapter pass produced. Reported per source so a yield shortfall
 *  can be attributed rather than guessed at. */
export interface HotelSourceIngestCounters {
  rowsRead: number;
  accepted: number;
  skipped: Record<HotelSourceSkipReason, number>;
}
