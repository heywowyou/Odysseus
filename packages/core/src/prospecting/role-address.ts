/**
 * Role-address local parts, per docs/prospect-qualification.md section 6:
 * "Role addresses only: contact@, info@, commercial@ and equivalents."
 * A plain TS constant, not JSON, unlike the NAF/free-mail lists - this is
 * a small, linguistically stable set closer in kind to
 * ../urls.ts's LEGAL_PATH_PATTERN (a code-owned heuristic) than to a
 * sector-targeting or compliance-domain list that plausibly needs
 * frequent operator tuning. Can move to JSON later if that assumption
 * turns out wrong.
 *
 * Ordered, not a bare set, since milestone 9c plan 007. A hotel routinely
 * publishes several role addresses on one page, and which one is picked
 * decides who reads the email: direction@ is a decision maker, reservation@
 * is frequently an automated booking-engine inbox and accueil@ is a front
 * desk. The order is the preference, best first, and discover-role-contact.ts
 * returns the best published rather than the first encountered. The last four
 * were added for the hotel campaign and deliberately rank below every address
 * that reaches a person who can act on an audit.
 */

export const ROLE_ADDRESS_PREFERENCE: readonly string[] = [
  'direction',
  'commercial',
  'contact',
  'info',
  'sales',
  'hello',
  'bonjour',
  'reception',
  'accueil',
  'reservations',
  'reservation',
];

/** Derived from the ordered list so the two can never disagree about which
 *  local parts are admissible. */
export const ROLE_ADDRESS_LOCAL_PARTS: ReadonlySet<string> = new Set(ROLE_ADDRESS_PREFERENCE);

export function isRoleAddress(localPart: string): boolean {
  return ROLE_ADDRESS_LOCAL_PARTS.has(localPart.toLowerCase());
}

/** Position in the preference order, lower is better. `null` for a local part
 *  that is not a role address at all, which callers must reject rather than
 *  rank. */
export function roleAddressRank(localPart: string): number | null {
  const index = ROLE_ADDRESS_PREFERENCE.indexOf(localPart.toLowerCase());
  return index === -1 ? null : index;
}
