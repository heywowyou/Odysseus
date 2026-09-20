import { resolveReferenceAuditResponse } from '@/lib/reference-audit-response';
import { readerFromEnvironment } from '@/lib/reference-audit-object';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const resolved = await resolveReferenceAuditResponse({ reader: readerFromEnvironment() });
  return new Response(resolved.body, { status: resolved.status, headers: resolved.headers });
}
