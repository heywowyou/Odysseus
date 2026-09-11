import type { Command } from 'commander';
import {
  connectToMongo,
  disconnectFromMongo,
  addSuppressionEntry,
  listOutreachPreviews,
} from '@odysseus/store';
import {
  CURRENT_PRESCAN_VERSION,
  CURRENT_PREVIEW_CONTENT_VERSION,
  CURRENT_QUALIFICATION_VERSION,
  createConfiguredPreviewPublisher,
  createInMemoryPreviewPublisher,
  createMongoOutreachPreviewStore,
  getPreviewPublicBaseUrl,
  publishPreview,
  revokePreviewsForDomain,
} from '@odysseus/interface';
import { parsePositiveInt } from './shared.js';

/**
 * Milestone 9c plan 009: publish, list and withdraw the expiring outreach
 * preview for one hotel.
 *
 * Since plan 037 the prescan-backed v1 publish path is retired: `preview
 * publish` refuses with 'v1-retired' and never renders a new prescan-backed
 * preview. Previews are published from the audit detail page instead, where
 * the v2 full-scan scorecard lives. `revoke` and `list` stay live: the
 * records and objects that already exist still need withdrawing and reading.
 *
 * Every command here takes a real bucket. A dry run is the only path that
 * does not, and it deliberately uses the in-memory publisher rather than
 * skipping the publisher entirely, so a missing bucket variable cannot make a
 * dry run look healthier than the real command would be.
 */
export function registerPreviewCommand(prospect: Command): void {
  const preview = prospect
    .command('preview')
    .description(
      'Milestone 9c: publish, list and withdraw the expiring outreach preview for one hotel.',
    );

  preview
    .command('publish <candidateId>')
    .description(
      'Retired by plan 037: the prescan-backed v1 preview is no longer published from the ' +
        'CLI and every call refuses with "v1-retired". Publish the v2 full-scan scorecard ' +
        'from the audit detail page in the dashboard instead.',
    )
    .option('--language <fr|en>', 'Language of the rendered preview', 'fr')
    .option('--prescan-version <version>', 'Prescan generation to read', CURRENT_PRESCAN_VERSION)
    .option(
      '--qualification-version <version>',
      'Qualification generation whose registry facts may be quoted',
      CURRENT_QUALIFICATION_VERSION,
    )
    .option('--dry-run', 'Report what would be published, writing no object and no record', false)
    .action(
      async (
        candidateId: string,
        opts: {
          language: string;
          prescanVersion: string;
          qualificationVersion: string;
          dryRun: boolean;
        },
      ) => {
        if (opts.language !== 'fr' && opts.language !== 'en') {
          console.error(`odysseus prospect preview publish: --language must be fr or en`);
          process.exitCode = 1;
          return;
        }

        let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
        try {
          mongoConnection = await connectToMongo();
          const result = await publishPreview({
            store: createMongoOutreachPreviewStore(mongoConnection, {
              prescanVersion: opts.prescanVersion,
              qualificationVersion: opts.qualificationVersion,
            }),
            publisher: opts.dryRun
              ? createInMemoryPreviewPublisher()
              : createConfiguredPreviewPublisher(),
            publicBaseUrl: getPreviewPublicBaseUrl(),
            candidateId,
            language: opts.language,
            dryRun: opts.dryRun,
          });

          console.log(
            JSON.stringify({ contentVersion: CURRENT_PREVIEW_CONTENT_VERSION, ...result }, null, 2),
          );

          if (!result.published && !opts.dryRun) {
            // A refusal is a correct outcome, not a crash, but it must not read
            // as success to a script or to a person skimming the output. The
            // retirement gets its own line: an operator hitting it needs the
            // new path, not a refusal code.
            if (result.refusal === 'v1-retired') {
              console.error(
                `odysseus prospect preview publish: the prescan-backed preview path is ` +
                  `retired (plan 037). Run the full-scan outreach scan for this candidate, ` +
                  `then publish the scorecard preview from its audit detail page in the ` +
                  `dashboard.`,
              );
            } else {
              console.error(
                `odysseus prospect preview publish: nothing published (${result.refusal ?? 'unknown reason'})`,
              );
            }
            process.exitCode = 1;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`odysseus prospect preview publish: failed\n${message}`);
          process.exitCode = 1;
        } finally {
          if (mongoConnection) await disconnectFromMongo(mongoConnection);
        }
      },
    );

  preview
    .command('revoke <domain>')
    .description(
      'Withdraw every live preview for a domain. The stored object is deleted first, so a ' +
        'record can never read revoked while the link still serves.',
    )
    .option('--reason <text>', 'Reason recorded on each withdrawn preview', 'operator request')
    .action(async (domain: string, opts: { reason: string }) => {
      let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
      try {
        mongoConnection = await connectToMongo();
        const result = await revokePreviewsForDomain({
          store: createMongoOutreachPreviewStore(mongoConnection, {
            prescanVersion: CURRENT_PRESCAN_VERSION,
            qualificationVersion: CURRENT_QUALIFICATION_VERSION,
          }),
          publisher: createConfiguredPreviewPublisher(),
          domain,
          reason: opts.reason,
        });
        console.log(JSON.stringify({ domain, ...result }, null, 2));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus prospect preview revoke: failed\n${message}`);
        process.exitCode = 1;
      } finally {
        if (mongoConnection) await disconnectFromMongo(mongoConnection);
      }
    });

  preview
    .command('list')
    .description(
      'List published previews and their state. Tokens are not stored, so no link is printed.',
    )
    .option('--domain <registrable-domain>', 'Only this hotel')
    .option('--status <status>', 'live | revoked')
    .option('--limit <n>', 'Rows to print', parsePositiveInt, 25)
    .action(async (opts: { domain?: string; status?: string; limit: number }) => {
      let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
      try {
        mongoConnection = await connectToMongo();
        const rows = await listOutreachPreviews(mongoConnection, {
          ...(opts.domain === undefined ? {} : { domain: opts.domain }),
          ...(opts.status === undefined ? {} : { status: opts.status as 'live' | 'revoked' }),
          limit: opts.limit,
        });
        console.log(
          JSON.stringify(
            rows.map((row) => ({
              previewId: row.previewId,
              domain: row.domain,
              language: row.language,
              status: row.status,
              publishedAt: row.publishedAt,
              publicExpiresAt: row.publicExpiresAt,
              expiresAt: row.expiresAt,
              revokedReason: row.revokedReason ?? null,
            })),
            null,
            2,
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus prospect preview list: failed\n${message}`);
        process.exitCode = 1;
      } finally {
        if (mongoConnection) await disconnectFromMongo(mongoConnection);
      }
    });

  prospect
    .command('suppress <domain>')
    .description(
      'Record a permanent opt-out for a domain, never subject to the 90 day retention policy.',
    )
    .option('--address <email>', 'Optional address to suppress alongside the domain')
    .option('--reason <text>', 'Reason recorded with the suppression entry', 'operator request')
    .action(async (domain: string, opts: { address?: string; reason: string }) => {
      let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
      try {
        mongoConnection = await connectToMongo();
        await addSuppressionEntry(mongoConnection, {
          domain,
          ...(opts.address !== undefined ? { address: opts.address } : {}),
          reasonCode: 'operator-request',
          reason: opts.reason,
        });
        console.log(
          `odysseus prospect suppress: recorded a permanent suppression entry for ${domain}`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus prospect suppress: failed\n${message}`);
        process.exitCode = 1;
      } finally {
        if (mongoConnection) await disconnectFromMongo(mongoConnection);
      }
    });
}
