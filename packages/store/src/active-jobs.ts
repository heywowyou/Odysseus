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
 * Every operator-launchable job kind maps to exactly one JobType. The kind
 * vocabulary is the hub's, not the queue's: "Light audit" (JobType
 * 'prospecting') is not prospect-scoped when it is created (it takes raw
 * URLs, see routes/scans.ts), so matching it to a prospect while active
 * can only go by hostname, the same domain the prospect's own site lives
 * on.
 */

import type { Connection } from 'mongoose';
import { isHotelVendorHost } from '@odysseus/core';
import { createJobModel, type JobDocument, type JobType } from './schemas/job.schema.js';

export type ProspectActiveJobKind =
  'quick-check' | 'light-audit' | 'prospecting-audit' | 'full-audit';

export interface ProspectActiveJob {
  jobId: string;
  kind: ProspectActiveJobKind;
  status: 'queued' | 'running' | 'needs-input';
  startedAt: Date;
  targetDomain: string;
}

const KIND_BY_JOB_TYPE: Record<JobType, ProspectActiveJobKind | undefined> = {
  prospecting: 'light-audit',
  'outreach-full-scan': 'prospecting-audit',
  'full-audit': 'full-audit',
  'outreach-draft-batch': undefined,
  'outreach-followup-batch': undefined,
};

const JOB_TYPE_BY_KIND: Record<ProspectActiveJobKind, JobType> = {
  'quick-check': 'prospecting',
  'light-audit': 'prospecting',
  'prospecting-audit': 'outreach-full-scan',
  'full-audit': 'full-audit',
};

/** The kinds that own the shared browser/crawler resource against one
 *  host. Quick check is a single-page, non-crawling probe (maxPages: 1)
 *  and deliberately does not compete for this slot: it may run alongside
 *  any of the three below. */
const BROWSER_HEAVY_KINDS: readonly ProspectActiveJobKind[] = [
  'light-audit',
  'prospecting-audit',
  'full-audit',
];

const ACTIVE_STATUSES = ['queued', 'running', 'needs-input'] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/** Matches a bare or www-prefixed hostname at the start of a URL, any path
 *  included - unlike findActiveScanJobForHost's root-only pattern, this
 *  one also has to match a Light audit's `urls` array entries, which are
 *  ordinary page URLs with paths, not just a scan's root siteUrl. */
function hostUrlPattern(hostname: string): RegExp {
  return new RegExp(`^https?://(www\\.)?${escapeRegExp(hostname)}(:\\d+)?(/|\\?|#|$)`, 'iu');
}

function hostnameOf(domain: string): string {
  return new URL(`https://${domain}`).hostname;
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
 *  full-audit), plus any Light audit job whose URL list touches the
 *  prospect's own domain. Newest first. An empty array, never null. */
export async function listActiveJobsForProspect(
  connection: Connection,
  prospectId: string,
  domain: string,
): Promise<ProspectActiveJob[]> {
  const hostname = hostnameOf(domain);
  const jobs = await createJobModel(connection)
    .find({
      status: { $in: ACTIVE_STATUSES },
      $or: [
        { type: 'full-audit', 'options.prospectId': prospectId },
        { type: 'outreach-full-scan', 'options.prospectId': prospectId },
        { type: 'prospecting', urls: hostUrlPattern(hostname) },
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

/** The cross-kind half of the conflict policy alone: any *other*
 *  browser-heavy kind already active on this host, or null. Exported
 *  separately from planProspectJobLaunch so callers with their own
 *  same-kind dedupe logic (
 *  which also needs to exclude the re-validating job itself at claim
 *  time) can still share this one host-level rule instead of
 *  reimplementing it. */
export async function findActiveBrowserHeavyHostConflict(
  connection: Connection,
  kind: ProspectActiveJobKind,
  domain: string,
): Promise<JobDocument | null> {
  if (!BROWSER_HEAVY_KINDS.includes(kind) || isHotelVendorHost(domain)) return null;
  const hostname = hostnameOf(domain);
  const otherKinds = BROWSER_HEAVY_KINDS.filter((candidate) => candidate !== kind).map(
    (candidate) => JOB_TYPE_BY_KIND[candidate],
  );
  return createJobModel(connection)
    .findOne({
      type: { $in: otherKinds },
      status: { $in: ACTIVE_STATUSES },
      $or: [{ siteUrl: hostUrlPattern(hostname) }, { urls: hostUrlPattern(hostname) }],
    })
    .sort({ createdAt: -1 })
    .lean<JobDocument>();
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
 *  2. Otherwise, a browser-heavy kind (Light audit, Prospecting audit,
 *     Full audit) refuses against any *other* browser-heavy kind already
 *     active on the same host - one crawler slot per site at a time -
 *     unless that host is a known shared/vendor platform (issue #216's
 *     own-registrable-domain rule), where two different businesses
 *     legitimately publish on the same host and must not block each
 *     other. Quick check never participates in this check: it is a
 *     single-page, non-crawling probe.
 *  3. A completed, failed, or cancelled job never conflicts: only the
 *     active statuses are searched. */
export async function planProspectJobLaunch(
  connection: Connection,
  params: { kind: ProspectActiveJobKind; prospectId: string; domain: string },
): Promise<ProspectJobLaunchDecision> {
  const { kind, prospectId, domain } = params;
  const hostname = hostnameOf(domain);
  const JobModel = createJobModel(connection);

  const sameKind = await findActiveJobForProspectKind(JobModel, kind, prospectId, domain, hostname);
  if (sameKind !== null) return { allowed: false, conflictingJobId: sameKind.jobId };

  const hostConflict = await findActiveBrowserHeavyHostConflict(connection, kind, domain);
  if (hostConflict !== null) return { allowed: false, conflictingJobId: hostConflict.jobId };

  return { allowed: true };
}

async function findActiveJobForProspectKind(
  JobModel: ReturnType<typeof createJobModel>,
  kind: ProspectActiveJobKind,
  prospectId: string,
  domain: string,
  hostname: string,
): Promise<JobDocument | null> {
  const type = JOB_TYPE_BY_KIND[kind];
  const scopeQuery =
    kind === 'quick-check'
      ? { 'options.prospectId': prospectId, 'options.scanType': 'quick-check' as const }
      : kind === 'light-audit'
        ? { urls: hostUrlPattern(hostname) }
        : { 'options.prospectId': prospectId };
  return JobModel.findOne({
    type,
    status: { $in: ACTIVE_STATUSES },
    ...scopeQuery,
  })
    .sort({ createdAt: -1 })
    .lean<JobDocument>();
}
