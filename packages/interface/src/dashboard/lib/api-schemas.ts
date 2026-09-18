import { z } from 'zod';
import { actionCapabilitySchema, operatorWorkViewSchema } from '../../operator/contract';

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
  'cancel-requested',
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
  crawlExclusions: z
    .object({
      discoveryOnly: z.number(),
      externalRedirect: z.number(),
      nonHtml: z.number(),
      httpError: z.number(),
      error: z.number(),
    })
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

/** Plan 061 §8.1: server-derived row actions, each with the state token its
 *  command must present. */
const jobCapabilitiesSchema = z.object({
  cancel: actionCapabilitySchema,
  delete: actionCapabilitySchema,
});

/** Plan 060 §5.3: the server's closed display classification for a scan.
 *  `queued` / `running` / `cancel-requested` / `complete` / `failed` /
 *  `cancelled` / `needs-input` are the job's run state verbatim;
 *  `needs-input` also covers a failed job carrying typed operator-input
 *  fields (issue #382), and `report-issue` marks a scan that succeeded but
 *  whose client report is broken or no longer ready (issues #386, #389).
 *  The dashboard translates these codes; it never re-derives them from raw
 *  persistence fields. */
export const scanOutcomeCodeSchema = z.enum([
  'queued',
  'running',
  'cancel-requested',
  'complete',
  'failed',
  'cancelled',
  'needs-input',
  'report-issue',
]);

/** The report step a `report-issue` failure stopped in; null when the scan
 *  is not a report-stage failure. `unknown` is a legacy row failed before
 *  the job kept its failed phase. */
const scanReportFailureStageSchema = z.enum(['writing', 'pdf', 'unknown']);

/** GET /api/scans/:jobId. */
export const scanJobDetailSchema = z.object({
  jobId: z.string(),
  type: jobTypeSchema,
  status: jobStatusSchema,
  /** Required so a server that stops declaring the display classification
   *  fails validation loudly instead of silently pushing the derivation
   *  back into the browser (plan 060 §5.3). */
  outcomeCode: scanOutcomeCodeSchema,
  /** Non-null exactly when outcomeCode is 'report-issue'. */
  reportFailureStage: scanReportFailureStageSchema.nullable(),
  /** The stored failure is a crawl-coverage-gate stop; the failure card
   *  links the remedy the message names instead of parsing the sentence. */
  coverageGateBlocked: z.boolean(),
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
  work: operatorWorkViewSchema,
  capabilities: jobCapabilitiesSchema,
});

/** GET /api/scans, one row. */
export const scanSummarySchema = z.object({
  jobId: z.string(),
  type: jobTypeSchema,
  status: jobStatusSchema,
  /** Required so a server that stops declaring the display classification
   *  fails validation loudly instead of silently pushing the derivation
   *  back into the browser (plan 060 §5.3). */
  outcomeCode: scanOutcomeCodeSchema,
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
  /** Issue #389: the scan completed but its audit's client reports are not
   *  ready now, for example after a failed regeneration. */
  reportNotReady: z.boolean().optional(),
  prospectId: z.string().optional(),
  /** Present on rows linked to a prospect: the scan queue's labels and the
   *  Audits table's hotel link. */
  prospectName: z.string().optional(),
  capabilities: jobCapabilitiesSchema,
});

/** GET /api/scans/queue: waiting scans in durable claim order. */
export const scanQueueSchema = z.object({
  queueRevision: z.string(),
  truncated: z.boolean(),
  jobs: z.array(
    z.object({
      jobId: z.string(),
      type: jobTypeSchema,
      siteUrl: z.string().optional(),
      prospectId: z.string().optional(),
      prospectName: z.string().optional(),
      createdAt: z.string(),
      position: z.number().int().positive(),
      options: z.array(z.string()),
      cancel: actionCapabilitySchema,
    }),
  ),
});

/** GET /api/audits/:auditId `evidence` (Plan 059 step 37): the full audit's
 *  evidence-quality summary. Validated because the page gates the Plan 058
 *  bundle approval on the approval state it carries. */
const auditEvidenceQualitySchema = z.object({
  verdict: z.enum([
    'reportable-complete',
    'reportable-with-known-limitations',
    'needs-operator-review',
    'failed',
  ]),
  approval: z.enum(['approved', 'stale', 'missing']),
  approvalDigest: z.string().optional(),
  blockingCodes: z.array(z.string()),
  blockingCounts: z.record(z.string(), z.number().int().nonnegative()),
  limitationCount: z.number().int().nonnegative(),
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
    evidence: auditEvidenceQualitySchema.optional(),
  })
  .passthrough();
