/**
 * Does this domain publish mail exchangers?
 *
 * A public DNS record read through a resolver, and nothing more. It is a fact
 * about the *domain*, never proof that the mailbox exists - establishing that
 * would mean an SMTP conversation, which plan 007 and
 * docs/rules/prospect-qualification.md both forbid outright, along with catch-all
 * classification and verification vendors.
 *
 * A resolver failure is `unknown`, never `no-mx`. The two look similar from
 * here and mean opposite things: one is "this hotel cannot receive email", the
 * other is "the network was busy", and parking a real hotel on the second would
 * be a measurement error the campaign never sees.
 *
 * Its own module behind a one-function interface so the orchestration can be
 * tested without DNS, matching how check-hotel-site.ts is injected into
 * qualify-hotels.ts.
 */

import { resolveMx } from 'node:dns/promises';
import type { MailDomainStatus } from '@odysseus/core';

/** The port the orchestration depends on. */
export type MailDomainVerifier = (domain: string) => Promise<MailDomainStatus>;

/** Node's error code for "the name exists, but has no record of this type",
 *  which is the real "no mail service" answer, as opposed to a lookup that
 *  failed. */
const NO_RECORD_CODES: ReadonlySet<string> = new Set(['ENODATA', 'ENOTFOUND']);

function errorCodeOf(error: unknown): string {
  if (typeof error !== 'object' || error === null) return '';
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : '';
}

export async function verifyMailDomain(domain: string): Promise<MailDomainStatus> {
  try {
    const records = await resolveMx(domain);
    // A single empty-exchange record is how some zones say "no mail here"
    // (RFC 7505's null MX), so a non-empty array is not on its own an answer.
    const usable = records.filter((record) => record.exchange.trim() !== '');
    return usable.length > 0 ? 'has-mx' : 'no-mx';
  } catch (error) {
    return NO_RECORD_CODES.has(errorCodeOf(error)) ? 'no-mx' : 'unknown';
  }
}
