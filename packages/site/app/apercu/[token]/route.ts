/**
 * The public preview route, milestone 9c plan 009.
 *
 * A Route Handler rather than a page: the stored document is a complete HTML
 * file, and rendering it through `app/layout.tsx` would nest one document
 * inside another. A handler also gets to set the response headers the preview
 * needs, which a page cannot.
 *
 * Nothing here imports `@odysseus/store`, `@odysseus/interface` or Mongoose,
 * and `package-isolation.test.ts` fails the build if that ever stops being
 * true. This code never writes the token to a log: it is the only credential
 * on the document, and a log carrying it would be a list of working links.
 * The hosting platform is outside that guarantee. Vercel's runtime logs
 * record every request's path, token included, for the plan's retention
 * window; the controls that keep that log private are in
 * `docs/rules/outreach-rules.md` section 6bis, "Preview links in hosting logs".
 */

import { resolvePreviewResponse } from '@/lib/preview-response';
import { readerFromEnvironment } from '@/lib/read-preview';

/** Rendered per request. A preview is private and expiring; a cached or
 *  statically-generated answer would outlive both properties. */
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await context.params;
  const resolved = await resolvePreviewResponse({ token, reader: readerFromEnvironment() });
  return new Response(resolved.body, { status: resolved.status, headers: resolved.headers });
}
