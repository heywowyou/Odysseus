/**
 * The merged operator to-do table (plan 045 stage 3.3): one composed read
 * behind the dashboard's à traiter inbox, replacing four separately polled
 * endpoints and their own short lists. Every row names one concrete action
 * on one subject; the table carries no pagination because each source is
 * already a short operator queue, not a workspace.
 */

import {
  getAuditManualFields,
  getHotelCandidatesByIds,
  getLatestReportApproval,
  listJobs,
  listOperatorProspects,
  listOutreachReviewDrafts,
  listReportLanguages,
  listRepliesNeedingReview,
} from '@odysseus/store';
import type { Connection } from 'mongoose';
import { findUnconfirmedIdentityFields } from '@odysseus/report';
import type { Router } from '../router.js';
import { sendJson } from '../http-utils.js';
import { auditTodoAction, isNeedsInputJob } from './todo-model.js';

/** Every source this table draws from fetches a bounded page; the queues
 *  behind it are meant to stay short, so this is generous headroom rather
 *  than a workspace-sized limit. */
const SOURCE_LIMIT = 50;

/** The bounded recent-jobs window the scans list itself reads (plan 040);
 *  reused here so the audit rows below cost this route nothing the Scans
 *  page does not already pay. */
const RECENT_JOBS_LIMIT = 200;

type TodoRowKind = 'draft' | 'reply' | 'hotel' | 'audit';

interface TodoRow {
  kind: TodoRowKind;
  /** The hotel or site name the row is about; a raw identifier only when
   *  nothing better resolves. */
  subject: string;
  /** A stable action code the dashboard maps to localized copy - never a
   *  ready-made sentence, so FR/EN stay in the client's own i18n tables. */
  action: string;
  href: string;
  /** ISO date the row's own timestamp resolves to; null when the source
   *  carries none, sorted after every timestamped row. */
  since: string | null;
}

function hostnameOf(siteUrl: string): string {
  try {
    return new URL(siteUrl).hostname;
  } catch {
    return siteUrl;
  }
}

/** Newest first; a row with no timestamp at all sorts after every row that
 *  has one instead of before (a missing date is not the newest date). */
function compareBySinceDesc(a: TodoRow, b: TodoRow): number {
  if (a.since === null && b.since === null) return 0;
  if (a.since === null) return 1;
  if (b.since === null) return -1;
  return Date.parse(b.since) - Date.parse(a.since);
}

async function auditRows(connection: Connection): Promise<TodoRow[]> {
  const jobs = (await listJobs(connection, RECENT_JOBS_LIMIT)).filter(isNeedsInputJob);
  const candidateIds = [
    ...new Set(
      jobs.map((job) => job.outreachCandidateId).filter((id): id is string => id !== undefined),
    ),
  ];
  const candidates = await getHotelCandidatesByIds(connection, candidateIds);
  const candidateNames = new Map(
    candidates.map((candidate) => [candidate.candidateId, candidate.name]),
  );

  const rows = await Promise.all(
    jobs
      .filter((job): job is typeof job & { auditId: string } => job.auditId !== undefined)
      .map(async (job): Promise<TodoRow | null> => {
        const [manualFields, reportLanguages, approval] = await Promise.all([
          getAuditManualFields(connection, job.auditId),
          listReportLanguages(connection, job.auditId),
          getLatestReportApproval(connection, job.auditId),
        ]);
        const action = auditTodoAction({
          hasUnconfirmedIdentityFields: findUnconfirmedIdentityFields(manualFields).length > 0,
          hasNoReportLanguages: reportLanguages.length === 0,
          hasNoApproval: approval === null,
        });
        if (action === null) return null;
        const subject =
          (job.outreachCandidateId !== undefined
            ? candidateNames.get(job.outreachCandidateId)
            : undefined) ?? (job.siteUrl !== undefined ? hostnameOf(job.siteUrl) : job.jobId);
        return {
          kind: 'audit',
          subject,
          action,
          href: `/audits/${encodeURIComponent(job.auditId)}`,
          since: job.createdAt.toISOString(),
        };
      }),
  );
  return rows.filter((row): row is TodoRow => row !== null);
}

export function registerTodoRoutes(router: Router, connection: Connection): void {
  router.get('/api/todo', async ({ res }) => {
    const [drafts, replies, hotels, audits] = await Promise.all([
      listOutreachReviewDrafts(connection, { limit: SOURCE_LIMIT, offset: 0 }),
      listRepliesNeedingReview(connection, { limit: SOURCE_LIMIT, offset: 0 }),
      listOperatorProspects(connection, { queue: 'join-review', limit: SOURCE_LIMIT, offset: 0 }),
      auditRows(connection),
    ]);

    const rows: TodoRow[] = [
      ...drafts.rows.map((draft): TodoRow => ({
        kind: 'draft',
        subject: draft.hotelName ?? draft.candidateId,
        action: 'review-draft',
        href: `/prospects/${encodeURIComponent(draft.candidateId)}#hub-emails`,
        since: draft.createdAt.toISOString(),
      })),
      ...replies.rows.map((reply): TodoRow => ({
        kind: 'reply',
        subject: reply.hotelName ?? reply.candidateId,
        action: 'review-reply',
        href: `/prospects/${encodeURIComponent(reply.candidateId)}#hub-outcome`,
        since: reply.reviewDetectedAt.toISOString(),
      })),
      ...hotels.rows.map((hotel): TodoRow => ({
        kind: 'hotel',
        subject: hotel.name,
        action: 'review-hotel',
        href: `/prospects/${encodeURIComponent(hotel.candidateId)}`,
        // The join-review queue carries no per-row queued-at timestamp
        // today; the row still shows, just without an age, sorted after
        // every timestamped row (compareBySinceDesc).
        since: null,
      })),
      ...audits,
    ].sort(compareBySinceDesc);

    sendJson(res, 200, { rows });
  });
}
