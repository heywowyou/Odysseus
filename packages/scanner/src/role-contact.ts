/** Reads the role contact address a rendered page publishes, per
 * docs/rules/prospect-qualification.md section 6. The ranking and exclusions
 * live in @odysseus/core's discoverRoleContact, so a named or free-mail
 * address never leaves the page. */

import { discoverRoleContact, type ContactSourceKind } from '@odysseus/core';
import type { Page } from 'playwright';

/** Stored beside the manifest's site signals. Kept out of the core manifest
 * type because that file is part of the findings provenance fingerprint, and
 * a contact hint does not change what normalization writes. */
export interface SiteRoleContact {
  address: string;
  sourceUrl: string;
}

export interface PublishedRoleContact {
  address: string;
  preferenceRank: number;
  sourceUrl: string;
}

function sourceKindFor(url: string): ContactSourceKind {
  const path = new URL(url).pathname.toLowerCase();
  if (path === '/' || path === '') return 'homepage';
  return /mentions|legal/.test(path) ? 'mentions-legales' : 'contact-page';
}

export async function findPublishedRoleContact(
  page: Page,
  url: string,
): Promise<PublishedRoleContact | undefined> {
  const { text, mailtoTargets } = await page.evaluate(() => ({
    text: document.body?.innerText ?? '',
    mailtoTargets: Array.from(document.querySelectorAll('a[href^="mailto:" i]')).map(
      (anchor) => anchor.getAttribute('href') ?? '',
    ),
  }));
  const result = discoverRoleContact(
    [{ kind: sourceKindFor(url), url, text, mailtoTargets }],
    new URL(url).hostname,
  );
  if (result.outcome !== 'found') return undefined;
  return { address: result.address, preferenceRank: result.preferenceRank, sourceUrl: url };
}

/** The best-ranked address across every scanned page; the first page wins a tie. */
export function selectSiteRoleContact(
  contacts: readonly (PublishedRoleContact | undefined)[],
): PublishedRoleContact | undefined {
  let best: PublishedRoleContact | undefined;
  for (const contact of contacts) {
    if (
      contact !== undefined &&
      (best === undefined || contact.preferenceRank < best.preferenceRank)
    )
      best = contact;
  }
  return best;
}
