import type { ScanOutcomeCode } from './api-types';

/** Plan 060 §5.3: the server owns the display classification. Every row and
 *  job detail carries its code (`outcomeCode`, routes/scan-outcome.ts);
 *  this alias is the dashboard-side name the status labels, KPIs, and
 *  filters are keyed by. The browser only translates stable codes - it
 *  never re-derives report readiness from a job's raw fields.
 */
export type DisplayJobStatus = ScanOutcomeCode;
