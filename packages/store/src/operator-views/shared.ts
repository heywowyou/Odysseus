/**
 * Shared pagination contract for the operator view families.
 *
 * Two constraints bind every function in the operator-views module.
 *
 * First, each returned shape is an explicitly picked projection, never a raw
 * document. Nothing may carry a message body or subject, an email address or
 * role address, a contact address material (`address`, `localPart`,
 * `sourceUrl`), a suppression or preview token hash, or a raw payload such as
 * a qualification's `siteFacts`. State is expressed as ids, enum states,
 * counts, booleans, and dates. The point is not that operators are untrusted;
 * it is that a view which cannot hold the data cannot leak it by accident
 * when a new field is rendered.
 *
 * Second, pagination is mandatory on every list function. A caller cannot ask
 * for "all": every list takes a `{ limit, offset }` options object, defaults
 * to 50 rows, clamps the limit at 200, and sorts with a unique tiebreaker so
 * repeated calls and offset windows never repeat or skip a row. The funnel
 * holds tens of thousands of candidates; a response that grew with the
 * catalogue would be the one unbounded query in the interface.
 */

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 200;
/** How many draft attempts one thread's detail view carries. Metadata only;
 *  bounded so a thread cannot grow a response. */
export const THREAD_DRAFT_HISTORY_LIMIT = 20;

export interface OperatorViewPageOptions {
  limit?: number;
  offset?: number;
}

export interface OperatorViewPage<Row> {
  rows: Row[];
  total: number;
  limit: number;
  offset: number;
}

export interface PageBounds {
  limit: number;
  offset: number;
  skip: number;
}

/** Clamps rather than rejects: a route passing a larger page size gets a
 *  bounded page, not an error, which keeps one hard cap instead of one
 *  cap per caller. */
export function pageBounds(options: OperatorViewPageOptions): PageBounds {
  const requested = options.limit ?? DEFAULT_PAGE_LIMIT;
  const limit = Math.min(Math.max(Math.trunc(requested), 1), MAX_PAGE_LIMIT);
  const offset = Math.max(Math.trunc(options.offset ?? 0), 0);
  return { limit, offset, skip: offset };
}
