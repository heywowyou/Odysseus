/**
 * `odysseus artifacts orphans` (issue #384): lists bucket audit prefixes
 * that no stored audit owns any more - left behind by deletions that ran
 * before remote deletion existed. Dry run by default; `--delete` removes
 * only the prefixes printed as orphans, through the same
 * `deleteAuditArtifacts` primitive every deletion route uses. Keys that do
 * not follow the audit prefix naming are listed and never deleted.
 *
 * `odysseus artifacts archived-prospects` (issue #381): archived prospects
 * that still own audits, archived before archive purged scan storage or left
 * part-way by a failed purge. Dry run by default; `--apply` runs the same
 * `purgeProspectAuditStorage` the archive action uses, skipping any prospect
 * with a queued or running job. No network request reaches a prospect site.
 */

import type { Command } from 'commander';
import {
  createConfiguredArtifactStore,
  DEFAULT_ORPHAN_MIN_AGE_MS,
  deleteAuditArtifacts,
  findRemoteArtifactOrphans,
  purgeProspectAuditStorage,
} from '@odysseus/interface';
import { getArtifactsRoot } from '@odysseus/scanner';
import {
  connectToMongo,
  countActiveProspectDeletionJobs,
  disconnectFromMongo,
  listArchivedProspectsWithAudits,
  listAuditStorageIdentities,
} from '@odysseus/store';

export function registerArtifactsCommand(program: Command): void {
  const artifacts = program.command('artifacts').description('Audit artifact storage maintenance');

  artifacts
    .command('orphans')
    .description('List bucket audit prefixes with no stored audit (dry run unless --delete)')
    .option('--delete', 'delete the listed orphan prefixes', false)
    .action(async (options: { delete: boolean }) => {
      const store = createConfiguredArtifactStore();
      if (store === undefined) {
        console.log('The artifact bucket is not configured; nothing to reconcile.');
        return;
      }
      const connection = await connectToMongo();
      try {
        const audits = await listAuditStorageIdentities(connection);
        const report = await findRemoteArtifactOrphans(store, audits);

        for (const orphan of report.orphans) {
          console.log(`ORPHAN        ${orphan.prefix} (${orphan.objects} object(s))`);
        }
        for (const key of report.unidentifiedKeys) {
          console.log(`UNIDENTIFIED  ${key} (never deleted)`);
        }
        console.log(
          `\n${report.orphans.length} orphan prefix(es), ${report.owned} owned, ` +
            `${report.tooRecent} younger than ${DEFAULT_ORPHAN_MIN_AGE_MS / 3_600_000}h skipped, ` +
            `${report.unidentifiedKeys.length} unidentified key(s).`,
        );

        if (!options.delete) {
          if (report.orphans.length > 0)
            console.log('Dry run: re-run with --delete to remove them.');
          return;
        }
        let failed = 0;
        for (const orphan of report.orphans) {
          try {
            await deleteAuditArtifacts(
              { siteUrl: `https://${orphan.hostname}/`, startedAt: orphan.startedAt },
              { artifactsRoot: getArtifactsRoot(), store },
            );
            console.log(`DELETED       ${orphan.prefix}`);
          } catch (error) {
            failed += 1;
            console.log(`FAILED        ${orphan.prefix}: ${(error as Error).message}`);
          }
        }
        if (failed > 0) process.exitCode = 1;
      } finally {
        await disconnectFromMongo(connection);
      }
    });

  artifacts
    .command('archived-prospects')
    .description(
      'List archived prospects that still own audits (dry run unless --apply purges them)',
    )
    .option('--apply', 'purge the listed prospects’ audits and their files', false)
    .action(async (options: { apply: boolean }) => {
      const connection = await connectToMongo();
      try {
        const pending = await listArchivedProspectsWithAudits(connection);
        for (const row of pending) {
          console.log(`PENDING   ${row.prospectId} ${row.name} (${row.audits} audit(s))`);
        }
        console.log(`\n${pending.length} archived prospect(s) still own audits.`);
        if (!options.apply) {
          if (pending.length > 0) console.log('Dry run: re-run with --apply to purge them.');
          return;
        }
        const store = createConfiguredArtifactStore();
        let failed = 0;
        for (const row of pending) {
          if ((await countActiveProspectDeletionJobs(connection, row.prospectId)) > 0) {
            failed += 1;
            console.log(`SKIPPED   ${row.prospectId}: a job is queued or running`);
            continue;
          }
          try {
            const purged = await purgeProspectAuditStorage(connection, row.prospectId, {
              artifactsRoot: getArtifactsRoot(),
              store,
            });
            console.log(
              `PURGED    ${row.prospectId} (${purged.audits} audit(s), ${purged.remoteObjectsDeleted} bucket object(s))`,
            );
          } catch (error) {
            failed += 1;
            console.log(`FAILED    ${row.prospectId}: ${(error as Error).message}`);
          }
        }
        if (failed > 0) process.exitCode = 1;
      } finally {
        await disconnectFromMongo(connection);
      }
    });
}
