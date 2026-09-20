import type { ReferenceAuditReader } from './reference-audit-object';
import {
  hashReferenceAuditToken,
  isValidReferenceAuditToken,
  type ReferenceAuditReceipt,
  type ReferenceAuditReceiptWriter,
} from './reference-audit-receipt';

export const REFERENCE_AUDIT_REDIRECT_HEADERS: Readonly<Record<string, string>> = {
  location: '/exemple-audit',
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'x-robots-tag': 'noindex, noarchive',
  'x-content-type-options': 'nosniff',
};

export async function resolveReferenceAuditRedirect(options: {
  token: string;
  reader: ReferenceAuditReader;
  writer: ReferenceAuditReceiptWriter;
  now?: Date;
}): Promise<Response> {
  if (isValidReferenceAuditToken(options.token)) {
    try {
      const current = await options.reader.readCurrent();
      if (current !== null) {
        const receipt: ReferenceAuditReceipt = {
          tokenHash: hashReferenceAuditToken(options.token),
          requestedAt: (options.now ?? new Date()).toISOString(),
          referenceVersion: current.manifest.referenceReleaseVersion,
        };
        await options.writer.write(receipt);
      }
    } catch {
      // The redirect is the product promise; attribution is best effort.
    }
  }
  return new Response(null, { status: 307, headers: REFERENCE_AUDIT_REDIRECT_HEADERS });
}
