import { z } from 'zod';

/**
 * Plan 061 operator protocol: the one serialized vocabulary every
 * long-running work owner projects into, the action capability shape, and
 * the typed problem envelope of migrated command routes.
 *
 * This file is shared by the server and the dashboard bundle, so it depends
 * on zod only. The server derives its types from these schemas and the
 * dashboard validates responses against the same schemas at runtime; there
 * is no second copy of the vocabulary to drift.
 *
 * Nothing here carries localized prose. The dashboard maps every code to
 * exhaustive FR/EN copy.
 */

export const OPERATOR_WORK_STATES = [
  'queued',
  'running',
  'waiting',
  'retrying',
  'blocked',
  'needs-attention',
  'cancel-requested',
  'failed',
  'completed',
  'cancelled',
  'superseded',
] as const;
const operatorWorkStateSchema = z.enum(OPERATOR_WORK_STATES);
export type OperatorWorkState = z.infer<typeof operatorWorkStateSchema>;

const WORK_OWNERS = ['legacy-job', 'audit-evidence', 'report-quality', 'outreach'] as const;
const workOwnerSchema = z.enum(WORK_OWNERS);
export type WorkOwner = z.infer<typeof workOwnerSchema>;

/** Closed purpose codes, one per kind of operator-visible work. */
const WORK_PURPOSES = [
  'quick-check',
  'full-scan',
  'prospecting-batch',
  'outreach-drafts',
  'outreach-followups',
  'audit-evidence',
  'report-quality',
] as const;
const workPurposeSchema = z.enum(WORK_PURPOSES);
export type WorkPurpose = z.infer<typeof workPurposeSchema>;

const WAIT_REASONS = [
  'host-pacing',
  'rate-limit-backoff',
  'provider-backoff',
  'lease-reacquire',
  'scheduled-retry',
  'resource-capacity',
  'external-dependency',
] as const;
const waitReasonSchema = z.enum(WAIT_REASONS);

const ISSUE_CATEGORIES = [
  'site',
  'network-policy',
  'scanner',
  'provider',
  'storage',
  'evidence-policy',
  'report-quality',
  'operator-input',
  'deployment',
  'unknown',
] as const;
const issueCategorySchema = z.enum(ISSUE_CATEGORIES);

/** Closed issue reason codes. The code, not the category, drives recovery
 *  copy. Legacy failures carry the reason their failed phase supports and
 *  nothing richer; see legacy-job-projection.ts. */
const ISSUE_REASONS = [
  'identity-confirmation-required',
  'crawl-failed',
  'scan-failed',
  'analysis-failed',
  'report-failed',
  'outreach-failed',
  'worker-interrupted',
  'unclassified-failure',
] as const;
const issueReasonSchema = z.enum(ISSUE_REASONS);

const PROGRESS_UNITS = ['pages', 'sites', 'drafts', 'attempts'] as const;

const operatorProgressSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('bounded-count'),
    current: z.number().int().nonnegative(),
    total: z.number().int().positive(),
    unit: z.enum(PROGRESS_UNITS),
  }),
  z.object({ kind: z.literal('bounded-percent'), value: z.number().min(0).max(100) }),
  z.object({
    kind: z.literal('indeterminate'),
    activityCode: z.enum(['discovering-pages', 'processing', 'writing', 'rendering']),
  }),
  z.object({ kind: z.literal('none') }),
]);
export type OperatorProgress = z.infer<typeof operatorProgressSchema>;

export const operatorWorkViewSchema = z.object({
  workId: z.string(),
  owner: workOwnerSchema,
  purpose: workPurposeSchema,
  state: operatorWorkStateSchema,
  stage: z.string().optional(),
  subject: z.object({ prospectId: z.string().optional(), auditId: z.string().optional() }),
  createdAt: z.string(),
  startedAt: z.string().optional(),
  updatedAt: z.string(),
  progress: operatorProgressSchema.optional(),
  wait: z.object({ reason: waitReasonSchema, retryAt: z.string().optional() }).optional(),
  issue: z
    .object({
      category: issueCategorySchema,
      reason: issueReasonSchema,
      stage: z.string().optional(),
      retryable: z.boolean(),
    })
    .optional(),
  preserved: z.object({ auditIds: z.array(z.string()), checkpoint: z.boolean() }).optional(),
  attempt: z
    .object({ current: z.number().int().positive(), max: z.number().optional() })
    .optional(),
  /** 1-based place among waiting queue-backed work; queued work only. */
  queuePosition: z.number().int().positive().optional(),
});
export type OperatorWorkView = z.infer<typeof operatorWorkViewSchema>;

/** Closed blocking reason codes for action capabilities. */
export const CAPABILITY_BLOCK_REASONS = [
  'already-terminal',
  'cancel-already-requested',
  'not-stoppable',
  'work-running',
  'work-finishing',
  'report-production-in-flight',
  'not-queued',
  'queue-too-long',
] as const;
const capabilityBlockReasonSchema = z.enum(CAPABILITY_BLOCK_REASONS);
export type CapabilityBlockReason = z.infer<typeof capabilityBlockReasonSchema>;

const blockingRefSchema = z.object({
  workId: z.string().optional(),
  auditId: z.string().optional(),
  prospectId: z.string().optional(),
});

const CAPABILITY_CONSEQUENCES = [
  'removes-from-queue',
  'stops-at-safe-boundary',
  'deletes-history-only',
  'deletes-audits',
] as const;

export const actionCapabilitySchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('available'),
    stateToken: z.string(),
    consequenceCode: z.enum(CAPABILITY_CONSEQUENCES).optional(),
  }),
  z.object({
    state: z.literal('blocked'),
    stateToken: z.string(),
    reasonCode: capabilityBlockReasonSchema,
    blockingRef: blockingRefSchema.optional(),
  }),
]);
export type ActionCapability = z.infer<typeof actionCapabilitySchema>;

export const PROBLEM_CODES = [
  'state-changed',
  'action-blocked',
  'not-found',
  'invalid-request',
  'storage-unavailable',
] as const;
const problemCodeSchema = z.enum(PROBLEM_CODES);
export type ProblemCode = z.infer<typeof problemCodeSchema>;

export const problemEnvelopeSchema = z.object({
  error: z.object({
    code: problemCodeSchema,
    /** Safe English fallback for logs and old clients; never UI authority. */
    message: z.string(),
    reasonCode: capabilityBlockReasonSchema.optional(),
    diagnosticId: z.string().optional(),
    retryable: z.boolean().optional(),
    blockingRef: blockingRefSchema.optional(),
  }),
});
export type ProblemEnvelope = z.infer<typeof problemEnvelopeSchema>;
