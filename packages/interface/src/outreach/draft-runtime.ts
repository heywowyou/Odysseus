/** Real-adapter runtime for creating outreach drafts. */

import {
  findLiveOutreachDraft,
  findOutreachPreviewByTokenHash,
  findOutreachThreadByCandidate,
  getFindingsForAudit,
  getHotelCandidate,
  resolveOutreachAuditForCandidate,
} from '@odysseus/store';
import type { Connection } from 'mongoose';
import { getPreviewPublicBaseUrl } from '../config.js';
import { CURRENT_CONTACT_VERSION } from '../prospecting/hotel-contacts/discover-contacts.js';
import { CURRENT_PRESCAN_VERSION } from '../prospecting/hotel-prescan/prescan-hotels.js';
import { CURRENT_QUALIFICATION_VERSION } from '../prospecting/hotel-qualification/qualify-hotels.js';
import { createConfiguredMailboxDraftAdapter } from './configured-mailbox-draft-adapter.js';
import { createConfiguredPreviewPublisher } from './configured-preview-publisher.js';
import type {
  CreateFollowUpDraftResult,
  CreateFollowUpDraftStorePort,
} from './create-follow-up-draft.js';
import { createFollowUpDraft } from './create-follow-up-draft.js';
import type {
  CreateOutreachDraftRefusal,
  CreateOutreachDraftResult,
} from './create-outreach-draft.js';
import { createOutreachDraft } from './create-outreach-draft.js';
import { createInMemoryMailboxDraftAdapter } from './in-memory-mailbox-draft-adapter.js';
import { createMongoFollowUpDraftStore } from './mongo-follow-up-draft-store.js';
import { createMongoOutreachDraftStore } from './mongo-outreach-draft-store.js';
import { createMongoOutreachPreviewStoreV2 } from './mongo-outreach-preview-store-v2.js';
import {
  publishPreviewV2,
  resolvePublishedPreviewForDraft,
  type PublishPreviewV2Refusal,
} from './publish-preview-v2.js';

export type DraftRuntimeRefusal = 'no-mailbox-configured';

export interface CreateTouchOneDraftOptions {
  language: 'fr' | 'en';
  previewToken?: string;
  prescanVersion?: string;
  qualificationVersion?: string;
  contactVersion?: string;
  dryRun?: boolean;
}

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
      async resolvePublished(id, token, _language) {
        if (token === '') return { refusal: 'preview-not-published' };

        return resolvePublishedPreviewForDraft({
          findByTokenHash: async (tokenHash) => {
            const record = await findOutreachPreviewByTokenHash(connection, tokenHash);
            if (record === null) return null;
            return {
              previewId: record.previewId,
              status: record.status,
              ...(record.sourceKind !== undefined ? { sourceKind: record.sourceKind } : {}),
              previewContentVersion: record.previewContentVersion,
              candidateId: record.candidateId,
              ...(record.auditId !== undefined ? { auditId: record.auditId } : {}),
              publicExpiresAt: record.publicExpiresAt,
            };
          },
          resolveOutreachAudit: async (resolvedCandidateId) => {
            const resolution = await resolveOutreachAuditForCandidate(
              connection,
              resolvedCandidateId,
            );
            return resolution.state === 'resolved'
              ? { state: 'resolved', audit: { auditId: resolution.audit.auditId } }
              : { state: 'refused' };
          },
          findingsForAudit: (auditId) => getFindingsForAudit(connection, auditId),
          candidateId: id,
          previewToken: token,
          publicBaseUrl: getPreviewPublicBaseUrl(),
        });
      },
    },
    publicBaseUrl: getPreviewPublicBaseUrl(),
    candidateId,
    language: options.language,
    dryRun,
    previewToken: options.previewToken ?? '',
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

