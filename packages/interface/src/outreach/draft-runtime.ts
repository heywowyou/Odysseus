/**
 * Real-adapter runtime for creating outreach drafts, milestone 9c plan 030.
 *
 * `createOutreachDraft` and `createFollowUpDraft` are pure orchestrators over
 * injected ports (store, mailbox, preview). Building the real Mongo/mailbox/
 * bucket adapters behind those ports used to be inlined separately in the CLI
 * (`prospect draft create`, `prospect draft batch`, `prospect outreach
 * draft-due`). This module is the one place that does it now, so the CLI and
 * the interface's dashboard routes and job runners share one definition of
 * "a real draft" rather than three copies that could quietly drift.
 *
 * Both functions return the orchestrators' own refusal-not-throw result
 * shapes unchanged: a refusal is a correct outcome, not an error, and the
 * caller (a CLI command, an HTTP route, or a batch job) decides how to
 * present it.
 */

import type { Connection } from 'mongoose';
import type {
  CreateFollowUpDraftResult,
  CreateFollowUpDraftStorePort,
} from './create-follow-up-draft.js';
import { createFollowUpDraft } from './create-follow-up-draft.js';
import type { CreateOutreachDraftResult } from './create-outreach-draft.js';
import { createOutreachDraft } from './create-outreach-draft.js';
import { createMongoFollowUpDraftStore } from './mongo-follow-up-draft-store.js';
import { createMongoOutreachDraftStore } from './mongo-outreach-draft-store.js';
import { createMongoOutreachPreviewStore } from './mongo-outreach-preview-store.js';
import { createConfiguredMailboxDraftAdapter } from './configured-mailbox-draft-adapter.js';
import { createInMemoryMailboxDraftAdapter } from './in-memory-mailbox-draft-adapter.js';
import { createConfiguredPreviewPublisher } from './configured-preview-publisher.js';
import { createInMemoryPreviewPublisher } from './in-memory-preview-publisher.js';
import { publishPreview } from './publish-preview.js';
import { getPreviewPublicBaseUrl, missingMailboxEnvVars } from '../config.js';
import { CURRENT_CONTACT_VERSION } from '../prospecting/hotel-contacts/discover-contacts.js';
import { CURRENT_PRESCAN_VERSION } from '../prospecting/hotel-prescan/prescan-hotels.js';
import { CURRENT_QUALIFICATION_VERSION } from '../prospecting/hotel-qualification/qualify-hotels.js';

export type DraftRuntimeRefusal = 'no-mailbox-configured';

export interface CreateTouchOneDraftOptions {
  language: 'fr' | 'en';
  prescanVersion?: string;
  qualificationVersion?: string;
  contactVersion?: string;
  /** A dry run never reaches a mailbox or a bucket: `createOutreachDraft`
   *  itself returns its `plan` before touching either, so the in-memory
   *  adapters below exist only to satisfy the port's type, exactly as the
   *  CLI's own `mailboxFor` did before this module existed. */
  dryRun?: boolean;
}

/** No mailbox configured is distinguished from every other refusal because
 *  it is an operator setup problem, not a fact about the candidate - the
 *  caller (a route, a job) needs to tell those apart to show the right
 *  message. Never returned for a dry run, which needs no real mailbox. */
export type CreateTouchOneDraftResult =
  | ({ configured: true } & CreateOutreachDraftResult)
  | { configured: false; refusal: DraftRuntimeRefusal };

export async function createTouchOneDraft(
  connection: Connection,
  candidateId: string,
  options: CreateTouchOneDraftOptions,
): Promise<CreateTouchOneDraftResult> {
  const dryRun = options.dryRun ?? false;
  const mailbox = dryRun
    ? createInMemoryMailboxDraftAdapter()
    : createConfiguredMailboxDraftAdapter();
  if (mailbox === null) {
    return { configured: false, refusal: 'no-mailbox-configured' };
  }

  const prescanVersion = options.prescanVersion ?? CURRENT_PRESCAN_VERSION;
  const qualificationVersion = options.qualificationVersion ?? CURRENT_QUALIFICATION_VERSION;
  const contactVersion = options.contactVersion ?? CURRENT_CONTACT_VERSION;

  const result = await createOutreachDraft({
    store: createMongoOutreachDraftStore(connection, {
      prescanVersion,
      qualificationVersion,
      contactVersion,
    }),
    mailbox,
    preview: {
      async publish(id, language) {
        const published = await publishPreview({
          store: createMongoOutreachPreviewStore(connection, {
            prescanVersion,
            qualificationVersion,
          }),
          publisher: dryRun ? createInMemoryPreviewPublisher() : createConfiguredPreviewPublisher(),
          publicBaseUrl: getPreviewPublicBaseUrl(),
          candidateId: id,
          language,
          dryRun: false,
        });
        if (!published.published || published.url === undefined) {
          return { refusal: published.refusal ?? 'unknown' };
        }
        return {
          previewId: published.previewId as string,
          url: published.url,
          publicExpiresAt: published.publicExpiresAt as Date,
        };
      },
    },
    publicBaseUrl: getPreviewPublicBaseUrl(),
    candidateId,
    language: options.language,
    dryRun,
  });

  return { configured: true, ...result };
}

export interface CreateFollowUpForCandidateOptions {
  prescanVersion?: string;
  qualificationVersion?: string;
  dryRun?: boolean;
}

export type CreateFollowUpForCandidateResult =
  | ({ configured: true } & CreateFollowUpDraftResult)
  | { configured: false; refusal: DraftRuntimeRefusal };

export async function createFollowUpForCandidate(
  connection: Connection,
  threadId: string,
  options: CreateFollowUpForCandidateOptions = {},
): Promise<CreateFollowUpForCandidateResult> {
  const dryRun = options.dryRun ?? false;
  const mailbox = dryRun
    ? createInMemoryMailboxDraftAdapter()
    : createConfiguredMailboxDraftAdapter();
  if (mailbox === null) {
    return { configured: false, refusal: 'no-mailbox-configured' };
  }

  const store: CreateFollowUpDraftStorePort = createMongoFollowUpDraftStore(connection, {
    prescanVersion: options.prescanVersion ?? CURRENT_PRESCAN_VERSION,
    qualificationVersion: options.qualificationVersion ?? CURRENT_QUALIFICATION_VERSION,
  });

  const result = await createFollowUpDraft({ store, mailbox, threadId, dryRun });
  return { configured: true, ...result };
}

export { missingMailboxEnvVars };
