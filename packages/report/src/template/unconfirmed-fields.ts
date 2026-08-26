import type { AuditManualFields } from '@odysseus/core';

/**
 * D8 (2026-08-25, Lagnonu review). A real report went out with the cover
 * reading "Lagnonu - Coti-Chiavari" when the business is Domaine Lagnonu,
 * and an earlier one read "Mariages et evenements prives" - a page topic,
 * not a company. Both values were prefilled by `prefillAuditManualFields`
 * with `provenance: 'detected'`, which the dashboard shows as "detecte, a
 * confirmer" precisely because a detected value is a guess.
 *
 * Detection is doing its job here; the heuristic was measured and improved
 * twice and still lost, because a site's page titles genuinely do not always
 * contain its trading name. The remaining fix is not a better guess, it is
 * refusing to print an unconfirmed one on the cover of a paid deliverable.
 *
 * Scoped to the fields a client actually reads as their own identity. Every
 * other detected field is either invisible on the page or self-evidently
 * approximate, and blocking on those would train the operator to bypass this.
 * Same posture as the SIRET placeholder guard in render-lint.ts: fail loudly
 * and locally rather than ship it, per CLAUDE.md's rule against ever showing
 * a plausible fake value.
 */
const IDENTITY_FIELDS = ['nomCommercial', 'raisonSociale'] as const;

export interface UnconfirmedField {
  field: (typeof IDENTITY_FIELDS)[number];
  value: string;
}

export function findUnconfirmedIdentityFields(
  manualFields: AuditManualFields | undefined,
): UnconfirmedField[] {
  if (!manualFields) return [];
  const unconfirmed: UnconfirmedField[] = [];
  for (const field of IDENTITY_FIELDS) {
    const entry = manualFields[field];
    // An absent field is not a problem: the cover falls back to fixed copy
    // rather than printing a guess. Only a value that IS printed and was
    // never confirmed blocks.
    if (entry === undefined) continue;
    if (entry.provenance !== 'detected') continue;
    unconfirmed.push({ field, value: entry.value });
  }
  return unconfirmed;
}
