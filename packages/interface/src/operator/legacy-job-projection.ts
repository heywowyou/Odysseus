import type { JobDocument, JobPhase, JobStatus, JobType } from '@odysseus/store';
import type {
  OperatorProgress,
  OperatorWorkState,
  OperatorWorkView,
  WorkOwner,
  WorkPurpose,
} from './contract.js';

/**
 * Plan 061 §5.1: projects a legacy `Job` row into the common operator work
 * vocabulary without rewriting it. The projection reports only what the row
 * durably records: a legacy row has no wait/retry metadata, so a running row
 * is `running`, and a historical failure carries the phase it failed in and
 * an `unknown` category rather than a guessed site-versus-scanner cause.
 */

const STATE_BY_STATUS: Record<JobStatus, OperatorWorkState> = {
  queued: 'queued',
  running: 'running',
  'cancel-requested': 'cancel-requested',
  complete: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
  'needs-input': 'needs-attention',
};

function ownerAndPurpose(job: Pick<JobDocument, 'type' | 'options'>): {
  owner: WorkOwner;
  purpose: WorkPurpose;
} {
  const byType: Record<JobType, { owner: WorkOwner; purpose: WorkPurpose }> = {
    'full-audit': { owner: 'legacy-job', purpose: 'full-scan' },
    'prospecting-audit': { owner: 'legacy-job', purpose: 'full-scan' },
    'outreach-full-scan': { owner: 'legacy-job', purpose: 'full-scan' },
    'quick-check': { owner: 'legacy-job', purpose: 'quick-check' },
    prospecting: {
      owner: 'legacy-job',
      purpose:
        job.options.scanType === 'quick-check'
          ? 'quick-check'
          : job.options.scanType === 'prospecting-audit'
            ? 'full-scan'
            : 'prospecting-batch',
    },
    'outreach-draft-batch': { owner: 'outreach', purpose: 'outreach-drafts' },
    'outreach-followup-batch': { owner: 'outreach', purpose: 'outreach-followups' },
  };
  return byType[job.type];
}

type IssueReason = NonNullable<OperatorWorkView['issue']>['reason'];

const FAILURE_REASON_BY_PHASE: Record<JobPhase, IssueReason> = {
  queued: 'unclassified-failure',
  crawl: 'crawl-failed',
  scan: 'scan-failed',
  'content-scan': 'scan-failed',
  'select-performance': 'scan-failed',
  lighthouse: 'scan-failed',
  scanning: 'scan-failed',
  normalize: 'analysis-failed',
  'analyze-fr': 'analysis-failed',
  'analyze-en': 'analysis-failed',
  'report-fr': 'report-failed',
  'report-en': 'report-failed',
  drafting: 'outreach-failed',
  complete: 'unclassified-failure',
  failed: 'unclassified-failure',
  cancelled: 'unclassified-failure',
  'needs-input': 'unclassified-failure',
};

function progressOf(job: JobDocument): OperatorProgress | undefined {
  if (STATE_BY_STATUS[job.status] !== 'running' && job.status !== 'cancel-requested') {
    return undefined;
  }
  const progress = job.progress ?? {};
  switch (job.phase) {
    case 'crawl':
      // The crawl target is a cap, not a known page count: discovery is an
      // uncapped frontier until it reaches a fixed point.
      return { kind: 'indeterminate', activityCode: 'discovering-pages' };
    case 'scan': {
      const scan = progress.scan;
      return scan !== undefined && scan.target > 0
        ? {
            kind: 'bounded-count',
            current: Math.min(scan.scanned, scan.target),
            total: scan.target,
            unit: 'pages',
          }
        : { kind: 'indeterminate', activityCode: 'processing' };
    }
    case 'content-scan':
    case 'lighthouse': {
      const bucket = job.phase === 'content-scan' ? progress.contentScan : progress.lighthouse;
      return bucket !== undefined && bucket.target > 0
        ? {
            kind: 'bounded-count',
            current: Math.min(bucket.completed, bucket.target),
            total: bucket.target,
            unit: 'pages',
          }
        : { kind: 'indeterminate', activityCode: 'processing' };
    }
    case 'scanning': {
      const rows = job.urlResults ?? [];
      const done = rows.filter((row) => row.status !== 'pending' && row.status !== 'scanning');
      return rows.length > 0
        ? { kind: 'bounded-count', current: done.length, total: rows.length, unit: 'sites' }
        : { kind: 'indeterminate', activityCode: 'processing' };
    }
    case 'analyze-fr':
    case 'analyze-en':
    case 'report-fr':
    case 'report-en':
    case 'drafting':
      return { kind: 'indeterminate', activityCode: 'writing' };
    default:
      return { kind: 'indeterminate', activityCode: 'processing' };
  }
}

function auditIdsOf(job: JobDocument): string[] {
  const ids = new Set<string>();
  if (job.auditId !== undefined) ids.add(job.auditId);
  for (const id of job.auditIds ?? []) ids.add(id);
  for (const row of job.urlResults ?? []) if (row.auditId !== undefined) ids.add(row.auditId);
  return [...ids];
}

function issueOf(job: JobDocument): OperatorWorkView['issue'] {
  if (job.status === 'needs-input') {
    return {
      category: 'operator-input',
      reason: 'identity-confirmation-required',
      retryable: false,
    };
  }
  if (job.status !== 'failed') return undefined;
  const stage = job.failedPhase;
  return {
    category: 'unknown',
    reason: stage === undefined ? 'unclassified-failure' : FAILURE_REASON_BY_PHASE[stage],
    ...(stage === undefined ? {} : { stage }),
    retryable: true,
  };
}

function iso(value: Date | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function projectLegacyJob(
  job: JobDocument,
  context: { queuePosition?: number } = {},
): OperatorWorkView {
  const state = STATE_BY_STATUS[job.status];
  const { owner, purpose } = ownerAndPurpose(job);
  const auditIds = auditIdsOf(job);
  const progress = progressOf(job);
  const issue = issueOf(job);
  const updatedAt =
    iso(job.finishedAt) ?? iso(job.lastHeartbeatAt) ?? iso(job.startedAt) ?? iso(job.createdAt)!;
  const startedAt = iso(job.startedAt);
  const preserved =
    state === 'failed' || state === 'cancelled' || state === 'cancel-requested'
      ? { auditIds, checkpoint: job.runIdentity !== undefined }
      : undefined;
  return {
    workId: job.jobId,
    owner,
    purpose,
    state,
    ...(state === 'queued'
      ? {}
      : { stage: job.status === 'failed' ? (job.failedPhase ?? job.phase) : job.phase }),
    subject: {
      ...(job.options.prospectId === undefined ? {} : { prospectId: job.options.prospectId }),
      ...(auditIds[0] === undefined ? {} : { auditId: auditIds[0] }),
    },
    createdAt: iso(job.createdAt)!,
    ...(startedAt === undefined ? {} : { startedAt }),
    updatedAt,
    ...(progress === undefined ? {} : { progress }),
    ...(issue === undefined ? {} : { issue }),
    ...(preserved === undefined ? {} : { preserved }),
    ...(state === 'queued' && context.queuePosition !== undefined
      ? { queuePosition: context.queuePosition }
      : {}),
  };
}
