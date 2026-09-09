/**
 * Milestone 9a: one bounded batch of AFNIC candidates, filtered against
 * the Sirene stock index, fetched via plain HTTP (never Chromium - see
 * docs/rules/prospect-qualification.md: "Chromium never runs on an unqualified
 * domain"), qualified deterministically, and persisted to the prospects
 * collection. Mirrors run-prospecting-job.ts's structure (progress
 * updates, per-candidate result tracking) applied to a different funnel
 * stage - this runs *before* any Chromium prospecting scan, producing the
 * qualified URL list a future milestone 9b hookup would feed it.
 *
 * Does not auto-enqueue the next batch: chaining is a reasonable future
 * addition but out of scope here, to keep this milestone bounded. The
 * operator (CLI or the dashboard route) triggers the next batch
 * explicitly.
 */

import { statSync } from 'node:fs';
import {
  completeJob,
  createProspect,
  findProspectByDomainAndSourceVersion,
  getCheckpoint,
  isSuppressed,
  updateJobProgress,
  upsertCheckpoint,
  type JobDocument,
  type ProspectIngestionResult,
} from '@odysseus/store';
import { qualifyProspect, getNafSectorAllowlist, type AfnicRow } from '@odysseus/core';
import { getCrawlDelayMs, getCrawlerUserAgent, extractMentionsLegales } from '@odysseus/scanner';
import {
  getAfnicFichierAPath,
  getProspectBatchSize,
  getSireneStockIndexCachePath,
  getSireneStockPath,
  DEFAULT_PROSPECT_FETCH_TIMEOUT_MS,
  PROSPECT_CHECKPOINT_WRITE_INTERVAL,
} from '../../config.js';
import { streamAfnicCandidates } from '../../prospecting/afnic-reader.js';
import { getOrBuildSireneStockIndex } from '../../prospecting/sirene-stock-index.js';
import { joinSireneStockEntry } from '../../prospecting/sirene-stock-join.js';
import { fetchMentionsLegalesData } from '../../prospecting/mentions-legales-fetch.js';
import { extractContactAddress } from '../../prospecting/extract-contact-address.js';
import type { PipelineContext } from '../job-queue.js';
import { logger } from '../../logger.js';

const CHECKPOINT_ID = 'afnic-fichier-a';

function domainFromSiteUrl(siteUrl: string): string {
  return new URL(siteUrl).hostname.replace(/^www\./, '');
}

function afnicFileFingerprint(filePath: string): string {
  const stats = statSync(filePath);
  return `${stats.size}:${stats.mtimeMs}`;
}

