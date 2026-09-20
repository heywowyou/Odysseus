import { readerFromEnvironment } from '@/lib/reference-audit-object';
import { isValidReferenceAuditToken, writerFromEnvironment } from '@/lib/reference-audit-receipt';
import {
  REFERENCE_AUDIT_REDIRECT_HEADERS,
  resolveReferenceAuditRedirect,
} from '@/lib/reference-audit-redirect';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await context.params;
  if (!isValidReferenceAuditToken(token)) {
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
