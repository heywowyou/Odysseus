/**
 * SIREN checksum validation. A regex-extracted 9 digit sequence on a
 * mentions-legales page is not evidence of a real SIREN until it passes
 * this check - the LCEN scanner check (packages/scanner/src/checks/
 * mentions-legales.ts) discards anything that fails it rather than
 * surfacing an unvalidated match.
 *
 * Known simplification: a small number of La Poste establishments carry
 * SIRENs that are documented INSEE exceptions to the standard checksum.
 * Not special cased here - flagged rather than silently assumed away.
 */

function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const char = digits[digits.length - 1 - i];
    if (char === undefined) continue;
    let digit = Number(char);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

export function isValidSiren(value: string): boolean {
  const cleaned = value.replace(/\s/g, '');
  if (!/^\d{9}$/.test(cleaned)) return false;
  return luhnValid(cleaned);
}
