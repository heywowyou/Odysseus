/** Real-adapter runtime for creating outreach drafts. */

import type { Finding } from '@odysseus/core';
import {
  findOutreachPreviewByTokenHash,
  getFindingsForAudit,
  resolveOutreachAuditForCandidate,
} from '@odysseus/store';
import type { Connection } from 'mongoose';
import { getPreviewPublicBaseUrl } from '../config.js';
import { CURRENT_CONTACT_VERSION } from '../prospecting/hotel-contacts/discover-contacts.js';
import { CURRENT_PRESCAN_VERSION } from '../prospecting/hotel-prescan/prescan-hotels.js';
import { CURRENT_QUALIFICATION_VERSION } from '../prospecting/hotel-qualification/qualify-hotels.js';
import { createConfiguredMailboxDraftAdapter } from './configured-mailbox-draft-adapter.js';
import { criticalFindingCategoryOccurrences } from './critical-finding-counts.js';
import type {
  CreateFollowUpDraftResult,
  CreateFollowUpDraftStorePort,
} from './create-follow-up-draft.js';
import { createFollowUpDraft } from './create-follow-up-draft.js';
import type { CreateOutreachDraftResult } from './create-outreach-draft.js';
import { createOutreachDraft } from './create-outreach-draft.js';
import { createInMemoryMailboxDraftAdapter } from './in-memory-mailbox-draft-adapter.js';
import { createMongoFollowUpDraftStore } from './mongo-follow-up-draft-store.js';
import { createMongoOutreachDraftStore } from './mongo-outreach-draft-store.js';
import { resolvePublishedPreviewForDraft } from './publish-preview-v2.js';

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

        let validatedFindings: readonly Finding[] = [];
        const resolved = await resolvePublishedPreviewForDraft({
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
          findingsForAudit: async (auditId) => {
            validatedFindings = await getFindingsForAudit(connection, auditId);
            return validatedFindings;
          },
          candidateId: id,
          previewToken: token,
          publicBaseUrl: getPreviewPublicBaseUrl(),
        });
        if ('refusal' in resolved) return resolved;

        const criticalCategories = criticalFindingCategoryOccurrences(validatedFindings);
        if (criticalCategories.length === 0) return { refusal: 'preview-wrong-audit' };

        return { ...resolved, proofCardCategories: criticalCategories };
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
