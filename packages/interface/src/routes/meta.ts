import type { Router } from '../router.js';
import { sendJson } from '../http-utils.js';
import { getDeployMetadata } from '../config.js';

/** Answers "which build handled this?" (issue: expose build/revision
 *  metadata) - an allowlisted, read-only view of deploy identity. Behind
 *  the same auth guard as every other route; nothing here is secret, but
 *  it is still operator-only, not a public surface. */
export function registerMetaRoutes(router: Router): void {
  router.get('/api/meta', ({ res }) => {
    sendJson(res, 200, getDeployMetadata());
  });
}
