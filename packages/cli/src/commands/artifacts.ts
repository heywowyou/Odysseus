/**
 * `odysseus artifacts orphans` (issue #384): lists bucket audit prefixes
 * that no stored audit owns any more - left behind by deletions that ran
 * before remote deletion existed. Dry run by default; `--delete` removes
 * only the prefixes printed as orphans, through the same
 * `deleteAuditArtifacts` primitive every deletion route uses. Keys that do
 * not follow the audit prefix naming are listed and never deleted.
 */

import type { Command } from 'commander';
import {
  createConfiguredArtifactStore,
  DEFAULT_ORPHAN_MIN_AGE_MS,
  deleteAuditArtifacts,
  findRemoteArtifactOrphans,
} from '@odysseus/interface';
import { getArtifactsRoot } from '@odysseus/scanner';
import { connectToMongo, disconnectFromMongo, listAuditStorageIdentities } from '@odysseus/store';

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
}
