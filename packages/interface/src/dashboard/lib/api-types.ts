import type { z } from 'zod';
import type {
  jobStatusSchema,
  jobTypeSchema,
  scanJobDetailSchema,
  scanSummarySchema,
  scanUrlResultSchema,
  severityRollupSchema,
} from './api-schemas.js';

/** Issue #229: these types are inferred from the zod schemas in
 *  api-schemas.ts, which is the single source of truth fetchJsonValidated
 *  actually checks a response against - editing a field here without
 *  editing the schema is not possible, since there is nothing here to
 *  edit independently. */
export type JobStatus = z.infer<typeof jobStatusSchema>;
/** Job types the dashboard can be asked to display. 'outreach-full-scan'
 *  is the prospect-linked full scan the hub starts; it is a display
 *  union only, the API names are never respelled. */
export type JobType = z.infer<typeof jobTypeSchema>;

export type SeverityRollup = z.infer<typeof severityRollupSchema>;

/** One row of GET /api/scans (routes/scans.ts). Field names are the API's
 *  persisted contract, not UI vocabulary; never respell them. */
export type ScanSummary = z.infer<typeof scanSummarySchema>;

/** Response of POST /api/scans. */
export interface ScanCreated {
  jobId: string;
}

/** The four sources GET /api/todo composes into one table (plan 045 stage
 *  3.3). `action` is a stable code, never ready-made text, so FR/EN copy
 *  stays in the client's own i18n table (aTraiter.actions). */
export type TodoRowKind = 'draft' | 'reply' | 'hotel' | 'audit';
export type TodoRowAction =
  | 'review-draft'
  | 'review-reply'
  | 'review-hotel'
  | 'confirm-identity'
  | 'generate-pdfs'
  | 'approve-pair';

/** One row of GET /api/todo (routes/todo.ts). Field names are the API's
 *  persisted contract, not UI vocabulary; never respell them. */
export interface TodoRow {
  kind: TodoRowKind;
  subject: string;
  action: TodoRowAction;
  href: string;
  since: string | null;
}

/** Response of GET /api/todo. */
export interface TodoPage {
  rows: TodoRow[];
}

/** One per-URL row of a prospecting job (store's UrlResult). status stays
 *  a plain string so a worker status the page does not know degrades to a
 *  neutral in-flight badge instead of breaking the page. */
export type ScanUrlResult = z.infer<typeof scanUrlResultSchema>;

/** Response of GET /api/scans/:jobId: the full job document (store's
 *  getJob, served verbatim by routes/scans.ts), narrowed to the fields the
 *  live progress page reads. phase stays a plain string so a pipeline
 *  phase without dashboard copy renders as its raw value.
 *
 *  siteUrl and createdAt are served by the same route (it sends the job
 *  document verbatim) and are read here so the progress page can name the
 *  site it is scanning; both stay optional because a prospecting job has a
 *  URL list rather than one site. */
export type ScanJobDetail = z.infer<typeof scanJobDetailSchema>;
