/**
 * robots.txt, milestone 9c plan 009.
 *
 * The site had none at all before this. Preview paths are disallowed as
 * defence in depth and nothing more: the token is what actually keeps a preview
 * private, and a robots rule is a request to well-behaved crawlers, not access
 * control. The route sends `X-Robots-Tag: noindex, nofollow, noarchive` for the
 * same reason twice over.
 */

import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/apercu/'] }],
    host: 'https://odysseusaudit.com',
  };
}
