import type { Command } from 'commander';
import {
  connectToMongo,
  disconnectFromMongo,
  findOutreachDraftById,
  listContactableCohortMembers,
  listOutreachDrafts,
  markOutreachDraftDeleted,
} from '@odysseus/store';
import {
  CURRENT_CONTACT_VERSION,
  CURRENT_OUTREACH_PROMPT_VERSION,
  CURRENT_PRESCAN_VERSION,
  CURRENT_QUALIFICATION_VERSION,
  createConfiguredMailboxDraftAdapter,
  createTouchOneDraft,
  missingMailboxEnvVars,
} from '@odysseus/interface';
import { mailboxFor, parsePositiveInt } from './shared.js';

/**
 * Milestone 9c plan 011: prepare, review and withdraw outreach drafts.
 * Drafts are created in the mailbox for a person to read and send by hand.
 * Preparing a message is automated; deciding to send it is not, and there is
 * deliberately no command here that could.
 */
export function registerDraftCommand(prospect: Command): void {
  const draft = prospect
    .command('draft')
    .description(
      'Milestone 9c: prepare, review and withdraw outreach drafts. Drafts are created in the ' +
        'mailbox for a person to read and send by hand. Nothing here sends anything.',
    );

  draft
    .command('create <candidateId>')
    .description(
      'Prepare the first outreach draft for one candidate: publish its preview, generate and ' +
        'validate the prose, and create the draft in the mailbox for review. Never sends.',
    )
    .option('--language <fr|en>', 'Language of the draft', 'fr')
    .option('--prescan-version <version>', 'Prescan generation to read', CURRENT_PRESCAN_VERSION)
    .option(
      '--qualification-version <version>',
      'Qualification generation whose registry facts may be quoted',
      CURRENT_QUALIFICATION_VERSION,
    )
    .option('--contact-version <version>', 'Contact generation to read', CURRENT_CONTACT_VERSION)
    .option(
      '--dry-run',
      'Report what would be drafted, calling no model, publishing no preview and creating no draft',
      false,
    )
    .action(
      async (
        candidateId: string,
        opts: {
          language: string;
          prescanVersion: string;
          qualificationVersion: string;
          contactVersion: string;
          dryRun: boolean;
        },
      ) => {
        if (opts.language !== 'fr' && opts.language !== 'en') {
          console.error('odysseus prospect draft create: --language must be fr or en');
          process.exitCode = 1;
          return;
        }

        // Refuse before connecting, so an operator without a mailbox sees the
        // real cause rather than a database error standing in front of it.
        // Same guard, in the same place, as the batch action below.
        if (!opts.dryRun && createConfiguredMailboxDraftAdapter() === null) {
          console.error(
            `odysseus prospect draft create: no mailbox is configured. Set ` +
              `${missingMailboxEnvVars().join(', ')}, or re-run with --dry-run.`,
          );
          process.exitCode = 1;
          return;
        }

        let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
        try {
          mongoConnection = await connectToMongo();
          const outcome = await createTouchOneDraft(mongoConnection, candidateId, {
            language: opts.language,
            prescanVersion: opts.prescanVersion,
            qualificationVersion: opts.qualificationVersion,
            contactVersion: opts.contactVersion,
            dryRun: opts.dryRun,
          });

          if (!outcome.configured) {
            console.error(
              `odysseus prospect draft create: no mailbox is configured. Set ` +
                `${missingMailboxEnvVars().join(', ')}, or re-run with --dry-run.`,
            );
            process.exitCode = 1;
            return;
          }
          const { configured: _configured, ...result } = outcome;

          console.log(
            JSON.stringify({ promptVersion: CURRENT_OUTREACH_PROMPT_VERSION, ...result }, null, 2),
          );

          if (!result.created && !opts.dryRun) {
            // A refusal is a correct outcome, not a crash, but it must not read
            // as success to a script or to a person skimming the output.
            console.error(
              `odysseus prospect draft create: nothing drafted (${result.refusal ?? 'unknown reason'})`,
            );
            process.exitCode = 1;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`odysseus prospect draft create: failed\n${message}`);
          process.exitCode = 1;
        } finally {
          if (mongoConnection) await disconnectFromMongo(mongoConnection);
        }
      },
    );

  draft
    .command('batch')
    .description(
      'Prepare first drafts for up to --limit contactable cohort members, stopping on the ' +
        'first authentication or provider error. Never sends, and does not pace anything.',
    )
    .requiredOption('--limit <n>', 'Maximum drafts to prepare', parsePositiveInt)
    .option('--language <fr|en>', 'Language of the drafts', 'fr')
    .option('--prescan-version <version>', 'Prescan generation to read', CURRENT_PRESCAN_VERSION)
    .option(
      '--qualification-version <version>',
      'Qualification generation whose registry facts may be quoted',
      CURRENT_QUALIFICATION_VERSION,
    )
    .option('--contact-version <version>', 'Contact generation to read', CURRENT_CONTACT_VERSION)
    .option('--dry-run', 'Report what would be drafted, observing nothing', false)
    .action(
      async (opts: {
        limit: number;
        language: string;
        prescanVersion: string;
        qualificationVersion: string;
        contactVersion: string;
        dryRun: boolean;
      }) => {
        if (opts.language !== 'fr' && opts.language !== 'en') {
          console.error('odysseus prospect draft batch: --language must be fr or en');
          process.exitCode = 1;
          return;
        }
        if (!opts.dryRun && createConfiguredMailboxDraftAdapter() === null) {
          console.error(
            `odysseus prospect draft batch: no mailbox is configured. Set ` +
              `${missingMailboxEnvVars().join(', ')}, or re-run with --dry-run.`,
          );
          process.exitCode = 1;
          return;
        }

        let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
        try {
          mongoConnection = await connectToMongo();
          const connection = mongoConnection;
          const members = await listContactableCohortMembers(connection, {
            contactVersion: opts.contactVersion,
            limit: opts.limit,
          });

          const outcomes: { candidateId: string; created: boolean; refusal?: string }[] = [];
          for (const member of members) {
            const outcome = await createTouchOneDraft(connection, member.candidateId, {
              language: opts.language,
              prescanVersion: opts.prescanVersion,
              qualificationVersion: opts.qualificationVersion,
              contactVersion: opts.contactVersion,
              dryRun: opts.dryRun,
            });
            if (!outcome.configured) {
              // A mailbox that stopped authenticating mid-batch is the same
              // "stop the whole run" case the catch block below handles.
              throw new Error(
                `no mailbox is configured. Set ${missingMailboxEnvVars().join(', ')}.`,
              );
            }
            outcomes.push({
              candidateId: member.candidateId,
              created: outcome.created,
              ...(outcome.refusal === undefined ? {} : { refusal: outcome.refusal }),
            });
          }

          console.log(
            JSON.stringify(
              {
                promptVersion: CURRENT_OUTREACH_PROMPT_VERSION,
                considered: members.length,
                created: outcomes.filter((outcome) => outcome.created).length,
                outcomes,
              },
              null,
              2,
            ),
          );
        } catch (error) {
          // Stops the whole batch, per plan 011: an authentication or provider
          // failure repeated across a run is how a mailbox gets rate limited.
          const message = error instanceof Error ? error.message : String(error);
          console.error(`odysseus prospect draft batch: stopped\n${message}`);
          process.exitCode = 1;
        } finally {
          if (mongoConnection) await disconnectFromMongo(mongoConnection);
        }
      },
    );

  draft
    .command('list')
    .description('List drafts awaiting a human review, newest first.')
    .option('--status <created|deleted|failed>', 'Which drafts to list', 'created')
    .option('--limit <n>', 'Maximum rows', parsePositiveInt, 50)
    .action(async (opts: { status: string; limit: number }) => {
      if (opts.status !== 'created' && opts.status !== 'deleted' && opts.status !== 'failed') {
        console.error('odysseus prospect draft list: --status must be created, deleted or failed');
        process.exitCode = 1;
        return;
      }
      let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
      try {
        mongoConnection = await connectToMongo();
        const rows = await listOutreachDrafts(mongoConnection, {
          status: opts.status,
          limit: opts.limit,
        });
        console.log(
          JSON.stringify(
            rows.map((row) => ({
              draftId: row.draftId,
              candidateId: row.candidateId,
              touch: row.touch,
              language: row.language,
              roleAddress: row.roleAddress,
              subject: row.subject,
              providerDraftId: row.providerDraftId,
              status: row.status,
              failureReason: row.failureReason,
              createdAt: row.createdAt,
            })),
            null,
            2,
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus prospect draft list: failed\n${message}`);
        process.exitCode = 1;
      } finally {
        if (mongoConnection) await disconnectFromMongo(mongoConnection);
      }
    });

  draft
    .command('show <draftId>')
    .description(
      'Print one draft exactly as it will be read: subject, body, preview link and the ' +
        'contract versions behind it. This is the per-draft review the operator performs.',
    )
    .action(async (draftId: string) => {
      let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
      try {
        mongoConnection = await connectToMongo();
        const row = await findOutreachDraftById(mongoConnection, draftId);
        if (row === null) {
          console.error(`odysseus prospect draft show: no draft ${draftId}`);
          process.exitCode = 1;
          return;
        }
        console.log(
          JSON.stringify(
            {
              draftId: row.draftId,
              candidateId: row.candidateId,
              touch: row.touch,
              language: row.language,
              roleAddress: row.roleAddress,
              previewUrl: row.previewUrl,
              prescanVersion: row.prescanVersion,
              evidenceVersion: row.evidenceVersion,
              outreachPromptVersion: row.outreachPromptVersion,
              providerDraftId: row.providerDraftId,
              status: row.status,
              subject: row.subject,
            },
            null,
            2,
          ),
        );
        console.log(`\n--- body ---\n${row.body}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus prospect draft show: failed\n${message}`);
        process.exitCode = 1;
      } finally {
        if (mongoConnection) await disconnectFromMongo(mongoConnection);
      }
    });

  draft
    .command('delete <draftId>')
    .description(
      'Withdraw a draft the operator has rejected: removed from the mailbox first, so a ' +
        'record can never read deleted while the draft is still sitting there.',
    )
    .action(async (draftId: string) => {
      const mailbox = mailboxFor(false, 'draft delete');
      if (mailbox === null) return;

      let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
      try {
        mongoConnection = await connectToMongo();
        const row = await findOutreachDraftById(mongoConnection, draftId);
        if (row === null) {
          console.error(`odysseus prospect draft delete: no draft ${draftId}`);
          process.exitCode = 1;
          return;
        }
        if (row.providerDraftId !== undefined) {
          await mailbox.deleteDraft(row.providerDraftId);
        }
        const result = await markOutreachDraftDeleted(mongoConnection, draftId);
        console.log(JSON.stringify({ draftId, ...result }, null, 2));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus prospect draft delete: failed\n${message}`);
        process.exitCode = 1;
      } finally {
        if (mongoConnection) await disconnectFromMongo(mongoConnection);
      }
    });
}
