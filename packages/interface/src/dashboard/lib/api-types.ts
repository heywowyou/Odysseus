import type { z } from 'zod';
import type { AttentionKind, AttentionSeverity } from '../../operator/contract';
import type {
  jobStatusSchema,
  scanJobDetailSchema,
  scanOutcomeCodeSchema,
  scanQueueSchema,
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
export type SeverityRollup = z.infer<typeof severityRollupSchema>;

/** Plan 060 §5.3: the server-declared display classification of a scan row
 *  or job detail. */
export type ScanOutcomeCode = z.infer<typeof scanOutcomeCodeSchema>;

/** One row of GET /api/scans (routes/scans.ts). Field names are the API's
 *  persisted contract, not UI vocabulary; never respell them. */
export type ScanSummary = z.infer<typeof scanSummarySchema>;

/** GET /api/scans/queue (plan 061 §6.2). */
export type ScanQueue = z.infer<typeof scanQueueSchema>;
export type QueuedScan = ScanQueue['jobs'][number];

/** Response of POST /api/scans. */
export interface ScanCreated {
  jobId: string;
}

/** Prospect-only sources returned by GET /api/prospect-hub/todo. `action` is
 * stable code, never ready-made text, so FR/EN copy stays in the client's own
 * i18n table (aTraiter.actions). */
export type TodoRowKind =
  | 'draft'
  | 'reply'
  | 'follow-up'
  | 'first-email'
  | 'audit-input'
  | 'audit-report'
  | 'report-quality-review';
export type TodoRowAction =
  | 'review-draft'
  | 'record-outcome'
  | 'create-follow-up'
  | 'create-first-email'
  | 'review-audit'
  | 'regenerate-report'
  | 'review-report';

/** TodoRow kinds derived from the plan 060 §8 human-attention contract; their
 *  decision copy lives in strings.attention, not in aTraiter.kinds. */
export type AttentionTodoRowKind = Extract<TodoRowKind, AttentionKind>;
/** The classic prospect-work kinds. */
export type ProspectWorkTodoKind = Exclude<TodoRowKind, AttentionTodoRowKind>;

/** Shared columns of GET /api/prospect-hub/todo rows (routes/prospect-hub.ts).
 *  Field names are the API's persisted contract, not UI vocabulary; never
 *  respell them. */
interface TodoRowColumns {
  subject: string;
  action: TodoRowAction;
  href: string;
  since: string;
}

/** A classic prospect-work row. */
export interface ProspectWorkTodoRow extends TodoRowColumns {
  kind: ProspectWorkTodoKind;
}

/** Plan 060 §8: an attention row, carrying the human-attention contract
 *  fields in full. */
export interface AttentionTodoRow extends TodoRowColumns {
  kind: AttentionTodoRowKind;
  attentionId: string;
  severity: AttentionSeverity;
  auditId: string;
  reasonCode: string;
  updatedAt: string;
}

export type TodoRow = ProspectWorkTodoRow | AttentionTodoRow;

/** Response of GET /api/prospect-hub/todo. */
export interface TodoPage {
  rows: TodoRow[];
  /** Plan 060 §8: the server-provided attention count the shell badge
   *  renders. */
  attentionCount: number;
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
