/**
 * Decides what a hotel's declared website redirecting somewhere else actually
 * means.
 *
 * Qualification v1 treated every off-domain landing as the same fact and
 * rejected it. Measured against the real catalogue on 2026-08-28 that was
 * wrong for the large majority: of 341 distinct redirect targets, 18 are
 * shared by several establishments - the chains the rule was written for -
 * and 323 are hit exactly once, overwhelmingly a hotel that renamed itself.
 * `lacoorniche-pyla.com` redirecting to `lacoorniche.com` is one hotel, one
 * building, one owner, and one new name.
 *
 * The evidence that separates the two cases is the one trade-off 33 already
 * uses for group routing: a domain several establishments share is a chain's,
 * a domain exactly one establishment holds is that establishment's own. This
 * file applies that rule to redirect targets, which is why it takes a count
 * rather than a name - no string comparison can tell `accor.com` from
 * `lacoorniche.com` without knowing how many hotels arrive there.
 *
 * **The count spans the whole catalogue, not only the redirect rows.**
 * Measured the same day: 11 of the 323 single-hit targets are a domain some
 * other candidate already declares as its own - `mandarinoriental.com`,
 * `tribehotels.com`, `fontenille-collection.com` among them. Those are
 * acquisitions, and counting redirect rows alone would call each one a rename
 * and put two establishments on one domain, which trade-off 33 says can never
 * be an identity key. So a declared owner counts as an establishment at the
 * target exactly as a redirect does.
 *
 * What this deliberately does not try to decide is whether the target is a
 * live hotel site. A single-hit target can still be parked, expired, or
 * for sale. That is not a judgement to make from a domain name: the caller
 * adopts the domain and re-runs the same cheap checks against it, and the
 * existing parked-page detection answers it from the page itself.
 */

import { isHotelVendorHost } from './hotel-vendor-hosts.js';

export type RedirectTargetVerdict =
  /** A booking vendor, site builder, or federation host. Decided by the
   *  curated list rather than by the count, because a vendor host reached by
   *  exactly one hotel is still a vendor host. */
  | 'vendor-or-federation'
  /** More than one establishment arrives at, or already declares, this
   *  domain. Chain evidence, and the case the v1 rule was written for. */
  | 'shared-target'
  /** Exactly one establishment, and nobody declares it. The hotel's own
   *  current address. */
  | 'own-moved-domain';

export interface RedirectTargetInput {
  /** Registrable domain of the redirect target, resolved by the caller with
   *  the public-suffix-backed helper in hotel-domain.ts. */
  target: string;
  /** Establishments at this target across the whole run: every candidate
   *  whose declared site redirects here, plus every candidate that already
   *  declares it as its own domain. One means a rename. */
  establishmentsAtTarget: number;
}

export function classifyRedirectTarget(input: RedirectTargetInput): RedirectTargetVerdict {
  if (isHotelVendorHost(input.target)) return 'vendor-or-federation';
  return input.establishmentsAtTarget > 1 ? 'shared-target' : 'own-moved-domain';
}
