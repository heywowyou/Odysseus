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

/** A SIRET is a SIREN plus a 5 digit establishment number (NIC), and the Luhn
 *  check runs over all 14 digits rather than over the two parts separately.
 *  Added for milestone 9c: a SIRET is the only identifier that names one
 *  establishment rather than one company, which is what makes it the strongest
 *  automatic merge key in hotel-identity.ts. The same La Poste exception noted
 *  above applies, and is likewise not special cased. */
export function isValidSiret(value: string): boolean {
  const cleaned = value.replace(/\s/g, '');
  if (!/^\d{14}$/.test(cleaned)) return false;
  return luhnValid(cleaned);
}

/** The company half of a SIRET. Returns null rather than a substring when the
 *  input is not a valid SIRET, so a caller can never derive a SIREN from a
 *  typo and then match on it. */
export function sirenFromSiret(value: string): string | null {
  const cleaned = value.replace(/\s/g, '');
  if (!isValidSiret(cleaned)) return null;
  return cleaned.slice(0, 9);
}
