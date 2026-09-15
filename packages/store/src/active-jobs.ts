/**
 * Issue #220: one place that answers "what is currently running for this
 * prospect" and "may this scan-like job start". Before this module, each
 * job-creation route ran its own dedupe check (quick-check had none at
 * all; outreach-full-scan checked only itself via
 * findActiveOutreachFullScanJob; full-audit checked only host-level
 * browser conflicts via findActiveScanJobForHost), so the rules were
 * already drifting and a Quick check job never surfaced anywhere on the
 * hub while it ran.
 *
 * Every operator-launchable job kind maps to a canonical JobType. Historical
 * aliases remain readable below, but new routes must create the canonical
 * `quick-check`, `prospecting-audit`, or `full-audit` row.
 */

import type { Connection } from 'mongoose';
import { isHotelVendorHost } from '@odysseus/core';
import { createJobModel, type JobDocument, type JobType } from './schemas/job.schema.js';

export type ProspectActiveJobKind = 'quick-check' | 'prospecting-audit' | 'full-audit';

export interface ProspectActiveJob {
  jobId: string;
  kind: ProspectActiveJobKind;
  status: 'queued' | 'running' | 'needs-input';
  startedAt: Date;
  targetDomain: string;
}

const KIND_BY_JOB_TYPE: Record<JobType, ProspectActiveJobKind | undefined> = {
  prospecting: undefined,
  'quick-check': 'quick-check',
  'prospecting-audit': 'prospecting-audit',
  'outreach-full-scan': 'prospecting-audit',
  'full-audit': 'full-audit',
  'outreach-draft-batch': undefined,
  'outreach-followup-batch': undefined,
};

const JOB_TYPES_BY_KIND: Record<ProspectActiveJobKind, readonly JobType[]> = {
  'quick-check': ['quick-check', 'prospecting'],
  'prospecting-audit': ['prospecting-audit', 'outreach-full-scan', 'prospecting'],
  'full-audit': ['full-audit'],
};

/** Every scan job can launch the scanner/Chromium stack. The generic
 *  `prospecting` entry is retained here because queued historical batches
 *  must also participate in the conservative host-level politeness check. */
const BROWSER_SCAN_JOB_TYPES: readonly JobType[] = [
  'quick-check',
  'prospecting-audit',
  'full-audit',
  'outreach-full-scan',
  'prospecting',
];

const ACTIVE_STATUSES = ['queued', 'running', 'needs-input'] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/** Matches a bare or www-prefixed hostname at the start of a URL, any path
 *  included - unlike findActiveScanJobForHost's root-only pattern, this
 *  one also has to match ordinary page URLs with paths, not just a scan's
 *  root siteUrl. */
function hostUrlPattern(hostname: string): RegExp {
  return new RegExp(`^https?://(www\\.)?${escapeRegExp(hostname)}(:\\d+)?(/|\\?|#|$)`, 'iu');
}

function hostnameOf(domain: string): string {
  return new URL(`https://${domain}`).hostname;
}

function hostnameForConflict(hostname: string): string {
  const normalized = hostnameOf(hostname);
  return normalized.startsWith('www.') ? normalized.slice('www.'.length) : normalized;
}

function targetDomainOf(job: JobDocument, fallbackDomain: string): string {
  if (job.siteUrl !== undefined) {
    try {
      return new URL(job.siteUrl).hostname;
    } catch {
      // fall through
    }
  }
  const optionsDomain = (job.options as { domain?: unknown }).domain;
  if (typeof optionsDomain === 'string' && optionsDomain !== '') return optionsDomain;
  const firstUrl = job.urls?.[0];
  if (firstUrl !== undefined) {
    try {
      return new URL(firstUrl).hostname;
    } catch {
      // fall through
    }
  }
  return fallbackDomain;
}

function toActiveJob(job: JobDocument, fallbackDomain: string): ProspectActiveJob | null {
  const kind =
    job.type === 'prospecting' && job.options.scanType === 'quick-check'
      ? 'quick-check'
      : job.type === 'prospecting' && job.options.scanType === 'prospecting-audit'
        ? 'prospecting-audit'
        : KIND_BY_JOB_TYPE[job.type];
  if (kind === undefined) return null;
  return {
    jobId: job.jobId,
    kind,
    status: job.status as ProspectActiveJob['status'],
    startedAt: job.startedAt ?? job.createdAt,
    targetDomain: targetDomainOf(job, fallbackDomain),
  };
}

/** Every active job that currently owns part of this prospect's
 *  workflow: its own prospect-linked jobs (quick-check, prospecting-audit,
 *  full-audit). Newest first. An empty array, never null. */
