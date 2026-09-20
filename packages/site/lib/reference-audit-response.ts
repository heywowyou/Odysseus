import type { ReferenceAuditReader } from './reference-audit-object';

export interface ReferenceAuditResponse {
  status: 200 | 503;
  body: Uint8Array | string;
  headers: Record<string, string>;
}

export const REFERENCE_AUDIT_HEADERS: Readonly<Record<string, string>> = {
  'content-type': 'application/pdf',
  'content-disposition': 'inline; filename="exemple-audit-odysseus.pdf"',
  'x-robots-tag': 'noindex, noarchive',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cache-control': 'public, max-age=60, stale-while-revalidate=300',
};

const UNAVAILABLE_HEADERS: Readonly<Record<string, string>> = {
  'content-type': 'text/plain; charset=utf-8',
  'x-robots-tag': 'noindex, noarchive',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
};

export async function resolveReferenceAuditResponse(options: {
  reader: ReferenceAuditReader;
}): Promise<ReferenceAuditResponse> {
  try {
    const current = await options.reader.readCurrent();
    if (current === null) {
      return {
        status: 503,
        body: 'The reference audit is temporarily unavailable.\n',
        headers: { ...UNAVAILABLE_HEADERS },
      };
    }
    return { status: 200, body: current.pdf, headers: { ...REFERENCE_AUDIT_HEADERS } };
  } catch {
    // Do not expose bucket/provider details or source lineage through a public
    // error body. The operator sees the deployment/readiness failure in logs.
    return {
      status: 503,
      body: 'The reference audit is temporarily unavailable.\n',
      headers: { ...UNAVAILABLE_HEADERS },
    };
  }
}
