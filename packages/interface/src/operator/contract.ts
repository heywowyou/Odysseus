import { z } from 'zod';

/**
 * Plan 061 operator protocol: the one serialized vocabulary every
 * long-running work owner projects into, the action capability shape, and
 * the typed problem envelope of migrated command routes.
 *
 * Plan 060 adds the two artifact-readiness axes (Plan-059 evidence,
 * Plan-058 report), the human-attention item shape and the composed
 * operator snapshot for control-room surfaces. They are separate axes on
 * purpose: work execution, evidence readiness and report readiness are
 * independent authorities and must never flatten into one status.
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

/** Closed consequence codes an available capability may declare. Exported
 *  like every other closed vocabulary so the dashboard's FR/EN copy can be
 *  proven exhaustive against it (plan 060 §16.1). */
export const CAPABILITY_CONSEQUENCES = [
  'removes-from-queue',
  'stops-at-safe-boundary',
  'deletes-history-only',
  'deletes-audits',
] as const;
const capabilityConsequenceSchema = z.enum(CAPABILITY_CONSEQUENCES);
export type CapabilityConsequence = z.infer<typeof capabilityConsequenceSchema>;

export const actionCapabilitySchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('available'),
    stateToken: z.string(),
    consequenceCode: capabilityConsequenceSchema.optional(),
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

/**
 * Plan 060 §5.1: evidence readiness is the Plan-059 authority, projected.
 * It is deliberately not derivable from job success or finding counts.
 * `legacy-unknown` marks an audit whose stored facts predate the evidence
 * graph; it never means a guessed pass (plan 060 §9.2). States the dormant
 * 059 authority cannot yet produce (approval is fail-closed by
 * construction) stay in the vocabulary so nothing is renamed later.
 */
export const OPERATOR_EVIDENCE_READINESS = [
  'unavailable',
  'legacy-unknown',
  'building',
  'limited',
  'complete',
  'superseded',
] as const;
const operatorEvidenceReadinessSchema = z.enum(OPERATOR_EVIDENCE_READINESS);
export type OperatorEvidenceReadiness = z.infer<typeof operatorEvidenceReadinessSchema>;

/**
 * Plan 060 §5.1: report readiness is the Plan-058 authority, projected.
 * A rendered legacy pair is not quality truth, so it maps to `absent`
 * until the quality pipeline owns the audit; `quality-approved` never
 * implies operator approval, and `awaiting-operator-approval` is reserved
 * for a delivery the operator has explicitly brought to review.
 */
export const OPERATOR_REPORT_READINESS = [
  'absent',
  'producing',
  'needs-attention',
  'quality-approved',
  'awaiting-operator-approval',
  'operator-approved',
  'active',
  'failed',
  'superseded',
] as const;
const operatorReportReadinessSchema = z.enum(OPERATOR_REPORT_READINESS);
export type OperatorReportReadiness = z.infer<typeof operatorReportReadinessSchema>;

/**
 * Plan 060 §8: one durable attention item per condition that truly needs a
 * human decision. It exists only while authoritative state proves the
 * condition; there is no "mark read". Ordinary queued/running/waiting/
 * retrying work and successful completions never produce one, and a
 * quality-approved private bundle for an unsold prospect is not attention.
 */
export const ATTENTION_SEVERITIES = ['action-required', 'blocking'] as const;
const attentionSeveritySchema = z.enum(ATTENTION_SEVERITIES);
export type AttentionSeverity = z.infer<typeof attentionSeveritySchema>;

export const ATTENTION_KINDS = [
  /** The Plan-059 authority needs an operator resolution. */
  'evidence-operator-resolution',
  /** A Plan-058 quality run reached needs-operator-review. */
  'report-quality-review',
  /** A paid delivery was brought to review; its exact quality-approved
   *  bundle awaits explicit approval. */
  'report-delivery-approval',
  /** A run failed in a way automatic retry cannot recover; the operator
   *  chooses the smallest safe recovery. */
  'work-recovery-choice',
] as const;
const attentionKindSchema = z.enum(ATTENTION_KINDS);
export type AttentionKind = z.infer<typeof attentionKindSchema>;

export const operatorAttentionItemSchema = z.object({
  /** Stable for the underlying condition, so history and refreshes agree. */
  attentionId: z.string(),
  kind: attentionKindSchema,
  severity: attentionSeveritySchema,
  subject: z.object({ prospectId: z.string().optional(), auditId: z.string().optional() }),
  /** When the condition first arose; displayed so the operator can tell
   *  fresh work from a lingering decision. */
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Closed reason code owning the copy; the dashboard maps it exhaustively. */
  reasonCode: z.string().optional(),
  /** The one safe next action and its destination. */
  action: z.string(),
  href: z.string(),
});
export type OperatorAttentionItem = z.infer<typeof operatorAttentionItemSchema>;

const operatorSubjectSchema = z.object({
  prospectId: z.string().optional(),
  auditId: z.string().optional(),
  /** Display identity the server vouches for (prospect-owned name/site). */
  siteLabel: z.string().optional(),
});

/** Plan 068 evidence availability view. Limitations describe the scope of
 *  the diagnostic; they are not approval state and never gate a report. */
const operatorEvidenceViewSchema = z.object({
  readiness: operatorEvidenceReadinessSchema,
  limitationCodes: z.array(z.string()).optional(),
  /** Advisory only: the observation predates the detailed diagnostic layer. */
  legacyAdvisory: z.boolean().optional(),
});

/** Plan 060 §5.2 report view, projected from the Plan-058 authority. */
const operatorReportViewSchema = z.object({
  readiness: operatorReportReadinessSchema,
  qualityRunRef: z.string().optional(),
  candidateDigest: z.string().optional(),
  activeDigest: z.string().optional(),
});

/**
 * Plan 060 §5.2: the server-produced operator snapshot. The server is the
 * semantic boundary — the browser translates codes, formats values and
 * chooses presentation, but never re-derives readiness, approval or action
 * safety from raw persistence fields. `stateVersion` commits only to the
 * authoritative inputs of this subject; a command echoing a stale version
 * gets the typed `state-changed` conflict.
 */
export const operatorSnapshotSchema = z.object({
  subject: operatorSubjectSchema,
  work: z.array(operatorWorkViewSchema),
  evidence: operatorEvidenceViewSchema,
  report: operatorReportViewSchema,
  /** Keyed by the closed action codes of the consequential-action
   *  registry (plan 060 §6.1). */
  capabilities: z.record(z.string(), actionCapabilitySchema),
  attention: z.array(operatorAttentionItemSchema),
  stateVersion: z.string(),
});
export type OperatorSnapshot = z.infer<typeof operatorSnapshotSchema>;
