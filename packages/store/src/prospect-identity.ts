/**
 * Issue #289: prospect-level company identity (SIREN, nom commercial,
 * dénomination sociale) as data that exists before any scan. The pure
 * half of the feature lives here so the fill and validation rules can be
 * tested without Mongo; prospect-hub.ts wires them into the persistence
 * paths.
 *
 * The documented seam for future enrichment: anything that can *detect*
 * identity (today only the scanner's mentions-legales SIREN extraction,
 * which arrives via audit.siteSignals.siren) produces a
 * ProspectIdentityValues and hands it to fillMissingProspectIdentity.
 * This module deliberately performs no network calls and knows no Sirene
 * client; a real registry lookup would be a new detector feeding the same
 * seam, not a change to it.
 */

import { isValidSiren, isValidSiret } from '@odysseus/core';
import type { AuditManualFields, Prospect, ProvenancedField } from '@odysseus/core';

export const PROSPECT_IDENTITY_FIELDS = ['siren', 'tradingName', 'legalName'] as const;
export type ProspectIdentityField = (typeof PROSPECT_IDENTITY_FIELDS)[number];

export type ProspectIdentityValues = Partial<Record<ProspectIdentityField, string | undefined>>;

/** fieldOrigins value stamped on automatically detected identity fields.
 *  'site-discovery' is the existing "found on site" vocabulary; the scan
 *  read the value from the prospect's own website, never from a registry. */
export const DETECTED_IDENTITY_ORIGIN: Prospect['fieldOrigins'][string] = 'site-discovery';

/**
 * Issue #289: normalize an operator-typed SIREN for storage. Accepts the
 * usual printed forms (spaces between digit groups) and a full 14-digit
 * SIRET, whose company half is the SIREN. Returns the 9-digit string, or
 * null when the input is not a checksum-valid SIREN - callers turn null
 * into a rejection, so an invalid value is never stored.
 */
export function normalizeSirenInput(value: string): string | null {
  const digits = value.replace(/[\s.-]/g, '');
  if (digits === '') return null;
  const candidate = isValidSiret(digits) ? digits.slice(0, 9) : digits;
  return isValidSiren(candidate) ? candidate : null;
}

/**
 * Patch-level guard used by create/update: an absent siren passes through
 * untouched (clearing the field stays allowed), a present one must
 * normalize. Throws with the message the API surfaces verbatim.
 */
export function withNormalizedSiren<P extends object>(patch: P): P {
  const raw = (patch as { siren?: unknown }).siren;
  if (raw === undefined) return patch;
  const normalized = normalizeSirenInput(String(raw));
  if (normalized === null) throw new Error('siren must be a valid 9-digit SIREN');
  return { ...patch, siren: normalized };
}

/**
 * The fill-if-absent half of issue #289: from the detected values, keep
 * only the fields the prospect does not already carry. A value an operator
 * typed (or an earlier scan detected) is never replaced here - replacement
 * is always an explicit operator edit. A detected SIREN that fails
 * normalization is dropped rather than stored, whatever else happens.
 */
export function missingProspectIdentityFill(
  current: ProspectIdentityValues,
  detected: ProspectIdentityValues,
): ProspectIdentityValues {
  const fill: ProspectIdentityValues = {};
  for (const field of PROSPECT_IDENTITY_FIELDS) {
    const existing = current[field];
    if (existing !== undefined && existing.trim() !== '') continue;
    const value = detected[field]?.trim();
    if (value === undefined || value === '') continue;
    if (field === 'siren') {
      const normalized = normalizeSirenInput(value);
      if (normalized === null) continue;
      fill[field] = normalized;
      continue;
    }
    fill[field] = value;
  }
  return fill;
}

/**
 * The operator-confirmed subset of an audit's manual identity fields.
 * Audit-level values provenance 'detected' are the scan's own guesses and
 * stay audit-local (the operator confirms them there first, plan 045);
 * only a field a human confirmed is trustworthy enough to seed the
 * prospect record. Values of unexpected shapes are ignored.
 */
export function confirmedIdentityFromManualFields(
  manualFields: AuditManualFields | undefined,
): ProspectIdentityValues {
  const confirmedString = (field: ProvenancedField<string> | undefined): string | undefined =>
    field?.provenance === 'operator' && field.value.trim() !== '' ? field.value : undefined;
  return {
    tradingName: confirmedString(manualFields?.nomCommercial),
    legalName: confirmedString(manualFields?.raisonSociale),
  };
}

/** The audit manual fields a prospect's identity maps onto. */
export interface AuditIdentityValues {
  nomCommercial?: string;
  raisonSociale?: string;
  siren?: string;
}

/**
 * Issue #379: the prospect's identity as the audit sees it, split by
 * provenance. A field the operator typed on the prospect is already human-
 * confirmed and crosses into the audit as confirmed identity, so the report
 * gate never asks for it again. A field any other origin wrote
 * (site-discovery, a directory import) is only a suggestion and keeps its
 * weaker provenance. An invalid SIREN is dropped from both.
 */
export function auditIdentityFromProspect(
  prospect: Pick<Prospect, 'siren' | 'tradingName' | 'legalName' | 'fieldOrigins'>,
): { confirmed: AuditIdentityValues; suggested: AuditIdentityValues } {
  const confirmed: AuditIdentityValues = {};
  const suggested: AuditIdentityValues = {};
  const mapping = [
    ['tradingName', 'nomCommercial'],
    ['legalName', 'raisonSociale'],
    ['siren', 'siren'],
  ] as const;
  for (const [prospectField, auditField] of mapping) {
    const raw = prospect[prospectField]?.trim();
    if (raw === undefined || raw === '') continue;
    const value = prospectField === 'siren' ? normalizeSirenInput(raw) : raw;
    if (value === null) continue;
    const target = prospect.fieldOrigins[prospectField] === 'operator' ? confirmed : suggested;
    target[auditField] = value;
  }
  return { confirmed, suggested };
}
