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
  prescanSite,
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
import type { PipelineContext } from '../job-queue.js';

/** The scanner's in-flight result, reduced to the stored shape.
 *
 * Booking evidence collapses to its distinct kinds. The full evidence
 * carries selectors and page URLs, which plan 004's binding decision 15
 * forbids a public preview from containing; storing only the kinds means the
 * prohibited detail is never in the record a preview is built from, rather
 * than being present and relied on to be filtered later. */
function toStoredPages(result: PrescanResult): HotelPrescanPage[] {
  return result.pages.map((page) => {
    const kinds = [...new Set((page.bookingEvidence ?? []).map((item) => item.kind))].sort();
    const { bookingEvidence: _dropped, ...rest } = page;
    return {
      ...rest,
      ...(kinds.length > 0 ? { bookingEvidenceKinds: kinds } : {}),
    };
  });
}

export async function runHotelPrescanJob(job: JobDocument, ctx: PipelineContext): Promise<void> {
  const { connection, originLock } = ctx;
  const options = job.options;

  const resolutionVersion = options.resolutionVersion;
  const qualificationVersion = options.qualificationVersion;
  if (resolutionVersion === undefined || qualificationVersion === undefined) {
    throw new Error(
      `odysseus interface: hotel-prescan job ${job.jobId} needs resolutionVersion and qualificationVersion`,
    );
  }
  const prescanVersion = options.prescanVersion ?? CURRENT_PRESCAN_VERSION;

  await updateJobProgress(connection, job.jobId, {
    phase: 'prescanning',
    progress: { message: '0 hotels prescanned' },
  });

  const prescansRoot = getPrescansRoot();
  const { browser } = await launchBrowser();

  let report: HotelPrescanReport;
  try {
    report = await prescanHotels({
      store: {
        listCandidatesToPrescan: (listOptions) => listCandidatesToPrescan(connection, listOptions),
        record: (input) => recordPrescan(connection, input),
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
        };
        return stored;
      },
      scanJobId: job.jobId,
      resolutionVersion,
      qualificationVersion,
      prescanVersion,
      ...(options.maxPages !== undefined ? { limit: options.maxPages } : {}),
      concurrency: options.concurrency ?? PROSPECTING_JOB_CONCURRENCY,
      rescan: options.rescan ?? false,
      dryRun: false,
      onProgress: (prescanned) => {
        void updateJobProgress(connection, job.jobId, {
          progress: { message: `${prescanned} hotels prescanned` },
        });
      },
    });
  } finally {
    await browser.close();
  }

  // The summary goes through updateJobProgress rather than completeJob:
  // CompleteJobPatch carries result references, not progress text, and
  // widening it for one message would put a second way to write the same
  // field into the store's API.
  await updateJobProgress(connection, job.jobId, {
    progress: {
      message:
        `${report.candidatesPrescanned} hotels prescanned, ` +
        `${report.pagesLoaded} pages loaded, ${report.failures} failed`,
    },
  });
  await completeJob(connection, job.jobId);
}
