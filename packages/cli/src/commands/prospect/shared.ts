import { InvalidArgumentError } from 'commander';
import type { connectToMongo } from '@odysseus/store';
import { listOutreachDrafts, listOutreachThreads, markOutreachDraftDeleted } from '@odysseus/store';
import {
  createConfiguredMailboxDraftAdapter,
  createInMemoryMailboxDraftAdapter,
  missingMailboxEnvVars,
  type MailboxDraftAdapter,
} from '@odysseus/interface';

/** Read ceiling for a prescan dry run, which takes no --limit because it
 *  contacts nobody. High enough to cover the whole qualified population, low
 *  enough that a mistake cannot stream an unbounded collection into memory. */
export const DRY_RUN_PLAN_CEILING = 10_000;

export function parsePositiveInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InvalidArgumentError(`must be a positive integer, got "${value}"`);
  }
  return parsed;
}

/** One shared factory, so `draft create`, `draft batch` and `outreach
 *  draft-due` cannot disagree about when a real mailbox is used. A dry run
 *  never touches the provider; a real run refuses rather than silently
 *  drafting into a double, because an operator told "draft created" must be
 *  able to find it in their mailbox. */
export function mailboxFor(dryRun: boolean, command: string): MailboxDraftAdapter | null {
  if (dryRun) return createInMemoryMailboxDraftAdapter();
  const configured = createConfiguredMailboxDraftAdapter();
  if (configured === null) {
    console.error(
      `odysseus prospect ${command}: no mailbox is configured, so no draft can be ` +
        `created. Set ${missingMailboxEnvVars().join(', ')}, or re-run with --dry-run.`,
    );
    process.exitCode = 1;
    return null;
  }
  return configured;
}

/**
 * Delete any live provider draft for every thread on a domain, milestone
 * 9c plan 012. A failure here must never leave a domain falsely marked
 * safe: it runs after the suppression write, which is what a repeat
 * `object` call recovers from if this step or a later one throws.
 * Silently does nothing when no mailbox is configured and there are no
 * live drafts to delete; if there are live drafts and no mailbox, that is
 * reported rather than swallowed, since a person needs to remove those by
 * hand.
 */
export async function deleteLiveDraftsForDomain(
  mongoConnection: Awaited<ReturnType<typeof connectToMongo>>,
  domain: string,
): Promise<{ draftsDeleted: number }> {
  const threads = await listOutreachThreads(mongoConnection, { domain });
  const liveDrafts = (
    await Promise.all(
      threads.map((thread) =>
        listOutreachDrafts(mongoConnection, { threadId: thread.threadId, status: 'created' }),
      ),
    )
  ).flat();

  if (liveDrafts.length === 0) return { draftsDeleted: 0 };

  const configured = createConfiguredMailboxDraftAdapter();
  if (configured === null) {
    throw new Error(
      `${String(liveDrafts.length)} live provider draft(s) exist for ${domain} and no ` +
        `mailbox is configured to delete them. Set ${missingMailboxEnvVars().join(', ')} and ` +
        `re-run, or remove them by hand before objecting.`,
    );
  }

  let draftsDeleted = 0;
  for (const draft of liveDrafts) {
    if (draft.providerDraftId !== undefined) {
      await configured.deleteDraft(draft.providerDraftId);
    }
    await markOutreachDraftDeleted(mongoConnection, draft.draftId);
    draftsDeleted += 1;
  }
  return { draftsDeleted };
}
