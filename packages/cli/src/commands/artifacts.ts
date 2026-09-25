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
 *
 * `odysseus artifacts retention` (plan 077): superseded audits, reports,
 * analyses and quality candidates past the grace period. Dry run by
 * default; `--apply` removes them and records the run. A run over the
 * per-audit cap refuses unless `--allow-large` is passed after reading the
 * dry run. This process cannot see a report being produced inside a running
 * server, so apply it while no report production is under way.
 *
 * `odysseus artifacts compact-scans` (plan 077): stored scan.json files
 * rewritten into the compact shape new scans already get. Dry run by
 * default; `--apply` rewrites each file atomically and re-uploads it when a
 * bucket is configured on this machine. Needs no database.
 */

import type { Command } from 'commander';
import {
  compactStoredScans,
  createConfiguredArtifactStore,
  RETENTION_GRACE_DAYS,
  RETENTION_RUN_CAP,
  runRetention,
  type RetentionRunResult,
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
              {
                siteUrl: `https://${orphan.hostname}/`,
                startedAt: orphan.startedAt,
                auditId: null,
              },
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
    .command('retention')
    .description(
      `Remove versions superseded more than ${RETENTION_GRACE_DAYS} days ago (dry run unless --apply)`,
    )
    .option('--apply', 'remove them and record the run', false)
    .option('--allow-large', `allow more than ${RETENTION_RUN_CAP} audits in one run`, false)
    .option('--json', 'print the result as JSON', false)
    .action(async (options: { apply: boolean; allowLarge: boolean; json: boolean }) => {
      const connection = await connectToMongo();
      try {
        const result = await runRetention({
          connection,
          artifactsRoot: getArtifactsRoot(),
          store: createConfiguredArtifactStore(),
          now: new Date(),
          apply: options.apply,
          allowLarge: options.allowLarge,
          trigger: 'cli',
        });
        if (options.json) console.log(JSON.stringify(retentionJson(result), null, 2));
        else printRetention(result, options.apply);
        if (result.refusal !== undefined || result.failures.length > 0) process.exitCode = 1;
      } finally {
        await disconnectFromMongo(connection);
      }
    });

  artifacts
    .command('compact-scans')
    .description('Trim stored scan.json files to the compact shape (dry run unless --apply)')
    .option('--apply', 'rewrite the files and their bucket copies', false)
    .action(async (options: { apply: boolean }) => {
      const result = await compactStoredScans({
        artifactsRoot: getArtifactsRoot(),
        store: createConfiguredArtifactStore(),
        apply: options.apply,
      });
      for (const failure of result.failures) {
        console.log(`FAILED    ${failure.file} (${failure.step}): ${failure.message}`);
      }
      const saved = result.bytesBefore - result.bytesAfter;
      console.log(
        `${result.filesScanned} scan.json file(s), ${result.filesCompacted} ` +
          `${options.apply ? 'compacted' : 'to compact'}, ${result.filesUnreadable} unreadable left alone.`,
      );
      console.log(
        `${formatMegabytes(result.bytesBefore)} -> ${formatMegabytes(result.bytesAfter)} ` +
          `(${formatMegabytes(saved)} ${options.apply ? 'reclaimed' : 'to reclaim'}).`,
      );
      if (!options.apply && result.filesCompacted > 0) {
        console.log('Dry run: re-run with --apply to rewrite them.');
      }
      if (result.failures.length > 0) process.exitCode = 1;
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

function formatMegabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function retentionJson(result: RetentionRunResult): unknown {
  const { plan, ...rest } = result;
  return { ...rest, holds: plan.holds };
}

function printRetention(result: RetentionRunResult, applied: boolean): void {
  const rows: string[][] = [
    ...result.deleteAudits.map((audit) => [
      'DELETE AUDIT',
      `${audit.auditId} ${audit.siteUrl}`,
      `replaced by ${audit.supersededBy}`,
      formatMegabytes(audit.bytes),
    ]),
    ...result.slimAudits.map((audit) => [
      'SLIM AUDIT',
      `${audit.auditId} ${audit.siteUrl}`,
      `delivered, replaced by ${audit.supersededBy}`,
      formatMegabytes(audit.bytes),
    ]),
    ...result.items.map((item) => [
      `DELETE ${item.kind.toUpperCase()}`,
      `${item.auditId} ${item.id}`,
      'superseded, no keep reason',
      formatMegabytes(item.bytes),
    ]),
    ...result.plan.holds.map((hold) => ['HOLD', hold.auditId, hold.reason, '']),
  ];
  const widths = [0, 1, 2].map((column) =>
    Math.max(0, ...rows.map((row) => (row[column] ?? '').length)),
  );
  for (const row of rows) {
    console.log(
      row
        .map((cell, column) => cell.padEnd(widths[column] ?? 0))
        .join('  ')
        .trimEnd(),
    );
  }
  for (const failure of result.failures) {
    console.log(`FAILED    ${failure.auditId} (${failure.step}): ${failure.message}`);
  }

  console.log(
    `\n${result.deleteAudits.length} audit(s) to delete, ${result.slimAudits.length} to slim, ` +
      `${result.items.length} version(s) inside audits, ${result.plan.holds.length} held.`,
  );
  if (result.refusal !== undefined) {
    console.log(
      `Refused: more than ${RETENTION_RUN_CAP} audits in one run. Read the list above, then ` +
        're-run with --apply --allow-large if it is right.',
    );
    return;
  }
  if (!applied) {
    console.log(
      `About ${formatMegabytes(result.bytesReclaimed.local)} to reclaim on this machine.`,
    );
    console.log('Dry run: re-run with --apply to remove them.');
    return;
  }
  console.log(
    `Reclaimed ${formatMegabytes(result.bytesReclaimed.local)} locally, ` +
      `${result.remoteObjectsDeleted} bucket object(s) removed.`,
  );
}
