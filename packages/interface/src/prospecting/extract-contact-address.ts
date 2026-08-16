/**
 * Contact-address extraction, per docs/prospect-qualification.md section
 * 6: role addresses only, on the company's own domain, never a
 * named-individual address. Named-individual addresses are never
 * captured at all, by construction of the role-only local-part
 * allowlist, not filtered post-hoc - the strongest form of "not
 * collected, stored or used."
 */

import { isFreeMailDomain, isRoleAddress } from '@odysseus/core';
import type { ContactAddress } from '@odysseus/core';

const EMAIL_PATTERN = /\b([a-z0-9._%+-]+)@([a-z0-9.-]+\.[a-z]{2,})\b/gi;

export function extractContactAddress(texts: readonly string[], siteDomain: string): ContactAddress | null {
  const normalizedSiteDomain = siteDomain.toLowerCase();

  for (const text of texts) {
    for (const match of text.matchAll(EMAIL_PATTERN)) {
      const localPart = match[1]?.toLowerCase();
      const domain = match[2]?.toLowerCase();
      if (!localPart || !domain) continue;
      if (domain !== normalizedSiteDomain) continue;
      if (!isRoleAddress(localPart)) continue;
      if (isFreeMailDomain(domain)) continue; // redundant given own-domain, kept explicit and testable

      return { value: `${localPart}@${domain}`, localPart, domain };
    }
  }

  return null;
}
