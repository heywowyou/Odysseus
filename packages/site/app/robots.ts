/**
 * robots.txt, milestone 9c plan 009.
 *
 * The site had none at all before this. Preview paths are disallowed as
 * defence in depth and nothing more: the token is what actually keeps a preview
 * private, and a robots rule is a request to well-behaved crawlers, not access
 * control. The route sends `X-Robots-Tag: noindex, nofollow, noarchive` for the
 * same reason twice over.
 *
 * `/exemple-audit` is the public example report page and is crawlable; only
 * its opaque outreach redirects under `/exemple-audit/r/` stay disallowed.
 * The raw PDF at `/exemple-audit.pdf` stays crawlable so its own
 * `X-Robots-Tag: noindex` is seen, which keeps the page, not the file, as
 * the search result.
 */

import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/apercu/', '/exemple-audit/r/'] }],
    host: 'https://www.odysseusaudit.com',
    sitemap: 'https://www.odysseusaudit.com/sitemap.xml',
  };
}
