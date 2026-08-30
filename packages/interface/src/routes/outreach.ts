import type { Connection } from 'mongoose';
import type { Router } from '../router.js';

/** Plan 013 slice 4 owns this module: pending Gmail draft review, replies
 *  needing review, suppression lookup by entered value, and outcome
 *  actions. Routes here must call operator-views store helpers, never
 *  query Mongoose models directly, and must never add a send or provider
 *  endpoint. */
export function registerOutreachRoutes(router: Router, connection: Connection): void {
  void router;
  void connection;
}
