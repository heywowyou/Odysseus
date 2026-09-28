import { clientAddressOf, createSubmissionLimiter } from '@/lib/opt-out';
import { readerFromEnvironment } from '@/lib/reference-audit-object';
import { isValidReferenceAuditToken, writerFromEnvironment } from '@/lib/reference-audit-receipt';
import {
  REFERENCE_AUDIT_REDIRECT_HEADERS,
  resolveReferenceAuditRedirect,
} from '@/lib/reference-audit-redirect';

export const dynamic = 'force-dynamic';

/** Issue #551: a client past this many tracked visits in ten minutes is
 *  still redirected, but writes no receipt. Per serverless instance, a bound
 *  on bursts rather than a global quota, as on the opt-out form. */
const limiter = createSubmissionLimiter(Date.now, { perWindow: 20, windowMs: 10 * 60 * 1000 });

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await context.params;
  if (!isValidReferenceAuditToken(token) || !limiter.allow(clientAddressOf(request))) {
    return new Response(null, { status: 307, headers: REFERENCE_AUDIT_REDIRECT_HEADERS });
  }
  try {
    return await resolveReferenceAuditRedirect({
      token,
      reader: readerFromEnvironment(),
      writer: writerFromEnvironment(),
    });
  } catch {
    return new Response(null, { status: 307, headers: REFERENCE_AUDIT_REDIRECT_HEADERS });
  }
}
