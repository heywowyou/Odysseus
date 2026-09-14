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

export const jobTypeSchema = z.enum([
  'full-audit',
  'prospecting',
  'hotel-prescan',
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
  needsInputFields: z.array(scanJobNeedsInputFieldSchema).optional(),
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
  outreachCandidateId: z.string().optional(),
  outreachCandidateName: z.string().optional(),
});

/** Issue #220's active-job projection, carried on the prospect hub
 *  snapshot. */
const prospectActiveJobSchema = z.object({
  jobId: z.string(),
  kind: z.enum(['quick-check', 'light-audit', 'prospecting-audit', 'full-audit']),
  status: z.enum(['queued', 'running', 'needs-input']),
  startedAt: z.string(),
  targetDomain: z.string(),
});

/** Issue #219's typed actionability snapshot. */
const actionabilitySchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('available') }),
  z.object({ state: z.literal('running'), jobId: z.string() }),
  z.object({ state: z.literal('blocked'), reason: z.string() }),
  z.object({ state: z.literal('complete') }),
]);

const prospectHubActionsSchema = z.object({
  refreshProspect: actionabilitySchema,
  runQuickCheck: actionabilitySchema,
  runProspectingAudit: actionabilitySchema,
  runFullAudit: actionabilitySchema,
  publishPreview: actionabilitySchema,
  createFirstEmail: actionabilitySchema,
  createFollowUp: actionabilitySchema,
  recordOutcome: actionabilitySchema,
});

const pipelineFreshnessSchema = z.union([
  z.object({ state: z.literal('missing') }),
  z.object({ state: z.literal('current'), version: z.string(), computedAt: z.string() }),
  z.object({
    state: z.literal('stale'),
    version: z.string(),
    currentVersion: z.string(),
    computedAt: z.string(),
  }),
  z.object({ state: z.literal('refreshing'), jobId: z.string() }),
]);

/** Issue #229: the prospect hub snapshot (GET /api/prospects/:candidateId)
 *  is a large, still-growing composed response (operator identity,
 *  qualification, prescan, score, contact, thread, preview, outcomes,
 *  #220's activeJobs, #219's actions, and more). Rather than transcribe
 *  every nested leaf field - much of it presentational copy with no
 *  control-flow impact - this schema strictly validates the envelope
 *  fields that actually drive primary-action and routing logic
 *  (identity, review/qualification state, the freshness triad, the scan
 *  gates, activeJobs, actions) and leaves the rest as an open object via
 *  passthrough. A malformed shape in the strictly-checked fields - the
 *  ones a wrong render decision or a wrong POST actually depends on -
 *  still fails loudly at the boundary; a malformed shape in an
 *  unvalidated presentational field degrades the same way it always has
 *  (an absent/undefined read), which is the pragmatic scope the issue
 *  itself allows ("do not require every tiny endpoint... establish the
 *  pattern and cover the core surfaces"). */
export const prospectHubSnapshotSchema = z
  .object({
    candidateId: z.string(),
    name: z.string(),
    reviewState: z.enum(['not-required', 'pending', 'accepted', 'rejected']),
    qualificationOutcome: z.string(),
    qualificationFreshness: pipelineFreshnessSchema,
    prescanFreshness: pipelineFreshnessSchema,
    scoreFreshness: pipelineFreshnessSchema,
    outreachScan: z
      .object({
        canStart: z.boolean(),
        refusal: z.string().optional(),
        jobId: z.string().nullable().optional(),
      })
      .optional(),
    outreachScanJobId: z.string().nullable().optional(),
    fullAudit: z
      .object({
        canStart: z.boolean(),
        refusal: z.string().optional(),
        jobId: z.string().optional(),
      })
      .optional(),
    activeJobs: z.array(prospectActiveJobSchema).optional(),
    actions: prospectHubActionsSchema.optional(),
  })
  .passthrough();

/** GET /api/prospects, one row and its paginated envelope. Strictly
 *  validates identity/state fields the list filters and links by; other
 *  presentational row fields pass through unvalidated, same scoping
 *  rationale as prospectHubSnapshotSchema above. */
const prospectListRowSchema = z
  .object({
    candidateId: z.string(),
    name: z.string(),
    identityStatus: z.string(),
    reviewState: z.enum(['not-required', 'pending', 'accepted', 'rejected']),
    qualificationOutcome: z.string(),
  })
  .passthrough();

const selectionCohortFactsSchema = z
  .object({
    cohortId: z.string(),
    scoringVersion: z.string(),
    computedAt: z.string(),
    populationSize: z.number(),
    selectedCount: z.number(),
    abilityCutoff: z.number(),
    brokennessCutoff: z.number(),
  })
  .passthrough();

export const prospectListResponseSchema = z.object({
  rows: z.array(prospectListRowSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  selection: selectionCohortFactsSchema.nullable(),
  selectedCount: z.number(),
  catalogueTotal: z.number(),
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
