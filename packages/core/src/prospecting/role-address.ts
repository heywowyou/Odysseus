/**
 * Role-address local parts, per docs/prospect-qualification.md section 6:
 * "Role addresses only: contact@, info@, commercial@ and equivalents."
 * A plain TS constant, not JSON, unlike the NAF/free-mail lists - this is
 * a small, linguistically stable set closer in kind to
 * ../urls.ts's LEGAL_PATH_PATTERN (a code-owned heuristic) than to a
 * sector-targeting or compliance-domain list that plausibly needs
 * frequent operator tuning. Can move to JSON later if that assumption
 * turns out wrong.
 */

export const ROLE_ADDRESS_LOCAL_PARTS: ReadonlySet<string> = new Set([
  'contact',
  'info',
  'commercial',
  'sales',
  'hello',
  'bonjour',
]);

export function isRoleAddress(localPart: string): boolean {
  return ROLE_ADDRESS_LOCAL_PARTS.has(localPart.toLowerCase());
}
