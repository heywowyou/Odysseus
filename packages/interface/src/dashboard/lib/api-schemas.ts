import { z } from 'zod';

/**
 * Issue #229: runtime schemas for the dashboard's critical operator
 * surfaces. Each schema is the single source of truth for its response
 * shape - the corresponding TypeScript type in api-types.ts is derived from
 * it via z.infer, so a field a route response adds or narrows cannot drift
 * from what the client actually validates: editing the type here always
 * means editing the schema in the same place.
 *
 * Not every dashboard endpoint is covered (the issue explicitly scopes this
 * to the highest-value surfaces): a route not listed here still goes
 * through the plain fetchJson cast, unchanged.
 */

export const jobStatusSchema = z.enum([
  'queued',
  'running',
  'complete',
  'failed',
  'cancelled',
  'needs-input',
]);

const jobTypeSchema = z.enum([
  'full-audit',
  'prospecting',
  'quick-check',
  'prospecting-audit',
  'outreach-full-scan',
]);

export const severityRollupSchema = z.object({
  critical: z.number(),
  serious: z.number(),
  moderate: z.number(),
  minor: z.number(),
});

const scanJobProgressSchema = z.object({
  crawl: z
    .object({
      visited: z.number(),
      target: z.number(),
      etaMs: z.number().optional(),
      // Issue #223: the instant etaMs was computed (serialized as an ISO
      // string over JSON), so the dashboard can age a countdown down
      // between polls instead of showing a frozen snapshot.
      etaCalculatedAt: z.string().optional(),
    })
    .optional(),
  scan: z
    .object({
      scanned: z.number(),
      target: z.number(),
      etaMs: z.number().optional(),
      etaCalculatedAt: z.string().optional(),
    })
    .optional(),
  contentScan: z
    .object({
      completed: z.number(),
      target: z.number(),
      etaMs: z.number().optional(),
      etaCalculatedAt: z.string().optional(),
    })
    .optional(),
  lighthouse: z
    .object({
      completed: z.number(),
      target: z.number(),
      etaMs: z.number().optional(),
      etaCalculatedAt: z.string().optional(),
    })
    .optional(),
  continuationGuard: z
    .object({ omittedUrlCount: z.number(), omittedFamilyCount: z.number() })
    .optional(),
  message: z.string().optional(),
});

export const scanUrlResultSchema = z.object({
  url: z.string(),
  status: z.string(),
  auditId: z.string().optional(),
  error: z.string().optional(),
});

const scanJobNeedsInputFieldSchema = z.object({
  field: z.string(),
  value: z.string(),
});

/** GET /api/scans/:jobId. */
export const scanJobDetailSchema = z.object({
  jobId: z.string(),
  type: jobTypeSchema,
  status: jobStatusSchema,
  phase: z.string(),
  siteUrl: z.string().optional(),
  createdAt: z.string().optional(),
  auditId: z.string().optional(),
  auditIds: z.array(z.string()).optional(),
  urlResults: z.array(scanUrlResultSchema).optional(),
  progress: scanJobProgressSchema,
  error: z.string().optional(),
  failedPhase: z.string().optional(),
  needsInputFields: z.array(scanJobNeedsInputFieldSchema).optional(),
  prospectId: z.string().optional(),
});

/** GET /api/scans, one row. */
export const scanSummarySchema = z.object({
  jobId: z.string(),
  type: jobTypeSchema,
  status: jobStatusSchema,
  phase: z.string(),
  siteUrl: z.string().optional(),
  urls: z.array(z.string()).optional(),
  createdAt: z.string(),
  finishedAt: z.string().optional(),
  auditId: z.string().optional(),
  auditIds: z.array(z.string()).optional(),
  severityRollup: severityRollupSchema.optional(),
  needsReview: z.boolean().optional(),
  /** Issue #386: the phase a failed job was running when it failed. */
  failedPhase: z.string().optional(),
  /** Issue #382: typed operator-input fields exist on the job. */
  awaitsInput: z.boolean().optional(),
  prospectId: z.string().optional(),
  /** Present on queued and running rows linked to a prospect, for the scan
   *  queue's labels. */
  prospectName: z.string().optional(),
});

/** GET /api/audits/:auditId. Strictly validates the identity/lifecycle
 *  fields the page's control flow depends on (which audit, its stage in
 *  scanned/analysed/rendered/approved, severity totals shown in the
 *  header); the large nested findings body passes through unvalidated,
 *  same scoping rationale as prospectHubSnapshotSchema above. */
export const auditDetailSchema = z
  .object({
    auditId: z.string(),
    siteUrl: z.string(),
    lifecycle: z.enum(['scanned', 'analysed', 'rendered', 'approved']),
    severityRollup: severityRollupSchema,
    findingsStale: z.boolean(),
  })
  .passthrough();