export async function runProspectIngestionJob(
  job: JobDocument,
  ctx: PipelineContext,
): Promise<void> {
  const { connection, originLock } = ctx;
  const batchSize = job.options.batchSize ?? getProspectBatchSize();

  const afnicPath = getAfnicFichierAPath();
  const stockPath = getSireneStockPath();
  const cachePath = getSireneStockIndexCachePath();
  const nafAllowlistVersion = getNafSectorAllowlist().version;

  const sireneIndex = await getOrBuildSireneStockIndex(stockPath, cachePath);

  const currentAfnicVersion = afnicFileFingerprint(afnicPath);
  const checkpoint = await getCheckpoint(connection, CHECKPOINT_ID);
  // A version mismatch (checkpoint recorded against a different AFNIC
  // file) resets to byte 0 rather than resuming against the wrong file -
  // see ProspectIngestionCheckpointFields's doc comment in @odysseus/store.
  const checkpointIsForCurrentFile =
    checkpoint?.sourceFilePath === afnicPath &&
    checkpoint.sourceFileVersion === currentAfnicVersion;
  if (checkpoint && !checkpointIsForCurrentFile) {
    logger.warn(
      {
        afnicPath,
        previousVersion: checkpoint.sourceFileVersion,
        currentVersion: currentAfnicVersion,
      },
      'AFNIC file changed since the last checkpoint, resuming from byte 0',
    );
  }
  const startByteOffset = checkpointIsForCurrentFile ? checkpoint.nextByteOffset : 0;
  const headerColumns = checkpointIsForCurrentFile ? checkpoint.headerColumns : undefined;

  await updateJobProgress(connection, job.jobId, {
    phase: 'afnic-scan',
    progress: {
      ingestion: {
        afnicRowsScanned: 0,
        candidatesFiltered: 0,
        candidatesFetched: 0,
        candidatesQualified: 0,
        target: batchSize,
      },
    },
  });

  // The current batch's own starting offset: the checkpoint only ever
  // advances to a batch end (its single write happens after the
  // candidate loop), so a crash re-streams this batch from exactly here.
  const batchStartOffset = startByteOffset;
  const afnicResult = await streamAfnicCandidates(
    afnicPath,
    batchStartOffset,
    batchSize,
    headerColumns,
  );

  await updateJobProgress(connection, job.jobId, {
    phase: 'fetch-qualify',
    progress: {
      ingestion: {
        afnicRowsScanned: afnicResult.rowsScanned,
        candidatesFiltered: afnicResult.candidates.length,
        candidatesFetched: 0,
        candidatesQualified: 0,
        target: batchSize,
      },
    },
  });

  const ingestionResults: ProspectIngestionResult[] = afnicResult.candidates.map((row) => ({
    domain: row.domain,
    status: 'pending',
  }));

  async function persistCheckpoint(): Promise<void> {
    await upsertCheckpoint(connection, CHECKPOINT_ID, {
      sourceFilePath: afnicPath,
      sourceFileVersion: currentAfnicVersion,
      nextByteOffset: afnicResult.nextByteOffset,
      rowsProcessed:
        (checkpointIsForCurrentFile ? (checkpoint?.rowsProcessed ?? 0) : 0) +
        afnicResult.rowsScanned,
      headerColumns: afnicResult.headerColumns,
    });
  }

  let fetchedCount = 0;
  let qualifiedCount = 0;

  for (let i = 0; i < afnicResult.candidates.length; i++) {
    const candidate = afnicResult.candidates[i] as AfnicRow;

    // Redo guard: because the checkpoint only moves at batch end (its
    // single write comes after this loop), a crash mid-batch re-streams
    // this batch from its start and candidates an earlier attempt already
    // ingested reappear here. Their stored row is the source of truth, so
    // reconstruct the result from it and move on before any fetch work -
    // the redo must neither duplicate prospect rows nor re-fetch sites.
    const existing = await findProspectByDomainAndSourceVersion(
      connection,
      candidate.domain,
      currentAfnicVersion,
    );
    if (existing) {
      ingestionResults[i] = {
        domain: candidate.domain,
        status: existing.qualification.qualified ? 'qualified' : 'not-qualified',
        siren: existing.siren.value,
        reasons: existing.qualification.reasons,
      };
      if (existing.qualification.qualified) qualifiedCount++;
      continue;
    }

    ingestionResults[i] = { domain: candidate.domain, status: 'fetching' };

    const siteUrl = `https://${candidate.domain}/`;
    const fetchResult = await fetchMentionsLegalesData(siteUrl, originLock, {
      crawlDelayMs: getCrawlDelayMs(),
      userAgent: getCrawlerUserAgent(),
      timeoutMs: DEFAULT_PROSPECT_FETCH_TIMEOUT_MS,
    });
    fetchedCount++;

    const legalText = fetchResult.mentionsLegalesText ?? fetchResult.homepageText;
    const siren =
      legalText !== null
        ? (extractMentionsLegales(fetchResult.mentionsLegalesUrl ?? siteUrl, legalText).siren ??
          null)
        : null;

    if (siren === null) {
      ingestionResults[i] = { domain: candidate.domain, status: 'no-siren' };
    } else {
      const domain = domainFromSiteUrl(siteUrl);
      const texts = [fetchResult.homepageText, fetchResult.mentionsLegalesText].filter(
        (text): text is string => text !== null,
      );
      const contactAddress = extractContactAddress(texts, domain);
      const domainSuppressed = await isSuppressed(connection, domain, contactAddress?.value);
      const sireneMatch = sireneIndex.lookup(siren);

      const qualification = qualifyProspect({
        sireneMatch,
        siren,
        domainSuppressed,
        contactAddress,
      });
      const { denomination, naf, trancheEffectifs, etatAdministratif } = joinSireneStockEntry(
        sireneMatch,
        sireneIndex.version,
      );
      const evaluatedAt = new Date();

      await createProspect(connection, {
        domain,
        siteUrl,
        siren: { value: siren, source: 'lcen-mentions-legales-fetch', retrievedAt: evaluatedAt },
        denomination,
        naf,
        trancheEffectifs,
        etatAdministratif,
        qualification: {
          qualified: qualification.qualified,
          reasons: qualification.reasons,
          evaluatedAt,
        },
        scanJobId: job.jobId,
        ...(contactAddress ? { contactAddress } : {}),
        dataOrigin: {
          domainSource: 'afnic-fichier-a',
          domainListVersion: currentAfnicVersion,
          companyDataSource: 'sirene-stock',
          companyDataVersion: sireneIndex.version,
          nafAllowlistVersion,
          ...(fetchResult.mentionsLegalesText !== null
            ? { contactAddressSource: 'lcen-mentions-legales-fetch' as const }
            : contactAddress
              ? { contactAddressSource: 'homepage-fetch' as const }
              : {}),
        },
      });

      if (qualification.qualified) qualifiedCount++;
      ingestionResults[i] = {
        domain: candidate.domain,
        status: qualification.qualified ? 'qualified' : 'not-qualified',
        siren,
        reasons: qualification.reasons,
      };
    }

    // Full-array $set on every candidate is O(n^2) write volume over a
    // batch - throttle to PROSPECT_CHECKPOINT_WRITE_INTERVAL and rely on
    // completeJob's own final write (after the loop) for exact end state.
    if ((i + 1) % PROSPECT_CHECKPOINT_WRITE_INTERVAL === 0) {
      await updateJobProgress(connection, job.jobId, {
        progress: {
          ingestion: {
            afnicRowsScanned: afnicResult.rowsScanned,
            candidatesFiltered: afnicResult.candidates.length,
            candidatesFetched: fetchedCount,
            candidatesQualified: qualifiedCount,
            target: batchSize,
          },
        },
        ingestionResults,
      });
    }
  }

  // The batch's only checkpoint write, deliberately after the loop: a
  // mid-batch checkpoint would name an offset past candidates that had
  // not been processed yet, so a crash after one would silently skip
  // them on the next attempt. Crash before here instead redoes the
  // batch from batchStartOffset, and the loop's already-ingested guard
  // keeps that redo from duplicating rows or re-fetching sites.
  await persistCheckpoint();
  await completeJob(connection, job.jobId, { ingestionResults });
}
