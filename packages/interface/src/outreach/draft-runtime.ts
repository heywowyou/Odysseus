/** Prospect-native runtime for the operator's draft actions. */

import {
  buildOutreachFactsBlock,
  isTerminalOutreachThreadState,
  NORMALIZATION_FINGERPRINT,
  primaryWebsite,
} from '@odysseus/core';
import {
  advanceThreadTouch,
  attachProviderThreadId,
  checkOutreachAction,
  createAuditModel,
  createJobModel,
  effectiveAuditScanIntent,
  findLiveOutreachDraft,
  findOutreachPreviewByTokenHash,
  findOutreachThreadByProspect,
  getFindingsForAudit,
  getProspectHub,
  listOutreachDrafts,
  openOutreachThread,
  recordFailedOutreachDraft,
  recordOutreachDraft,
  selectNewestQualifyingAudit,
  type AuditIntentSourceJob,
  type ProspectWorkAudit,
  transitionOutreachThread,
} from '@odysseus/store';
import type { OutreachActionRefusal } from '@odysseus/store';
import type { Connection } from 'mongoose';
import {
  getOutreachReplyWindowDays,
  getOutreachTouch2AfterDays,
  getOutreachTouch3AfterDays,
  getPreviewPublicBaseUrl,
} from '../config.js';
import { assembleOutreachDraft } from './assemble-outreach-draft.js';
import { createConfiguredMailboxDraftAdapter } from './configured-mailbox-draft-adapter.js';
import {
  createConfiguredOptOutBucket,
  createConfiguredPreviewPublisher,
} from './configured-preview-publisher.js';
import { createOptOutLink, storeOptOutLink } from './opt-out-bucket.js';
import { createInMemoryMailboxDraftAdapter } from './in-memory-mailbox-draft-adapter.js';
import { formatHotelName } from './hotel-name.js';
import { createMongoOutreachPreviewStoreV2 } from './mongo-outreach-preview-store-v2.js';
import type { MailboxDraftAdapter } from './mailbox-draft-adapter.js';
import {
  previewLinks,
  publishPreviewV2,
  resolvePublishedPreviewForDraft,
} from './publish-preview-v2.js';

const CURRENT_OUTREACH_PROMPT_VERSION = 'template-v2';
const EVIDENCE_VERSION = `full-audit:${NORMALIZATION_FINGERPRINT}`;

export type DraftRuntimeRefusal = 'no-mailbox-configured';

type DraftRefusal =
  | 'prospect-unknown'
  | 'no-usable-contact'
  | 'suppressed-before-generation'
  | 'suppressed-before-provider'
  | 'preview-not-published'
  | 'preview-revoked'
  | 'preview-expired'
  | 'preview-wrong-audit'
  | 'domain-mismatch'
  | 'thread-closed'
  | 'draft-already-live'
  | 'assembly-refused'
  | 'provider-draft-unrecorded'
  | 'thread-unknown'
  | 'thread-not-eligible'
  | 'previous-draft-missing'
  | OutreachActionRefusal;

export interface CreateTouchOneDraftOptions {
  language: 'fr' | 'en';
  previewToken?: string;
  dryRun?: boolean;
}

export type CreateTouchOneDraftResult =
  | { configured: false; refusal: DraftRuntimeRefusal }
  | {
      configured: true;
      created: boolean;
      refusal?: DraftRefusal;
      draftId?: string;
      threadId?: string;
      providerDraftId?: string;
      previewId?: string;
      previewUrl?: string;
      subject?: string;
      body?: string;
      plan?: {
        wouldDraft: true;
        domain: string;
        roleAddress: string;
        language: 'fr' | 'en';
        touch: 1;
      };
    };