/** The one call plan 045 section 1.7 collapses "publish, copy the token,
 *  paste it into the draft call" into. Reissue is safe here specifically
 *  because touch 1 has not happened yet: nobody outside this call has ever
 *  held a link to this hotel's evidence, so publishing a fresh one and
 *  superseding whatever was live costs nothing a first send would not
 *  already have cost. A later touch must not reuse this path - only touch 1
 *  gets to treat "no one has the old link" as true by construction. */
export type CreateFirstEmailRefusal =
  | 'draft-already-live'
  | PublishPreviewV2Refusal
  | 'no-mailbox-configured'
  | CreateOutreachDraftRefusal;

export type CreateFirstEmailResult =
  | { configured: false; refusal: 'no-preview-bucket-configured' }
  | {
      configured: true;
      created: boolean;
      refusal?: CreateFirstEmailRefusal;
      draftId?: string;
      threadId?: string;
      previewId?: string;
      /** The one-time published link, present whenever this call published
       *  one - even when drafting itself then refused. A publish is a real,
       *  paid-for side effect; the response must never let it go unreported
       *  just because the next step failed. */
      previewUrl?: string;
      subject?: string;
      body?: string;
    };

export async function createFirstEmailForCandidate(
  connection: Connection,
  candidateId: string,
  options: { language: 'fr' | 'en' },
): Promise<CreateFirstEmailResult> {
  const thread = await findOutreachThreadByCandidate(connection, candidateId);
  if (thread !== null) {
    const live = await findLiveOutreachDraft(connection, thread.threadId, 1);
    if (live !== null) return { configured: true, created: false, refusal: 'draft-already-live' };
  }

  let publisher;
  try {
    publisher = createConfiguredPreviewPublisher();
  } catch {
    return { configured: false, refusal: 'no-preview-bucket-configured' };
  }

  const previewStore = createMongoOutreachPreviewStoreV2(connection, {
    qualificationVersion: CURRENT_QUALIFICATION_VERSION,
  });

  const published = await publishPreviewV2({
    store: previewStore,
    publisher,
    publicBaseUrl: getPreviewPublicBaseUrl(),
    candidateId,
    language: options.language,
    dryRun: false,
  });
  if (!published.published || published.previewId === undefined || published.url === undefined) {
    return {
      configured: true,
      created: false,
      refusal: published.refusal ?? 'insufficient-safe-cards',
    };
  }

  // Exactly one live preview per hotel is what `preview revoke` already
  // guarantees for v1; a fresh v2 publish keeps that true instead of leaving
  // an older link (v1 or v2) quietly still resolvable alongside the new one.
  const candidate = await getHotelCandidate(connection, candidateId);
  const domain = candidate?.ownRegistrableDomain;
  if (domain !== undefined && domain !== null && domain !== '') {
    const live = await previewStore.listLivePreviews(domain);
    for (const preview of live) {
      if (preview.previewId === published.previewId) continue;
      await previewStore.revokePreview(preview.previewId, 'superseded by a new first-email call');
    }
  }

  const previewToken = published.url.split('/').at(-1) ?? '';
  const draft = await createTouchOneDraft(connection, candidateId, {
    language: options.language,
    dryRun: false,
    previewToken,
  });
  if (!draft.configured) {
    return {
      configured: true,
      created: false,
      refusal: 'no-mailbox-configured',
      previewId: published.previewId,
      previewUrl: published.url,
    };
  }
  if (!draft.created) {
    return {
      configured: true,
      created: false,
      ...(draft.refusal === undefined ? {} : { refusal: draft.refusal }),
      previewId: published.previewId,
      previewUrl: published.url,
    };
  }
  return {
    configured: true,
    created: true,
    ...(draft.draftId === undefined ? {} : { draftId: draft.draftId }),
    ...(draft.threadId === undefined ? {} : { threadId: draft.threadId }),
    previewId: draft.previewId ?? published.previewId,
    previewUrl: published.url,
    ...(draft.subject === undefined ? {} : { subject: draft.subject }),
    ...(draft.body === undefined ? {} : { body: draft.body }),
  };
}
