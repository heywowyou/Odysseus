/**
 * The hotel prescan job (milestone 9c plan 004): a thin adapter between the
 * queue, the store, and `prescanSite`.
 *
 * Unlike run-prospecting-job.ts, this never calls `runAuditStage`. That is
 * the whole point of plan 004's binding decision 8, and the reason it is a
 * separate runner rather than a mode flag on the existing one: a shared
 * function with a branch inside it is exactly how the prescan drifted back
 * into paid-audit shapes the first time. The legacy URL-mode prospecting job
 * is left untouched, so its own tests remain the regression guard for it.
 *
 * One browser for the whole batch, one fresh context per page inside
 * `renderDiff`. Launching Chromium per hotel would cost more than the
 * measurement; sharing a context across hotels would let one site's cookies
 * and storage reach the next.
 */

import path from 'node:path';
import {
  buildPrescanDir,
  getPrescansRoot,
  launchBrowser,
  removePrescanArtifacts,
  prescanSite,
  sweepExpiredPrescanArtifacts,
  type PrescanResult,
} from '@odysseus/scanner';
import {
  completeJob,
  listCandidatesToPrescan,
  recordPrescan,
  updateJobProgress,
  type HotelCandidateDocument,
  type JobDocument,
  type RecordPrescanInput,
} from '@odysseus/store';
import type { HotelPrescanPage } from '@odysseus/core';
import { PROSPECTING_JOB_CONCURRENCY } from '../../config.js';
import {
  CURRENT_PRESCAN_VERSION,
  prescanHotels,
  type HotelPrescanReport,
} from '../../prospecting/hotel-prescan/prescan-hotels.js';
import { scoreHotelOnDemandForConnection } from '../../prospecting/hotel-scoring/score-on-demand.js';
import { JobCancelledError } from '../cancellation.js';
import type { PipelineContext } from '../job-queue.js';

/** The scanner's in-flight result, reduced to the stored shape.
 *
 * Booking evidence collapses to its distinct kinds. The full evidence
 * carries selectors and page URLs, which plan 004's binding decision 15
 * forbids a public preview from containing; storing only the kinds means the
 * prohibited detail is never in the record a preview is built from, rather
 * than being present and relied on to be filtered later. */
export function toStoredPages(result: PrescanResult): HotelPrescanPage[] {
  return result.pages.map((page) => {
    const kinds = new Set<string>((page.bookingEvidence ?? []).map((item) => item.kind));
    if ((page.bookingAmbiguities?.length ?? 0) > 0) kinds.add('booking-control-unresolved');
    for (const check of page.bookingRedirectChecks ?? []) {
      kinds.add(`delegated-booking-${check.resolution}`);
    }
    const {
      bookingEvidence: _droppedEvidence,
      bookingEvidenceError: _droppedEvidenceError,
      bookingAmbiguities: _droppedAmbiguities,
      bookingAmbiguitiesError: _droppedAmbiguitiesError,
      bookingRedirectChecks: _droppedRedirectChecks,
      bookingRedirectChecksError: _droppedRedirectChecksError,
      ...rest
    } = page;
    return {
      ...rest,
      ...(kinds.size > 0 ? { bookingEvidenceKinds: [...kinds].sort() } : {}),
    };
  });
}

export async function persistPrescanWithArtifactCleanup(
  prescansRoot: string,
  input: RecordPrescanInput,
  persist: (value: RecordPrescanInput) => ReturnType<typeof recordPrescan>,
): ReturnType<typeof recordPrescan> {
  try {
    return await persist(input);
  } catch (error) {
    await removePrescanArtifacts(prescansRoot, input.artifactsDir);
    throw error;
  }
}

/** An empty stored candidate list is the absence of a scope, not a scope of
 *  zero hotels. Mongoose used to persist an unset array path as `[]`
 *  (issue #202), and `candidateId: { $in: [] }` matches nothing, so a
 *  domain-scoped job read its own missing field back as "prescan no hotels"
 *  and completed in under a second reporting success with no error. The
 *  schema no longer writes `[]`, but jobs stored before that fix still carry
 *  one, and the failure mode is silent either way. Reading it here keeps the
 *  two cases honest: a domain-scoped job falls back to its domain, and a
 *  limit-bound batch with no surviving list hits the refusal below rather
 *  than quietly widening to the whole population.
 */
function persistedCandidateScope(ids: readonly string[] | undefined): string[] | undefined {
  return ids === undefined || ids.length === 0 ? undefined : [...ids];
}