export async function listActiveJobsForProspect(
  connection: Connection,
  prospectId: string,
  domain: string,
): Promise<ProspectActiveJob[]> {
  const jobs = await createJobModel(connection)
    .find({
      status: { $in: ACTIVE_STATUSES },
      $or: [
        { type: 'full-audit', 'options.prospectId': prospectId },
        { type: 'prospecting-audit', 'options.prospectId': prospectId },
        { type: 'outreach-full-scan', 'options.prospectId': prospectId },
        {
          type: 'quick-check',
          'options.prospectId': prospectId,
        },
        {
          type: 'prospecting',
          'options.prospectId': prospectId,
          'options.scanType': { $in: ['quick-check', 'prospecting-audit'] },
        },
      ],
    })
    .sort({ createdAt: -1 })
    .lean<JobDocument[]>();
  const active: ProspectActiveJob[] = [];
  for (const job of jobs) {
    const mapped = toActiveJob(job, domain);
    if (mapped !== null) active.push(mapped);
  }
  return active;
}

/** The host half of the conflict policy. All active scanner jobs, including
 *  Quick Check, occupy the host slot. Shared/vendor hosts allow distinct
 *  attached prospects, but an unattached job (or the same prospect) remains
 *  conservative because tenancy cannot be proven. */
export async function findActiveBrowserHeavyHostConflict(
  connection: Connection,
  _kind: ProspectActiveJobKind,
  domain: string,
  prospectId?: string,
  hostname = domain,
): Promise<JobDocument | null> {
  const targetHostname = hostnameForConflict(hostname);
  const jobs = await createJobModel(connection)
    .find({
      type: { $in: BROWSER_SCAN_JOB_TYPES },
      status: { $in: ACTIVE_STATUSES },
      $or: [{ siteUrl: hostUrlPattern(targetHostname) }, { urls: hostUrlPattern(targetHostname) }],
    })
    .sort({ createdAt: -1 })
    .lean<JobDocument[]>();

  const sharedHost = isHotelVendorHost(domain);
  for (const job of jobs) {
    if (!sharedHost) return job;
    const activeProspectId = job.options.prospectId;
    if (
      prospectId === undefined ||
      activeProspectId === undefined ||
      activeProspectId === prospectId
    ) {
      return job;
    }
  }
  return null;
}

export type ProspectJobLaunchDecision =
  { allowed: true } | { allowed: false; conflictingJobId: string };

/** The one conflict policy every prospect-scoped job-creation route
 *  consults, so refusals never drift between routes.
 *
 *  1. Same prospect, same kind, already active: always refused - two
 *     concurrent runs of the same scan for one prospect are always an
 *     operator mistake, and the plan/authorization gates elsewhere are the
 *     real volume control.
 *  2. Otherwise, any scanner kind refuses against another active scanner on
 *     the same host - one browser slot per site at a time - unless that host
 *     is a known shared/vendor platform (issue #216's own-registrable-domain
 *     rule), where two different attached businesses legitimately publish
 *     on the same host. Quick Check participates in this check too.
 *  3. A completed, failed, or cancelled job never conflicts: only the
 *     active statuses are searched. */
export async function planProspectJobLaunch(
  connection: Connection,
  params: {
    kind: ProspectActiveJobKind;
    prospectId?: string;
    domain: string;
    hostname?: string;
  },
): Promise<ProspectJobLaunchDecision> {
  const { kind, prospectId, domain } = params;
  const JobModel = createJobModel(connection);

  if (prospectId !== undefined) {
    const sameKind = await findActiveJobForProspectKind(JobModel, kind, prospectId);
    if (sameKind !== null) return { allowed: false, conflictingJobId: sameKind.jobId };
  }

  const hostConflict = await findActiveBrowserHeavyHostConflict(
    connection,
    kind,
    domain,
    prospectId,
    params.hostname,
  );
  if (hostConflict !== null) return { allowed: false, conflictingJobId: hostConflict.jobId };

  return { allowed: true };
}

async function findActiveJobForProspectKind(
  JobModel: ReturnType<typeof createJobModel>,
  kind: ProspectActiveJobKind,
  prospectId: string,
): Promise<JobDocument | null> {
  const types = JOB_TYPES_BY_KIND[kind];
  const scopeQuery =
    kind === 'quick-check'
      ? {
          $or: [
            { type: 'quick-check', 'options.prospectId': prospectId },
            {
              type: 'prospecting',
              'options.prospectId': prospectId,
              'options.scanType': 'quick-check' as const,
            },
          ],
        }
      : kind === 'prospecting-audit'
        ? {
            $or: [
              { type: 'prospecting-audit', 'options.prospectId': prospectId },
              { type: 'outreach-full-scan', 'options.prospectId': prospectId },
              {
                type: 'prospecting',
                'options.prospectId': prospectId,
                'options.scanType': 'prospecting-audit' as const,
              },
            ],
          }
        : { type: { $in: types }, 'options.prospectId': prospectId };
  const query = {
    status: { $in: ACTIVE_STATUSES },
    ...scopeQuery,
  } as never;
  return JobModel.findOne(query).sort({ createdAt: -1 }).lean<JobDocument>();
}
