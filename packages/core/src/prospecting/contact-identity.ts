/**
 * The two facts every outreach and suppression path reads from a prospect's
 * contact details: which website stands for the prospect, and which domain an
 * email address belongs to. They used to be spelled out at each call site and
 * had drifted, so a malformed address could count as suppressed on one path
 * and not on another.
 */

/** The website marked primary, or the first one when none is. */
export function primaryWebsite<Website extends { primary?: boolean }>(
  websites: readonly Website[],
): Website | undefined {
  return websites.find((website) => website.primary === true) ?? websites[0];
}

/** The lower-cased domain after the last `@`, or undefined when the address
 *  has no local part, no domain, or whitespace in the domain. Callers decide
 *  what a missing domain means; none may treat the whole string as one. */
export function emailDomain(address: string): string | undefined {
  const trimmed = address.trim();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return undefined;
  const domain = trimmed.slice(at + 1);
  return /\s/.test(domain) ? undefined : domain.toLowerCase();
}
