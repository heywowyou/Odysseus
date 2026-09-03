import path from 'node:path';
import type { Command } from 'commander';
import { backfillAuditRow } from '@odysseus/interface';
import { connectToMongo, disconnectFromMongo } from '@odysseus/store';

/**
 * Repairs the database row of an audit whose artifacts are already correct.
 * See packages/interface/src/pipeline/backfill-audit-row.ts for why the gap
 * exists; this command is the thin entry point, as every command here is.
 */
export function registerBackfillAuditCommand(program: Command): void {
  program
    .command('backfill-audit <artifacts-dir>')
    .description(
      "Re-persist a stored audit's MongoDB row and findings from its on-disk manifest.json and " +
        'findings.json. For audits scanned before findings provenance existed, whose row keeps the ' +
        'dashboard stuck at "scanned" even after normalize re-stamped the artifacts. Refuses a ' +
        'manifest with no provenance stamp, or one that does not match findings.json. Never scans.',
    )
    .option('--dry-run', 'Verify the artifacts and report what would be written, without writing')
    .action(async (artifactsDir: string, opts: { dryRun?: boolean }) => {
      const resolvedDir = path.resolve(artifactsDir);
      let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;

      try {
        mongoConnection = await connectToMongo();
        const result = await backfillAuditRow(resolvedDir, mongoConnection, {
          ...(opts.dryRun !== undefined ? { dryRun: opts.dryRun } : {}),
        });

        console.log(
          result.persisted
            ? `Backfilled ${result.auditId} (${result.siteUrl})`
            : `Would backfill ${result.auditId} (${result.siteUrl}); nothing was written`,
        );
        console.log(`  Findings: ${result.findingCount}`);
        console.log(`  Findings digest: ${result.findingsProvenance.findingsDigest}`);
        console.log(
          `  Normalization fingerprint: ${result.findingsProvenance.normalizationFingerprint}`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus backfill-audit: failed to backfill ${resolvedDir}\n${message}`);
        process.exitCode = 1;
      } finally {
        if (mongoConnection) await disconnectFromMongo(mongoConnection);
      }
    });
}
