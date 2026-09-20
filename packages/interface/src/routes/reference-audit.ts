import type { Router } from '../router.js';
import { sendJson } from '../http-utils.js';
import { inspectReferenceAuditFreshness } from '../reference-audit/reference-audit-freshness.js';

/** Operator-only freshness status. The route is behind the normal dashboard
 * auth guard; it never exposes the source audit or a bucket credential. */
export function registerReferenceAuditRoutes(router: Router): void {
  router.get('/api/reference-audit/status', async ({ res }) => {
    sendJson(res, 200, await inspectReferenceAuditFreshness());
  });
}
