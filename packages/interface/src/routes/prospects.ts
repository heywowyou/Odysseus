import type { Connection } from 'mongoose';
import type { Router } from '../router.js';

/** Plan 013 slice 2 owns this module: the filterable /api/prospects list,
 *  the prospect detail, the review queues, and the manual review actions.
 *  Routes here must call operator-views store helpers, never query
 *  Mongoose models directly. */
export function registerProspectRoutes(router: Router, connection: Connection): void {
  void router;
  void connection;
}
