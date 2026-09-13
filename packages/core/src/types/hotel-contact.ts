/**
 * The vocabulary of milestone 9c plan 007's contact stage. In core beside
 * hotel-qualification.ts, and for the same reason: the store schema, the
 * orchestration and the operator report all have to agree about what happened
 * to a hotel, and a TypeScript union checked at every write is a stronger
 * guarantee of that than a Mongoose enum repeated in one place.
 */

import type { ContactSourceKind } from '../prospecting/discover-role-contact.js';

/** What the campaign may now do with this hotel. Only `found` is writable-to;
 *  plan 011 must never draft against any other state. */
export type HotelContactState =
  /** A usable role address on the hotel's own domain, with a deliverable
   *  domain behind it. */
  | 'found'
  /** Nothing usable was published, or nothing could be read. Revisitable: the
   *  site may add a contact page, or come back up. */
  | 'parked'
  /** Addresses were published and none of them may be used. Not a fetch
   *  failure and not an absence, and the distinction is what tells an operator
   *  whether looking again could ever help. */
  | 'rejected'
  /** The domain or the address is on the suppression list. Terminal. */
  | 'suppressed';

export type HotelContactReason =
  | 'role-address-published'
  | 'no-address-published'
  | 'site-unreachable'
  | 'robots-denied'
  /** An address was found, but its domain publishes no MX record, so nothing
   *  sent to it can be delivered. The address is still stored, because an
   *  operator reading a parked row needs to see what was found. */
  | 'no-mail-service'
  | 'named-local-parts-only'
  | 'free-mail-only'
  | 'off-domain-only'
  | 'domain-suppressed'
  | 'address-suppressed';

/**
 * Whether the address's domain publishes mail exchangers. A public DNS record,
 * read through a resolver: it is a fact about the domain and never proof that
 * the mailbox exists. Establishing the latter would mean an SMTP conversation,
 * which docs/rules/prospect-qualification.md and plan 007 both forbid outright.
 *
 * `unknown` is a real and common outcome - a resolver timeout is not evidence
 * of anything - and must never be treated as `no-mx`.
 */
export type MailDomainStatus = 'has-mx' | 'no-mx' | 'unknown';

/** One hotel's contact outcome, as the orchestration decides it and the store
 *  persists it. Flat facts, so the decision is testable without a database. */
export interface HotelContactRecord {
  candidateId: string;
  cohortId: string;
  domain: string;
  state: HotelContactState;
  reason: HotelContactReason;
  /** Present whenever an allowlisted address was found, including on a row
   *  parked for `no-mail-service`. Never a named or free-mail address. */
  address?: string;
  localPart?: string;
  source?: ContactSourceKind;
  sourceUrl?: string;
  mxStatus: MailDomainStatus;
  validatedAt: Date;
}
