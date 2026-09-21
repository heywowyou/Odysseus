/**
 * sitemap.xml, added for issue #198.
 *
 * Lists the site's public pages only. `/apercu/[token]` previews are
 * disallowed in robots.ts and must not appear here either: they are private,
 * hash-token-gated documents, not public pages.
 */

import type { MetadataRoute } from 'next';

const ROUTES = [
  '',
  '/offre',
  '/bot',
  '/confidentialite-prospection',
  '/desinscription',
  '/accessibilite',
  '/exemple-audit',
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return ROUTES.map((route) => ({
    url: `https://www.odysseusaudit.com${route}`,
    lastModified,
  }));
}