export async function runHotelPrescanJob(job: JobDocument, ctx: PipelineContext): Promise<void> {
  const { connection, originLock } = ctx;
  const options = job.options;

  if (ctx.cancellation.isRequested(job.jobId)) {
    throw new JobCancelledError(job.jobId);
  }

  const resolutionVersion = options.resolutionVersion;
  const qualificationVersion = options.qualificationVersion;
  if (resolutionVersion === undefined || qualificationVersion === undefined) {
    throw new Error(
      `odysseus interface: hotel-prescan job ${job.jobId} needs resolutionVersion and qualificationVersion`,
    );
  }
  const prescanVersion = options.prescanVersion ?? CURRENT_PRESCAN_VERSION;
  const prescanCandidateIds = persistedCandidateScope(options.prescanCandidateIds);
  if (
    options.domain === undefined &&
    options.maxPages !== undefined &&
    prescanCandidateIds === undefined
  ) {
    throw new Error(
      `odysseus interface: hotel-prescan job ${job.jobId} has no persisted candidate scope; ` +
        'recreate the batch from its approved list before running it',
    );
  }

  await updateJobProgress(connection, job.jobId, {
    phase: 'prescanning',
    progress: { message: '0 hotels prescanned' },
  });

  const prescansRoot = getPrescansRoot();
  await sweepExpiredPrescanArtifacts(prescansRoot, {
    dryRun: false,
    limit: 10_000,
  });
  const { browser } = await launchBrowser();

  let report: HotelPrescanReport;
  try {
    report = await prescanHotels({
      store: {
        listCandidatesToPrescan: (listOptions) => listCandidatesToPrescan(connection, listOptions),
        record: async (input) => {
          return persistPrescanWithArtifactCleanup(prescansRoot, input, (value) =>
            recordPrescan(connection, value),
          );
        },
      },
      prescan: async (candidate: HotelCandidateDocument) => {
        const domain = candidate.ownRegistrableDomain;
        if (domain === undefined || domain === '') {
          // listCandidatesToPrescan filters these out; reaching here means
          // the catalogue changed underneath the batch.
          throw new Error(`candidate ${candidate.candidateId} has no own domain`);
        }
        const startUrl = `https://${domain}/`;
        const startedAt = new Date();
        const artifactsDir = buildPrescanDir(prescansRoot, domain, startedAt);

        // Held for one hotel at a time, not for the batch: a prescan must
        // not block a same-origin full audit for the whole run, only for the
        // site it is currently measuring. The same shape run-prospecting-job
        // uses per URL.
        const release = await originLock.acquire(new URL(startUrl).origin);
        let result: PrescanResult;
        try {
          result = await prescanSite(startUrl, { browser, artifactsDir });
        } finally {
          release();
        }

        const stored: Omit<
          RecordPrescanInput,
          | 'candidateId'
          | 'resolutionVersion'
          | 'qualificationVersion'
          | 'prescanVersion'
          | 'scanJobId'
        > = {
          domain,
          startUrl: result.startUrl,
          status: result.status,
          pages: toStoredPages(result),
          absentRoles: result.absentRoles,
          offsiteBookingLinks: result.offsiteBookingLinks,
          robotsTxtFound: result.robotsTxtFound,
          effectiveDelayMs: result.effectiveDelayMs,
          // Relative to the prescans root, so a stored prescan survives that
          // root moving or being read from another machine.
          artifactsDir: path.relative(prescansRoot, result.artifactsDir),
          browserVersion: result.browserVersion,
          startedAt: new Date(result.startedAt),
          durationMs: result.durationMs,
          evidence: result.evidence,
        };
        return stored;
      },
      scanJobId: job.jobId,
      resolutionVersion,
      qualificationVersion,
      prescanVersion,
      ...(options.maxPages !== undefined ? { limit: options.maxPages } : {}),
      ...(options.domain !== undefined ? { domain: options.domain } : {}),
      ...(prescanCandidateIds === undefined ? {} : { candidateIds: prescanCandidateIds }),
      concurrency: options.concurrency ?? PROSPECTING_JOB_CONCURRENCY,
      rescan: options.rescan ?? false,
      dryRun: false,
      checkForCancellation: () => {
        if (ctx.cancellation.isRequested(job.jobId)) {
          throw new JobCancelledError(job.jobId);
        }
      },
      onProgress: (prescanned) => {
        void updateJobProgress(connection, job.jobId, {
          progress: { message: `${prescanned} hotels prescanned` },
        });
      },
    });
  } finally {
    await browser.close();
  }

  if (ctx.cancellation.isRequested(job.jobId)) {
    throw new JobCancelledError(job.jobId);
  }

  // The summary goes through updateJobProgress rather than completeJob:
  // CompleteJobPatch carries result references, not progress text, and
  // widening it for one message would put a second way to write the same
  // field into the store's API.
  await updateJobProgress(connection, job.jobId, {
    progress: {
      message:
        `${report.candidatesPrescanned} hotels prescanned, ` +
        `${report.pagesLoaded} pages loaded, ` +
        `${report.byEvidenceStatus.complete} evidence-complete, ` +
        `${report.byEvidenceStatus.incomplete} evidence-incomplete, ${report.failures} failed`,
    },
  });

  // Issue #201: a domain-scoped run (the dashboard's per-hotel quick check,
  // or the CLI's own `--domain`) is exactly the one-hotel case the wave-add
  // action already scores on demand (issue #199). Running the same bounded
  // pass here closes the gap the issue reported: a wave-added hotel with no
  // prescan yet used to have no way to ever pick up a score, because
  // nothing ever retried after the prescan it was waiting on finally ran.
  // A population-wide batch (no domain) stays untouched by this and keeps
  // going through the operator's own `prospect score run`.
  if (options.domain !== undefined) {
    await scoreHotelOnDemandForConnection(connection, options.domain);
  }

  await completeJob(connection, job.jobId);
}
