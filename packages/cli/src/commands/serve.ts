import type { Command } from 'commander';
import { InvalidArgumentError } from 'commander';
import {
  getInterfacePort,
  isRetentionSweepEnabled,
  startInterfaceServer,
} from '@odysseus/interface';
import { connectToMongo, disconnectFromMongo } from '@odysseus/store';

function parsePort(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InvalidArgumentError(`must be a positive integer, got "${value}"`);
  }
  return parsed;
}

export function registerServeCommand(program: Command): void {
  program
    .command('serve')
    .description(
      'Start the local, private single-user dashboard and job queue. ' +
        'Binds to 127.0.0.1 by default; no login, no multi-tenancy.',
    )
    .option('--port <n>', 'Port to bind (default 4600, or ODYSSEUS_INTERFACE_PORT)', parsePort)
    .action(async (opts: { port?: number }) => {
      if (opts.port !== undefined) {
        process.env['ODYSSEUS_INTERFACE_PORT'] = String(opts.port);
      }

      try {
        const mongoConnection = await connectToMongo();
        const handle = await startInterfaceServer(mongoConnection, {
          pollOptOutRequests: true,
          syncMailbox: true,
          pollReferenceAuditReceipts: true,
          // Plan 077: only the VPS compose file sets the flag, so a local
          // serve never deletes this machine's audits on its own.
          retentionSweep: isRetentionSweepEnabled(),
        });
        console.log(`odysseus serve: listening at ${handle.url}`);

        let shuttingDown = false;
        const shutdown = async (signal: string, exitCode = 0): Promise<void> => {
          if (shuttingDown) return;
          shuttingDown = true;
          console.log(`\nodysseus serve: received ${signal}, shutting down`);
          try {
            await handle.close();
          } finally {
            await disconnectFromMongo(mongoConnection);
          }
          process.exit(exitCode);
        };

        process.on('SIGINT', () => void shutdown('SIGINT'));
        process.on('SIGTERM', () => void shutdown('SIGTERM'));
        // Issue #517: Node exits at once on an unhandled rejection, skipping
        // the queue's own shutdown. Log it with its stack, close the server
        // and the queue as a signal would, and exit non-zero so the
        // container's restart policy brings a clean process back.
        process.on('unhandledRejection', (reason) => {
          console.error('odysseus serve: unhandled promise rejection', reason);
          // A close that hangs must not keep a broken process serving.
          setTimeout(() => process.exit(1), 30_000).unref();
          void shutdown('unhandledRejection', 1);
        });
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === 'EADDRINUSE') {
          console.error(
            `odysseus serve: port ${getInterfacePort()} is already in use. ` +
              'Stop the other process or pass --port <n> to use a different one.',
          );
        } else {
          console.error(`odysseus serve: failed to start\n${err.message ?? String(error)}`);
        }
        process.exit(1);
      }
    });
}