async function resolvePreview(connection: Connection, prospectId: string, token: string) {
  if (token === '') return { refusal: 'preview-not-published' as const };
  const result = await resolvePublishedPreviewForDraft({
    findByTokenHash: async (tokenHash) => {
      const record = await findOutreachPreviewByTokenHash(connection, tokenHash);
      if (record === null) return null;
      return {
        previewId: record.previewId,
        status: record.status,
        ...(record.sourceKind === undefined ? {} : { sourceKind: record.sourceKind }),
        previewContentVersion: record.previewContentVersion,
        prospectId: record.prospectId,
        ...(record.auditId === undefined ? {} : { auditId: record.auditId }),
        publicExpiresAt: record.publicExpiresAt,
      };
    },
    resolveOutreachAudit: async (id) => {
      const audits = await createAuditModel(connection)
        .find({ prospectId: id })
        .select({
          _id: 0,
          auditId: 1,
          prospectId: 1,
          scanIntent: 1,
          siteUrl: 1,
          kind: 1,
          startedAt: 1,
          finishedAt: 1,
          pages: 1,
          crawl: 1,
          continuationGuardSummary: 1,
          'findingsProvenance.normalizationFingerprint': 1,
        })
        .sort({ startedAt: -1, auditId: -1 })
        .lean<ProspectWorkAudit[]>();
      const auditIds = audits.map((audit) => audit.auditId);
      const jobScope: Record<string, unknown>[] = [{ 'options.prospectId': id }];
      if (auditIds.length > 0) {
        jobScope.push({ auditId: { $in: auditIds } }, { auditIds: { $in: auditIds } });
      }
      const jobs = await createJobModel(connection)
        .find({ $or: jobScope })
        .select({ _id: 0, type: 1, auditId: 1, auditIds: 1, 'options.scanType': 1 })
        .lean<AuditIntentSourceJob[]>();
      const classifiedAudits = audits.map((audit) => {
        const scanIntent = effectiveAuditScanIntent(audit, jobs);
        return scanIntent === undefined ? audit : { ...audit, scanIntent };
      });
      const selected = selectNewestQualifyingAudit(classifiedAudits);
      return selected.audit === undefined
        ? { state: 'refused' as const }
        : { state: 'resolved' as const, audit: { auditId: selected.audit.auditId } };
    },
    findingsForAudit: (auditId) => getFindingsForAudit(connection, auditId),
    prospectId,
    previewToken: token,
    publicBaseUrl: getPreviewPublicBaseUrl(),
  });
  return result;
}

function configuredMailbox(dryRun: boolean): MailboxDraftAdapter | null {
  return dryRun ? createInMemoryMailboxDraftAdapter() : createConfiguredMailboxDraftAdapter();
}

