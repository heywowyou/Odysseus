import path from 'node:path';
import type { Command } from 'commander';
import { createConfiguredArtifactStore, renormalizeAudit } from '@odysseus/interface';

/**
 * Re-runs normalization offline, from stored scan.json files only. No
 * scanning, no network, no MongoDB: normalization rules will change
 * repeatedly across Milestones 4, 5, and 6, and without this, every
 * tuning pass would mean re-scanning a real client site (minutes, plus
 * another round of uninvited traffic) per iteration.
 *
 * Plan 045 slice 1.1: the real work moved to
 * @odysseus/interface's renormalizeAudit, so the dashboard's
 * make-report-ready pipeline can call the exact same implementation this
 * command always has. This file is now only the CLI's argument handling
 * and console output.
 */
export function registerNormalizeCommand(program: Command): void {
  program
    .command('normalize <artifacts-dir>')
    .description(
      'Re-run normalization offline against stored scan.json files in an audit directory. ' +
        'Overwrites findings.json. Never scans, never touches the network or MongoDB.',
    )
    .action(async (artifactsDir: string) => {
      const resolvedDir = path.resolve(artifactsDir);
      try {
        const result = await renormalizeAudit(resolvedDir, createConfiguredArtifactStore());
        console.log(`Re-normalized ${result.auditId} from ${result.pageCount} page(s)`);
        console.log(`  Findings: ${result.findingCount}`);
        console.log(`  Updated: ${path.join(resolvedDir, 'findings.json')}`);
        console.log('  MongoDB was not touched; this command is local-only.');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus normalize: failed to normalize ${resolvedDir}\n${message}`);
        process.exitCode = 1;
      }
    });
}
