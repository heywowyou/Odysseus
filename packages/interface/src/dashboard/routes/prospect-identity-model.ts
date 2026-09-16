/**
 * Pure model for the prospect identity fields (issue #289): the SIREN,
 * trading name, and legal name a prospect record carries independently of
 * any scan. The page shows them in the summary and edits them in the
 * record; this module owns the checksum gate and the provenance lines so
 * both stay testable without a server.
 */

import type { DashboardStrings } from '../i18n/types';
import { isValidSiren } from './audit-detail-model';

type DetailCopy = DashboardStrings['prospectHub']['detail'];

export const PROSPECT_IDENTITY_FIELDS = ['siren', 'tradingName', 'legalName'] as const;
export type ProspectIdentityField = (typeof PROSPECT_IDENTITY_FIELDS)[number];

export interface ProspectIdentityValues {
  siren?: string | undefined;
  tradingName?: string | undefined;
  legalName?: string | undefined;
}

/** Client-side checksum gate for the SIREN input: the localized error copy
 *  when the draft is not a valid SIREN, null when it is empty (the field
 *  is optional) or passes. Duplicated-by-value from @odysseus/core's
 *  isValidSiren via audit-detail-model, like every dashboard client-side
 *  check; the server re-validates with the real implementation on save. */
export function sirenDraftError(value: string, invalidCopy: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '' || isValidSiren(trimmed)) return null;
  return invalidCopy;
}

export interface IdentityOriginNote {
  field: ProspectIdentityField;
  /** Localized origin label, e.g. "Found on site" or "Operator". */
  note: string;
}

/** One provenance line per stored identity field whose origin the record
 *  knows (prospect.fieldOrigins). A field with no stored value, or whose
 *  origin predates the fieldOrigins bookkeeping, renders no line: absent
 *  means nothing to attribute, not hidden manual work. An unrecognized
 *  origin code falls back to the dashboard's vocabulary fallback. */
export function identityOriginNotes(
  identity: ProspectIdentityValues,
  fieldOrigins: Record<string, string>,
  copy: DetailCopy,
  fallback: string,
): IdentityOriginNote[] {
  const notes: IdentityOriginNote[] = [];
  for (const field of PROSPECT_IDENTITY_FIELDS) {
    const value = identity[field];
    if (value === undefined || value.trim() === '') continue;
    const origin = fieldOrigins[field];
    if (origin === undefined) continue;
    notes.push({ field, note: copy.originLabels[origin] ?? fallback });
  }
  return notes;
}
