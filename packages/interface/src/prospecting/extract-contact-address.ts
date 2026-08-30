/**
 * Contact-address extraction for the AFNIC funnel, per
 * docs/rules/prospect-qualification.md section 6: role addresses only, on the
 * company's own domain, never a named-individual address.
 *
 * Since milestone 9c plan 007 this is an adapter, not an implementation. The
 * decision lives in @odysseus/core's discoverRoleContact, so this funnel and
 * the hotel campaign cannot drift about what counts as a usable address - the
 * same reasoning suppression-hash.ts records for sharing its normalization
 * between the write and read paths.
 *
 * Two consequences of the move, both deliberate. A page listing several role
 * addresses now yields the best-ranked one rather than the first printed, which
 * is what the ordered allowlist is for. And an address on a subdomain of the
 * company's own registrable domain is now accepted, where exact host equality
 * used to reject it; `contact@mail.example.fr` is the company's own mailbox by
 * any honest reading of the rule.
 *
 * The typed absence discoverRoleContact returns is collapsed back to `null`
 * here because qualifyProspect's contract takes a nullable address. The reason
 * is not lost to the campaign that needs it: the hotel path reads the union
 * directly.
 */

import { discoverRoleContact } from '@odysseus/core';
import type { ContactAddress } from '@odysseus/core';

export function extractContactAddress(
  texts: readonly string[],
  siteDomain: string,
): ContactAddress | null {
  const result = discoverRoleContact(
    texts.map((text) => ({
      kind: 'homepage' as const,
      // This funnel stores no provenance, so the site URL stands in for it.
      url: `https://${siteDomain}/`,
      text,
    })),
    siteDomain,
  );

  if (result.outcome !== 'found') return null;
  return { value: result.address, localPart: result.localPart, domain: result.domain };
}
