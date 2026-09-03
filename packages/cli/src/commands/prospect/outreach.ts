import type { Command } from 'commander';
import {
  connectToMongo,
  disconnectFromMongo,
  addSuppressionEntry,
  closeOutreachThreadsForDomain,
  findOutreachThreadById,
  listThreadsDueForFollowUp,
  recordOutreachOutcome,
} from '@odysseus/store';
import {
  isOutreachLostReason,
  isOutreachOutcome,
  type OutreachLostReason,
  type OutreachOutcome,
} from '@odysseus/core';
import {
  CURRENT_PRESCAN_VERSION,
  CURRENT_QUALIFICATION_VERSION,
  createConfiguredMailboxDraftAdapter,
  createConfiguredPreviewPublisher,
  createFollowUpDraft,
  createMongoFollowUpDraftStore,
  createMongoMailboxReconciliationStore,
  createMongoOutreachPreviewStore,
  getMailboxSenderAddress,
  missingMailboxEnvVars,
  reconcileMailbox,
  revokePreviewsForDomain,
} from '@odysseus/interface';
import { deleteLiveDraftsForDomain, mailboxFor, parsePositiveInt } from './shared.js';

/**
 * Milestone 9c plan 012. Reads the mailbox and writes thread state; never
 * sends anything and never creates or deletes a draft, except `draft-due`
 * (plan 012 step 4) which prepares follow-up drafts through the same
 * mailbox adapter `prospect draft` uses.
 */
