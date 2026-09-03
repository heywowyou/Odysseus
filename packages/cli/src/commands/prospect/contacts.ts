import type { Command } from 'commander';
import {
  connectToMongo,
  disconnectFromMongo,
  getHotelContactSummary,
  listHotelContacts,
} from '@odysseus/store';
import { OriginLock, getCrawlDelayMs, getCrawlerUserAgent } from '@odysseus/scanner';
import type { HotelContactState } from '@odysseus/core';
import {
  CURRENT_CONTACT_VERSION,
  CURRENT_QUALIFICATION_VERSION,
  CURRENT_SCORING_VERSION,
  DEFAULT_PROSPECT_FETCH_TIMEOUT_MS,
  createMongoHotelContactStore,
  discoverContacts,
  fetchContactPages,
  verifyMailDomain,
} from '@odysseus/interface';
import { parsePositiveInt } from './shared.js';

/**
 * Milestone 9c plan 007: discover approved own-domain role contacts for the
 * selected outreach cohort.
 *
 * A group with a `run` child, for the reason hotel-qualify's own comment
 * gives: siblings sharing an option name silently bind the parent's copy
 * otherwise.
 *
 * Runs inline rather than through the job queue, like hotel-qualify and for
 * the same reason: this pass makes at most three plain HTTP requests per
 * site, and the politeness that matters here is the shared OriginLock and
 * the crawl delay, both constructed below. It launches no browser.
 */
export function registerContactsCommand(prospect: Command): void {
  const contacts = prospect
    .command('contacts')
    .description(
      'Milestone 9c: discover approved own-domain role contacts for the selected outreach cohort.',
    );

  contacts
    .command('run')
    .description('Read the selected cohort sites and keep at most one role address each.')
    .option('--contact-version <version>', 'Contact generation to write', CURRENT_CONTACT_VERSION)
    .option(
      '--scoring-version <version>',
      'Scoring version whose latest cohort is the population',
      CURRENT_SCORING_VERSION,
    )
    .option(
      '--qualification-version <version>',
      'Qualification generation whose stored mentions legales URL is reused',
      CURRENT_QUALIFICATION_VERSION,
    )
    .option('--limit <n>', 'Look at most at this many cohort members', parsePositiveInt)
    .option('--domain <registrable-domain>', 'Look at only this hotel, by its own domain')
    .option('--concurrency <n>', 'Hotels in flight at once', parsePositiveInt, 3)
    .option('--recontact', 'Look again where a contact exists at this version', false)
    .option('--dry-run', 'Report the population and the request budget, writing nothing', false)
    .action(
      async (opts: {
        contactVersion: string;
        scoringVersion: string;
        qualificationVersion: string;
        limit?: number;
        domain?: string;
        concurrency: number;
        recontact: boolean;
        dryRun: boolean;
      }) => {
        // The same bound the prescan command requires, for a weaker but real
        // version of the same reason: a cohort is already a small population,
        // but "small" is a property of today's catalogue rather than of this
        // command, and an unbounded batch against live third-party sites should
        // never be one forgotten flag away. A dry run makes no request at all
        // and needs no bound.
        if (!opts.dryRun && opts.limit === undefined && opts.domain === undefined) {
          console.error(
            'odysseus prospect contacts run: --limit or --domain is required, or --dry-run to ' +
              'plan without making a request.',
          );
          process.exitCode = 1;
          return;
        }

        let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
        try {
          mongoConnection = await connectToMongo();

          // One lock for the whole run, shared across every lane, exactly as
          // hotel-qualify does: without it each lane looks individually polite
          // while one vendor host takes every lane's request at once.
          const originLock = new OriginLock();
          const fetchOptions = {
            crawlDelayMs: getCrawlDelayMs(),
            userAgent: getCrawlerUserAgent(),
            timeoutMs: DEFAULT_PROSPECT_FETCH_TIMEOUT_MS,
          };

          const report = await discoverContacts({
            store: createMongoHotelContactStore(mongoConnection, {
              scoringVersion: opts.scoringVersion,
              contactVersion: opts.contactVersion,
              qualificationVersion: opts.qualificationVersion,
              recontact: opts.recontact,
            }),
            fetchPages: (domain, knownMentionsLegalesUrl) =>
              fetchContactPages(domain, originLock, {
                ...fetchOptions,
                knownMentionsLegalesUrl,
              }),
            verifyMailDomain,
            contactVersion: opts.contactVersion,
            concurrency: opts.concurrency,
            dryRun: opts.dryRun,
            ...(opts.limit === undefined ? {} : { limit: opts.limit }),
            ...(opts.domain === undefined ? {} : { domain: opts.domain }),
            onProgress: (processed: number) => {
              // stderr, so stdout stays a single parseable JSON document.
              process.stderr.write(`contacted ${processed} cohort members\n`);
            },
          });

          console.log(JSON.stringify(report, null, 2));

          if (!report.reconciles) {
            console.error(
              'odysseus prospect contacts run: state counts do not reconcile with the number ' +
                'processed. Treat this report as unreliable rather than as a result.',
            );
            process.exitCode = 1;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`odysseus prospect contacts run: failed\n${message}`);
          process.exitCode = 1;
        } finally {
          if (mongoConnection) await disconnectFromMongo(mongoConnection);
        }
      },
    );

  contacts
    .command('report')
    .description('Print the outcome table for a contact version.')
    .option(
      '--contact-version <version>',
      'Contact generation to summarize',
      CURRENT_CONTACT_VERSION,
    )
    .option('--state <state>', 'found | parked | rejected | suppressed')
    .option('--limit <n>', 'Rows to print alongside the summary', parsePositiveInt, 25)
    .action(async (opts: { contactVersion: string; state?: string; limit: number }) => {
      let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
      try {
        mongoConnection = await connectToMongo();
        const summary = await getHotelContactSummary(mongoConnection, opts.contactVersion);
        const rows = await listHotelContacts(mongoConnection, {
          contactVersion: opts.contactVersion,
          ...(opts.state === undefined ? {} : { state: opts.state as HotelContactState }),
          limit: opts.limit,
        });
        console.log(
          JSON.stringify(
            {
              summary,
              rows: rows.map((row) => ({
                domain: row.domain,
                state: row.state,
                reason: row.reason,
                address: row.address ?? null,
                source: row.source ?? null,
                mxStatus: row.mxStatus,
              })),
            },
            null,
            2,
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus prospect contacts report: failed\n${message}`);
        process.exitCode = 1;
      } finally {
        if (mongoConnection) await disconnectFromMongo(mongoConnection);
      }
    });
}
