/**
 * `odysseus verify-reports` (issue #62): resolves every stored reports
 * row's fileRef against this machine's artifacts root and reports which
 * deliverables are verifiably present, which are missing, and which
 * were rendered on another machine (whose own artifacts root is where
 * their files live). Exit code 1 when anything is not verifiably
 * present, so it can gate a scripted check.
 */

import type { Command } from 'commander';
import { sweepReportIntegrity } from '@odysseus/interface';
import { connectToMongo, disconnectFromMongo } from '@odysseus/store';

export function registerVerifyReportsCommand(program: Command): void {
  program
    .command('verify-reports')
    .description(
      "Check every stored report row against the files on disk in this machine's artifacts root",
    )
    .action(async () => {
      const connection = await connectToMongo();
      try {
        const entries = await sweepReportIntegrity(connection);

        if (entries.length === 0) {
          console.log('No report rows stored.');
          return;
        }

        const byStatus = new Map<string, number>();
        for (const entry of entries) {
          byStatus.set(entry.status, (byStatus.get(entry.status) ?? 0) + 1);
          const label = `${entry.status.toUpperCase().padEnd(18)} ${entry.generatedAt.toISOString()} ${entry.language.toUpperCase()} ${entry.fileRef}`;
          console.log(label);
          if (entry.status !== 'ok') {
            console.log(`    ${entry.detail}`);
          }
        }

        const problems = entries.filter((entry) => entry.status !== 'ok').length;
        console.log(
          `\n${entries.length} report row(s) checked: ` +
            [...byStatus.entries()].map(([status, count]) => `${status} ${count}`).join(', ') +
            '.',
        );
        if (problems > 0) {
          console.log(
            `${problems} row(s) are not verifiably present on this machine; see the detail lines above.`,
          );
          process.exitCode = 1;
        }
      } finally {
        await disconnectFromMongo(connection);
      }
    });
}