export function registerOutreachCommand(prospect: Command): void {
  const outreachReconcile = prospect
    .command('outreach')
    .description(
      'Milestone 9c: reconcile mailbox activity (confirmed sends, replies, bounces) into ' +
        'outreach thread state.',
    );

  outreachReconcile
    .command('sync')
    .description(
      'Read mailbox metadata for every syncable thread and reconcile confirmed sends, replies ' +
        'and bounces into thread state. Reads message headers and labels only, never a body, ' +
        'and never sends or drafts anything.',
    )
    .option('--limit <n>', 'Maximum threads to sync', parsePositiveInt)
    .option('--thread <threadId>', 'Sync only this thread')
    .option('--dry-run', 'Classify every thread and write nothing', false)
    .action(async (opts: { limit?: number; thread?: string; dryRun: boolean }) => {
      const configured = createConfiguredMailboxDraftAdapter();
      if (configured === null) {
        console.error(
          `odysseus prospect outreach sync: no mailbox is configured. Set ` +
            `${missingMailboxEnvVars().join(', ')}.`,
        );
        process.exitCode = 1;
        return;
      }

      let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
      try {
        mongoConnection = await connectToMongo();
        const result = await reconcileMailbox({
          mailbox: configured,
          senderAddress: getMailboxSenderAddress(),
          store: createMongoMailboxReconciliationStore(mongoConnection),
          now: new Date(),
          ...(opts.limit === undefined ? {} : { limit: opts.limit }),
          ...(opts.thread === undefined ? {} : { threadId: opts.thread }),
          dryRun: opts.dryRun,
        });
        console.log(JSON.stringify(result, null, 2));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus prospect outreach sync: failed\n${message}`);
        process.exitCode = 1;
      } finally {
        if (mongoConnection) await disconnectFromMongo(mongoConnection);
      }
    });

  // Milestone 9c plan 012. `sync` detects a bounce from headers alone and
  // transitions the one thread to the terminal `bounced` state automatically
  // (gmail.metadata cannot tell "no such address" from "mailbox full", so
  // detection alone must not write a permanent hash). This command is the
  // separate, explicit step that writes it, running the same
  // suppression-then-draft-deletion-then-preview-revocation-then-close
  // workflow `object` runs, keyed by thread rather than by typed-in domain.
  outreachReconcile
    .command('bounce-confirm <threadId>')
    .description(
      "Confirm a detected bounce and record a permanent suppression entry for the thread's " +
        'domain and role address, then delete any live provider draft, withdraw every live ' +
        'preview, and close every open thread for that domain. Detection alone never suppresses.',
    )
    .action(async (threadId: string) => {
      let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
      try {
        mongoConnection = await connectToMongo();

        const thread = await findOutreachThreadById(mongoConnection, threadId);
        if (thread === null) {
          console.error(`odysseus prospect outreach bounce-confirm: unknown thread ${threadId}`);
          process.exitCode = 1;
          return;
        }

        const reason = `hard bounce confirmed on thread ${threadId}`;
        await addSuppressionEntry(mongoConnection, {
          domain: thread.domain,
          address: thread.roleAddress,
          reasonCode: 'hard-bounce',
          reason,
        });

        const drafts = await deleteLiveDraftsForDomain(mongoConnection, thread.domain);

        const revocation = await revokePreviewsForDomain({
          store: createMongoOutreachPreviewStore(mongoConnection, {
            prescanVersion: CURRENT_PRESCAN_VERSION,
            qualificationVersion: CURRENT_QUALIFICATION_VERSION,
          }),
          publisher: createConfiguredPreviewPublisher(),
          domain: thread.domain,
          reason,
        });

        const threads = await closeOutreachThreadsForDomain(mongoConnection, thread.domain, reason);

        console.log(
          JSON.stringify(
            {
              threadId,
              domain: thread.domain,
              ...revocation,
              draftsDeleted: drafts.draftsDeleted,
              threadsClosed: threads.closed,
              suppressed: true,
            },
            null,
            2,
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus prospect outreach bounce-confirm: failed\n${message}`);
        process.exitCode = 1;
      } finally {
        if (mongoConnection) await disconnectFromMongo(mongoConnection);
      }
    });

  outreachReconcile
    .command('outcome <threadId> <outcome>')
    .description(
      'Record one operator-set categorical outcome event and point the thread at it. ' +
        'Re-running the same actor, outcome and lost reason is a no-op.',
    )
    .option('--lost-reason <code>', 'Controlled reason code, valid only when outcome is lost')
    .option('--actor <name>', 'Who recorded the outcome', 'operator')
    .action(
      async (
        threadId: string,
        outcomeValue: string,
        opts: { lostReason?: string; actor: string },
      ) => {
        if (!isOutreachOutcome(outcomeValue)) {
          console.error(`odysseus prospect outreach outcome: unsupported outcome ${outcomeValue}`);
          process.exitCode = 1;
          return;
        }
        if (opts.lostReason !== undefined && outcomeValue !== 'lost') {
          console.error(
            'odysseus prospect outreach outcome: --lost-reason is valid only with lost',
          );
          process.exitCode = 1;
          return;
        }
        if (opts.lostReason !== undefined && !isOutreachLostReason(opts.lostReason)) {
          console.error(
            `odysseus prospect outreach outcome: unsupported lost reason ${opts.lostReason}`,
          );
          process.exitCode = 1;
          return;
        }

        let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
        try {
          mongoConnection = await connectToMongo();
          const result = await recordOutreachOutcome(mongoConnection, {
            threadId,
            outcome: outcomeValue as OutreachOutcome,
            ...(opts.lostReason === undefined
              ? {}
              : { lostReason: opts.lostReason as OutreachLostReason }),
            actor: opts.actor,
            recordedAt: new Date(),
          });
          if ('reason' in result) {
            console.error(`odysseus prospect outreach outcome: unknown thread ${threadId}`);
            process.exitCode = 1;
            return;
          }
          console.log(
            JSON.stringify(
              {
                recorded: result.recorded,
                outcomeId: result.outcome.outcomeId,
                threadId: result.outcome.threadId,
                outcome: result.outcome.outcome,
                lostReason: result.outcome.lostReason ?? null,
                actor: result.outcome.actor,
                recordedAt: result.outcome.recordedAt,
              },
              null,
              2,
            ),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`odysseus prospect outreach outcome: failed\n${message}`);
          process.exitCode = 1;
        } finally {
          if (mongoConnection) await disconnectFromMongo(mongoConnection);
        }
      },
    );

  // Milestone 9c plan 012 step 4. Syncs metadata first so a reply or bounce
  // that just landed is reflected before selection runs, per the plan's own
  // instruction - "who is due" (`listThreadsDueForFollowUp`) is otherwise a
  // stale read of thread state. Bounded by the same --limit for both halves,
  // matching `draft batch`'s own bounded-batch pattern; suppression is
  // rechecked inside `createFollowUpDraft` itself, immediately before
  // generation and again immediately before the provider call.
  outreachReconcile
    .command('draft-due')
    .description(
      'Sync mailbox metadata, then draft touch 2 or touch 3 for every thread whose prior touch ' +
        'is confirmed sent, whose spacing has elapsed, and which carries no reply, bounce, ' +
        'opt-out or review flag. Never sends, never publishes a preview, never adds a link.',
    )
    .requiredOption('--limit <n>', 'Maximum follow-up drafts to prepare', parsePositiveInt)
    .option('--prescan-version <version>', 'Prescan generation to read', CURRENT_PRESCAN_VERSION)
    .option(
      '--qualification-version <version>',
      'Qualification generation whose registry facts may be quoted',
      CURRENT_QUALIFICATION_VERSION,
    )
    .option(
      '--dry-run',
      'Sync with no writes and report what would be drafted, calling no model and creating no draft',
      false,
    )
    .action(
      async (opts: {
        limit: number;
        prescanVersion: string;
        qualificationVersion: string;
        dryRun: boolean;
      }) => {
        const configured = createConfiguredMailboxDraftAdapter();
        if (configured === null) {
          console.error(
            `odysseus prospect outreach draft-due: no mailbox is configured. Set ` +
              `${missingMailboxEnvVars().join(', ')}.`,
          );
          process.exitCode = 1;
          return;
        }
        const mailbox = mailboxFor(opts.dryRun, 'draft draft-due');
        if (mailbox === null) return;

        let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
        try {
          mongoConnection = await connectToMongo();

          const synced = await reconcileMailbox({
            mailbox: configured,
            senderAddress: getMailboxSenderAddress(),
            store: createMongoMailboxReconciliationStore(mongoConnection),
            now: new Date(),
            limit: opts.limit,
            dryRun: opts.dryRun,
          });

          const due = await listThreadsDueForFollowUp(mongoConnection, {
            now: new Date(),
            limit: opts.limit,
          });

          const store = createMongoFollowUpDraftStore(mongoConnection, {
            prescanVersion: opts.prescanVersion,
            qualificationVersion: opts.qualificationVersion,
          });

          const results = [];
          for (const thread of due) {
            const result = await createFollowUpDraft({
              store,
              mailbox,
              threadId: thread.threadId,
              dryRun: opts.dryRun,
            });
            results.push({ threadId: thread.threadId, ...result });
          }

          console.log(JSON.stringify({ synced, dueCount: due.length, results }, null, 2));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`odysseus prospect outreach draft-due: failed\n${message}`);
          process.exitCode = 1;
        } finally {
          if (mongoConnection) await disconnectFromMongo(mongoConnection);
        }
      },
    );

  // Milestone 9c plan 009. What /desinscription promises, as one command.
  //
  // The two halves are separate collections and separate concerns - suppression
  // stops the next contact, revocation stops the link already sitting in
  // somebody's inbox - and doing them as two commands is doing one of them and
  // forgetting the other on the day it matters. Suppression is written before
  // the sweep: the store refuses and self-revokes a preview record that lands
  // once it is in place, and the sweep then catches everything recorded before
  // it, so no interleaving of an in-flight publication with this command can
  // leave a live link on a suppressed domain. If the bucket is unreachable the
  // sweep fails loudly and re-runs safely; a repeat suppression entry is
  // harmless, since suppression reads any matching entry.
  prospect
    .command('object <domain>')
    .description(
      'Process an objection: record a permanent suppression entry, delete any live provider ' +
        'draft, withdraw every live preview for the domain, then close every open thread. Only ' +
        'hashes are stored, never the domain or the address.',
    )
    .option('--address <email>', 'Address that objected, suppressed alongside the domain')
    .option('--reason <text>', 'Reason recorded with every action', 'objection received')
    .action(async (domain: string, opts: { address?: string; reason: string }) => {
      let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
      try {
        mongoConnection = await connectToMongo();

        await addSuppressionEntry(mongoConnection, {
          domain,
          ...(opts.address !== undefined ? { address: opts.address } : {}),
          reasonCode: 'objection',
          reason: opts.reason,
        });

        const drafts = await deleteLiveDraftsForDomain(mongoConnection, domain);

        const revocation = await revokePreviewsForDomain({
          store: createMongoOutreachPreviewStore(mongoConnection, {
            prescanVersion: CURRENT_PRESCAN_VERSION,
            qualificationVersion: CURRENT_QUALIFICATION_VERSION,
          }),
          publisher: createConfiguredPreviewPublisher(),
          domain,
          reason: opts.reason,
        });

        // Threads close alongside the preview: a suppressed domain with an
        // open thread is a conversation the next batch would try to continue.
        const threads = await closeOutreachThreadsForDomain(mongoConnection, domain, opts.reason);

        console.log(
          JSON.stringify(
            {
              domain,
              ...revocation,
              draftsDeleted: drafts.draftsDeleted,
              threadsClosed: threads.closed,
              suppressed: true,
            },
            null,
            2,
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus prospect object: failed\n${message}`);
        process.exitCode = 1;
      } finally {
        if (mongoConnection) await disconnectFromMongo(mongoConnection);
      }
    });
}
