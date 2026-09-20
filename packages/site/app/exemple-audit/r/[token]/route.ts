import { readerFromEnvironment } from '@/lib/reference-audit-object';
import {
  hashReferenceAuditToken,
  isValidReferenceAuditToken,
  writerFromEnvironment,
} from '@/lib/reference-audit-receipt';

export const dynamic = 'force-dynamic';

const REDIRECT_HEADERS: Record<string, string> = {
  location: '/exemple-audit',
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'x-robots-tag': 'noindex, noarchive',
  'x-content-type-options': 'nosniff',
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await context.params;
  if (isValidReferenceAuditToken(token)) {
    try {
      const current = await readerFromEnvironment().readCurrent();
      if (current !== null) {
        await writerFromEnvironment().write({
          tokenHash: hashReferenceAuditToken(token),
          requestedAt: new Date().toISOString(),
          referenceVersion: current.manifest.referenceReleaseVersion,
        });
      }
    } catch {
      // Attribution is optional. A bucket outage must never break the paid
      // report link promised in the email.
    }
  }
  return new Response(null, { status: 307, headers: REDIRECT_HEADERS });
}