export async function createTouchOneDraft(
  connection: Connection,
  prospectId: string,
  options: CreateTouchOneDraftOptions,
): Promise<CreateTouchOneDraftResult> {
  const prospect = await getProspectHub(connection, prospectId);
  if (prospect === null) return { configured: true, created: false, refusal: 'prospect-unknown' };

  const contact = prospect.emails[0];
  if (contact === undefined) return { configured: true, created: false, refusal: 'no-contact' };
  const allowed = await checkOutreachAction(connection, { prospect, action: 'first-email' });
  if (!allowed.allowed) return { configured: true, created: false, refusal: allowed.refusal };

  const dryRun = options.dryRun ?? false;
  const mailbox = configuredMailbox(dryRun);
  if (mailbox === null) return { configured: false, refusal: 'no-mailbox-configured' };

  const preview = await resolvePreview(connection, prospectId, options.previewToken ?? '');
  if ('refusal' in preview) return { configured: true, created: false, refusal: preview.refusal };

  const website = primaryWebsite(prospect.websites);
  if (website === undefined)
    return { configured: true, created: false, refusal: 'domain-mismatch' };

  const now = new Date();
  const existing = await findOutreachThreadByProspect(connection, prospectId);
  if (existing !== null) {
    if (isTerminalOutreachThreadState(existing.state)) {
      return { configured: true, created: false, refusal: 'thread-closed' };
    }
    if (await findLiveOutreachDraft(connection, existing.threadId, 1)) {
      return { configured: true, created: false, refusal: 'draft-already-live' };
    }
  }

  const thread = await openOutreachThread(connection, {
    prospectId,
    previewId: preview.previewId,
    domain: website.registrableDomain,
    roleAddress: contact.address,
    language: options.language,
    openedAt: now,
    spacing: {
      touch2AfterDays: getOutreachTouch2AfterDays(),
      touch3AfterDays: getOutreachTouch3AfterDays(),
      replyWindowDays: getOutreachReplyWindowDays(),
    },
  });
  if (isTerminalOutreachThreadState(thread.thread.state)) {
    return { configured: true, created: false, refusal: 'thread-closed' };
  }
  if (await findLiveOutreachDraft(connection, thread.thread.threadId, 1)) {
    return { configured: true, created: false, refusal: 'draft-already-live' };
  }

  const links = previewLinks(getPreviewPublicBaseUrl());
  // Personal to this recipient, so the opt-out page can prefill the address.
  const optOutLink = createOptOutLink(getPreviewPublicBaseUrl());
  const assembled = assembleOutreachDraft({
    touch: 1,
    language: options.language,
    hotelName: formatHotelName(prospect.name),
    variantSeed: prospectId,
    scanSummary: {
      distinctFindingCount: preview.distinctFindingCount,
      affectedPageCount: preview.affectedPageCount,
      severityTotals: preview.severityTotals,
      proofCardCategories: preview.proofCardCategories,
    },
    previewUrl: preview.url,
    dataOrigins: ['public-hotel-catalogue', 'public-website'],
    privacyUrl: links.privacy,
    optOutUrl: optOutLink.url,
  });
  if (!assembled.assembled) {
    await recordFailedOutreachDraft(connection, {
      prospectId,
      threadId: thread.thread.threadId,
      touch: 1,
      language: options.language,
      roleAddress: contact.address,
      previewId: preview.previewId,
      previewUrl: preview.url,
      evidenceVersion: EVIDENCE_VERSION,
      outreachPromptVersion: CURRENT_OUTREACH_PROMPT_VERSION,
      failureReason: 'assembly-refused',
      createdAt: now,
    });
    return { configured: true, created: false, refusal: 'assembly-refused' };
  }

  if (dryRun) {
    return {
      configured: true,
      created: false,
      plan: {
        wouldDraft: true,
        domain: website.registrableDomain,
        roleAddress: contact.address,
        language: options.language,
        touch: 1,
      },
    };
  }

  const finalGate = await checkOutreachAction(connection, { prospect, action: 'first-email' });
  if (!finalGate.allowed) {
    await recordFailedOutreachDraft(connection, {
      prospectId,
      threadId: thread.thread.threadId,
      touch: 1,
      language: options.language,
      roleAddress: contact.address,
      previewId: preview.previewId,
      previewUrl: preview.url,
      evidenceVersion: EVIDENCE_VERSION,
      outreachPromptVersion: CURRENT_OUTREACH_PROMPT_VERSION,
      failureReason: 'suppressed-before-provider',
      createdAt: now,
    });
    return { configured: true, created: false, refusal: 'suppressed-before-provider' };
  }

  // Written before the draft exists, so no email can carry a link whose
  // prefill object is missing.
  await storeOptOutLink(createConfiguredOptOutBucket(), optOutLink.token, contact.address, now);

  const providerDraft = await mailbox.createDraft({
    to: contact.address,
    subject: assembled.subject,
    body: assembled.body,
    htmlBody: assembled.htmlBody,
    ...(thread.thread.providerThreadId === undefined
      ? {}
      : { providerThreadId: thread.thread.providerThreadId }),
  });

  let draft;
  try {
    draft = await recordOutreachDraft(connection, {
      prospectId,
      threadId: thread.thread.threadId,
      touch: 1,
      language: options.language,
      roleAddress: contact.address,
      subject: assembled.subject,
      body: assembled.body,
      htmlBody: assembled.htmlBody,
      previewId: preview.previewId,
      previewUrl: preview.url,
      evidenceVersion: EVIDENCE_VERSION,
      outreachPromptVersion: CURRENT_OUTREACH_PROMPT_VERSION,
      providerDraftId: providerDraft.providerDraftId,
      providerMessageId: providerDraft.providerMessageId,
      providerThreadId: providerDraft.providerThreadId,
      createdAt: now,
    });
  } catch {
    await mailbox.deleteDraft(providerDraft.providerDraftId).catch(() => undefined);
    return { configured: true, created: false, refusal: 'provider-draft-unrecorded' };
  }

  await attachProviderThreadId(connection, thread.thread.threadId, providerDraft.providerThreadId);
  await advanceThreadTouch(connection, thread.thread.threadId, 1);
  await transitionOutreachThread(connection, {
    threadId: thread.thread.threadId,
    from: ['open'],
    to: 'e1-drafted',
    at: now,
    reason: 'draft-created',
  });
  return {
    configured: true,
    created: true,
    draftId: draft.draftId,
    threadId: thread.thread.threadId,
    providerDraftId: providerDraft.providerDraftId,
    previewId: preview.previewId,
    previewUrl: preview.url,
    subject: assembled.subject,
    body: assembled.body,
  };
}

