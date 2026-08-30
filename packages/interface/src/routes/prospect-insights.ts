import type { Connection } from 'mongoose';
import type { Router } from '../router.js';

/** Plan 013 slice 3 owns this module: prescan, score, evidence, preview
 *  inspection, and vendor aggregate views. Routes here must call
 *  operator-views store helpers, never query Mongoose models directly. */
export function registerProspectInsightRoutes(router: Router, connection: Connection): void {
  void router;
  void connection;
}
