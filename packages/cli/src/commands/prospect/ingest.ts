import type { Command } from 'commander';
import { connectToMongo, disconnectFromMongo } from '@odysseus/store';
import {
  createAtoutFranceSource,
  getAtoutFranceExportPath,
  importDirectory,
} from '@odysseus/interface';

/** Import the external directory into the durable Plan 047 prospect hub. */
export function registerIngestCommands(prospect: Command): void {
  prospect
    .command('directory-import')
    .description('Import the Atout France catalogue into the searchable prospect directory.')
    .option('--file <path>', 'Override the configured input path')
    .action(async (opts: { file?: string }) => {
      let connection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
      try {
        connection = await connectToMongo();
        const report = await importDirectory(
          connection,
          createAtoutFranceSource({ filePath: opts.file ?? getAtoutFranceExportPath() }),
        );
        console.log(JSON.stringify(report, null, 2));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus prospect directory-import: failed\n${message}`);
        process.exitCode = 1;
      } finally {
        if (connection) await disconnectFromMongo(connection);
      }
    });
}