export type CreateFirstEmailRefusal =
  | DraftRefusal
  | 'no-preview-bucket-configured'
  | 'no-mailbox-configured'
  | 'insufficient-safe-cards'
  | 'no-audit'
  | 'coverage-incomplete';
export type CreateFirstEmailResult =
  | { configured: false; refusal: 'no-preview-bucket-configured' }
  | ({ configured: true; created: boolean; refusal?: CreateFirstEmailRefusal } & Partial<{
      draftId: string;
      threadId: string;
      previewId: string;
      previewUrl: string;
      subject: string;
      body: string;
    }>);

export async function createFirstEmailForProspect(
  connection: Connection,
  prospectId: string,
  options: { language: 'fr' | 'en'; previewToken?: string },
): Promise<CreateFirstEmailResult> {
  const prospect = await getProspectHub(connection, prospectId);
  if (prospect === null) return { configured: true, created: false, refusal: 'prospect-unknown' };
  const existing = await findOutreachThreadByProspect(connection, prospectId);
  if (
    existing !== null &&
    (await findLiveOutreachDraft(connection, existing.threadId, 1)) !== null
  ) {
    return { configured: true, created: false, refusal: 'draft-already-live' };
  }
  const allowed = await checkOutreachAction(connection, { prospect, action: 'first-email' });
  if (!allowed.allowed) return { configured: true, created: false, refusal: allowed.refusal };

  // Issue #280: a preview the operator just published is reused, not
  // superseded. createTouchOneDraft validates the token against the live
  // record and the current audit, so a stale token refuses cleanly.
  if (options.previewToken !== undefined) {
    const reused = await createTouchOneDraft(connection, prospectId, {
      language: options.language,
      previewToken: options.previewToken,
      dryRun: false,
    });
    if (!reused.configured) {
      return { configured: true, created: false, refusal: 'no-mailbox-configured' };
    }
    return {
      configured: true,
      created: reused.created,
      ...(reused.refusal === undefined ? {} : { refusal: reused.refusal }),
      ...(reused.draftId === undefined ? {} : { draftId: reused.draftId }),
      ...(reused.threadId === undefined ? {} : { threadId: reused.threadId }),
      ...(reused.subject === undefined ? {} : { subject: reused.subject }),
      ...(reused.body === undefined ? {} : { body: reused.body }),
    };
  }

  let publisher;
  try {
    publisher = createConfiguredPreviewPublisher();
  } catch {
    return { configured: false, refusal: 'no-preview-bucket-configured' };
  }
  const previewStore = createMongoOutreachPreviewStoreV2(connection, { prospectId });
  const published = await publishPreviewV2({
    store: previewStore,
    publisher,
    publicBaseUrl: getPreviewPublicBaseUrl(),
    prospectId,
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

  const website = primaryWebsite(prospect.websites);
  if (website !== undefined) {
    const live = await previewStore.listLivePreviews(website.registrableDomain);
    for (const preview of live) {
      if (preview.previewId !== published.previewId) {
        await previewStore.revokePreview(preview.previewId, 'superseded by a new first-email call');
      }
    }
  }
  const draft = await createTouchOneDraft(connection, prospectId, {
    language: options.language,
    previewToken: published.url.split('/').at(-1) ?? '',
    dryRun: false,
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
  return {
    configured: true,
    created: draft.created,
    ...(draft.refusal === undefined ? {} : { refusal: draft.refusal }),
    ...(draft.draftId === undefined ? {} : { draftId: draft.draftId }),
    ...(draft.threadId === undefined ? {} : { threadId: draft.threadId }),
    previewId: published.previewId,
    previewUrl: published.url,
    ...(draft.subject === undefined ? {} : { subject: draft.subject }),
    ...(draft.body === undefined ? {} : { body: draft.body }),
  };
}

export interface CreateFollowUpForProspectOptions {
  dryRun?: boolean;
}

export type CreateFollowUpForProspectResult =
  | { configured: false; refusal: DraftRuntimeRefusal }
  | {
      configured: true;
      created: boolean;
      refusal?: DraftRefusal;
      draftId?: string;
      threadId?: string;
      subject?: string;
      body?: string;
      plan?: {
        wouldDraft: true;
        domain: string;
        roleAddress: string;
        language: 'fr' | 'en';
        touch: 2 | 3;
      };
    };

export async function createFollowUpForProspect(
  connection: Connection,
  prospectId: string,
  options: CreateFollowUpForProspectOptions = {},
): Promise<CreateFollowUpForProspectResult> {
  const prospect = await getProspectHub(connection, prospectId);
  if (prospect === null) return { configured: true, created: false, refusal: 'prospect-unknown' };
  const thread = await findOutreachThreadByProspect(connection, prospectId);
  if (thread === null) return { configured: true, created: false, refusal: 'thread-unknown' };
  const touch = thread.state === 'e1-sent' ? 2 : thread.state === 'e2-sent' ? 3 : undefined;
  if (touch === undefined)
    return { configured: true, created: false, refusal: 'thread-not-eligible' };
  const allowed = await checkOutreachAction(connection, { prospect, action: 'follow-up' });
  if (!allowed.allowed) return { configured: true, created: false, refusal: allowed.refusal };
  if (await findLiveOutreachDraft(connection, thread.threadId, touch)) {
    return { configured: true, created: false, refusal: 'draft-already-live' };
  }
  const previous = (await listOutreachDrafts(connection, { threadId: thread.threadId, limit: 20 }))
    .filter((draft) => draft.touch === touch - 1 && draft.subject !== '')
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
  if (previous === undefined)
    return { configured: true, created: false, refusal: 'previous-draft-missing' };

  const website = primaryWebsite(prospect.websites);
  if (website === undefined || prospect.emails[0] === undefined) {
    return { configured: true, created: false, refusal: 'no-contact' };
  }
  const dryRun = options.dryRun ?? false;
  const mailbox = configuredMailbox(dryRun);
  if (mailbox === null) return { configured: false, refusal: 'no-mailbox-configured' };
  const now = new Date();
  const expectedFacts =
    touch === 3
      ? buildOutreachFactsBlock({
          assessment: undefined,
          language: thread.language,
          capabilities: { argumentB: true },
        })
      : undefined;
  const assembled = assembleOutreachDraft({
    touch,
    language: thread.language,
    hotelName: formatHotelName(prospect.name),
    variantSeed: prospectId,
    previousSubject: previous.subject,
    ...(expectedFacts === undefined ? {} : { expectedFacts }),
  });
  if (!assembled.assembled)
    return { configured: true, created: false, refusal: 'assembly-refused' };
  if (dryRun) {
    return {
      configured: true,
      created: false,
      plan: {
        wouldDraft: true,
        domain: website.registrableDomain,
        roleAddress: prospect.emails[0].address,
        language: thread.language,
        touch,
      },
    };
  }
  const finalGate = await checkOutreachAction(connection, { prospect, action: 'follow-up' });
  if (!finalGate.allowed)
    return { configured: true, created: false, refusal: 'suppressed-before-provider' };
  const providerDraft = await mailbox.createDraft({
    to: prospect.emails[0].address,
    subject: assembled.subject,
    body: assembled.body,
    htmlBody: assembled.htmlBody,
    ...(thread.providerThreadId === undefined ? {} : { providerThreadId: thread.providerThreadId }),
  });
  let draft;
  try {
    draft = await recordOutreachDraft(connection, {
      prospectId,
      threadId: thread.threadId,
      touch,
      language: thread.language,
      roleAddress: prospect.emails[0].address,
      subject: assembled.subject,
      body: assembled.body,
      htmlBody: assembled.htmlBody,
      evidenceVersion: EVIDENCE_VERSION,
      outreachPromptVersion: CURRENT_OUTREACH_PROMPT_VERSION,
      providerDraftId: providerDraft.providerDraftId,
      providerMessageId: providerDraft.providerMessageId,
      providerThreadId: providerDraft.providerThreadId,
      createdAt: now,
    });
  } catch {
    await mailbox.deleteDraft(providerDraft.providerDraftId).catch(() => undefined);
    return { configured: true, created: false, refusal: 'provider-draft-unrecorded' };
  }
  await advanceThreadTouch(connection, thread.threadId, touch);
  await transitionOutreachThread(connection, {
    threadId: thread.threadId,
    from: [thread.state],
    to: touch === 2 ? 'e2-drafted' : 'e3-drafted',
    at: now,
    reason: 'follow-up-draft-created',
  });
  return {
    configured: true,
    created: true,
    draftId: draft.draftId,
    threadId: thread.threadId,
    subject: assembled.subject,
    body: assembled.body,
  };
}
