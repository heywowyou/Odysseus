/**
 * INSEE's trancheEffectifsUniteLegale nomenclature, restricted to the
 * question docs/prospect-qualification.md section 3 actually needs
 * answered: does this band mean 10 or more salaried employees. A plain
 * TS constant, not JSON - this is a fixed external nomenclature, not an
 * operator judgment call, matching the existing precedent of
 * SME_EXEMPT_EFFECTIF_CODES in ../compliance/assessObligations.ts (which
 * encodes the same table's under-10 half for a different purpose).
 */

/** Codes 11 and above: 10+ employees. NN (non-employing), 00 (0
 *  employees), 01-03 (1-9 employees) all fail. */
export const EFFECTIF_QUALIFYING_CODES: ReadonlySet<string> = new Set([
  '11',
  '12',
  '21',
  '22',
  '31',
  '32',
  '41',
  '42',
  '51',
  '52',
  '53',
]);

/** A blank/missing code fails, per docs/prospect-qualification.md
 *  section 3: "Empty or missing trancheEffectifs fails the test rather
 *  than counting as unknown-and-worth-scanning." */
export function meetsEffectifThreshold(code: string | null | undefined): boolean {
  if (!code) return false;
  return EFFECTIF_QUALIFYING_CODES.has(code);
}
