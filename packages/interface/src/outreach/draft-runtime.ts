/** Prospect-native runtime for the operator's draft actions. */

import {
  buildOutreachFactsBlock,
  draftedOutreachTouch,
  effectiveOutreachThreadState,
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
  loadOutreachReportReadiness,
  openOutreachThread,
  recordFailedOutreachDraft,
  recordOutreachDraft,
  resolveSelectedAnalysisPairForAudit,
  selectNewestQualifyingAudit,
  type AuditIntentSourceJob,
  type ProspectWorkAudit,
  attachReferenceAuditDraft,
  createReferenceAuditLink,
  deleteReferenceAuditLink,
  transitionOutreachThread,
} from '@odysseus/store';
import type { OutreachActionRefusal } from '@odysseus/store';
import type { Connection } from 'mongoose';
import {
  getOutreachReplyWindowDays,
  getOutreachTouch2AfterDays,
  getOutreachTouch3AfterDays,
  getPreviewPublicBaseUrl,
  getReferenceAuditPublicBaseUrl,
  isReferenceAuditLinkTrackingEnabled,
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
import { createMongoOutreachPreviewStoreV3 } from './mongo-outreach-preview-store-v2.js';
import { resolveReferenceAuditForDraft } from '../reference-audit/reference-audit-readiness.js';
import {
  createReferenceAuditToken,
  hashReferenceAuditToken,
  referenceAuditTrackedUrl,
} from '../reference-audit/reference-audit-link-token.js';
import type { MailboxDraftAdapter } from './mailbox-draft-adapter.js';
import {
  previewLinks,
  publishPreviewV3,
  resolvePublishedPreviewForDraft,
} from './publish-preview-v2.js';

const CURRENT_OUTREACH_PROMPT_VERSION = 'template-v2';
const EVIDENCE_VERSION = `full-audit:${NORMALIZATION_FINGERPRINT}`;

export type DraftRuntimeRefusal = 'no-mailbox-configured' | 'reference-audit-unavailable';

type DraftRefusal =
  | 'prospect-unknown'
  | 'no-usable-contact'
  | 'suppressed-before-generation'
  | 'suppressed-before-provider'
  | 'preview-not-published'
  | 'preview-revoked'
  | 'preview-expired'
  | 'preview-wrong-audit'
  | 'preview-stale'
  | 'reference-audit-unavailable'
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
      referenceAuditUrl?: string;
      referenceAuditVersion?: string;
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
        ...(record.sourceAnalysisId === undefined
          ? {}
          : { sourceAnalysisId: record.sourceAnalysisId }),
        ...(record.sourceFindingsDigest === undefined
          ? {}
          : { sourceFindingsDigest: record.sourceFindingsDigest }),
        ...(record.publishedFacts === undefined ? {} : { publishedFacts: record.publishedFacts }),
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
          findingsProvenance: 1,
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
      if (selected.audit === undefined) return { state: 'refused' as const };
      // Issue #388: the first email cites a preview built on this audit's
      // client reports; same readiness rule as the outreach guard.
      const readiness = await loadOutreachReportReadiness(connection, {
        auditId: selected.audit.auditId,
        prospectId: id,
      });
      if (readiness.state !== 'ready') return { state: 'refused' as const };
      const selection = await resolveSelectedAnalysisPairForAudit(
        connection,
        selected.audit.auditId,
      );
      return {
        state: 'resolved' as const,
        audit: {
          auditId: selected.audit.auditId,
          ...(selected.audit.findingsProvenance?.findingsDigest === undefined
            ? {}
            : { findingsDigest: selected.audit.findingsProvenance.findingsDigest }),
          ...(selection.kind === 'none' ? {} : { selectedFrAnalysisId: selection.fr.analysisId }),
        },
      };
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

  const referenceAudit = await resolveReferenceAuditForDraft();
  if (referenceAudit === null) {
    return { configured: true, created: false, refusal: 'reference-audit-unavailable' };
  }

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

  let referenceAuditUrl = referenceAudit.url;
  let referenceAuditTokenHash: string | undefined;
  let trackingAvailable: boolean;
  try {
    trackingAvailable = !dryRun && isReferenceAuditLinkTrackingEnabled();
  } catch {
    // The optional attribution configuration must never turn a valid
    // canonical reference link into a draft refusal.
    trackingAvailable = false;
  }
  if (trackingAvailable) {
    try {
      const token = createReferenceAuditToken();
      referenceAuditTokenHash = hashReferenceAuditToken(token);
      await createReferenceAuditLink(connection, {
        tokenHash: referenceAuditTokenHash,
        prospectId,
        threadId: thread.thread.threadId,
        registrableDomain: website.registrableDomain,
        roleAddress: contact.address,
        referenceVersion: referenceAudit.referenceVersion,
        createdAt: now,
      });
      referenceAuditUrl = referenceAuditTrackedUrl(getReferenceAuditPublicBaseUrl(), token);
    } catch {
      // Attribution is optional; a missing private mapping or receipt bucket
      // leaves the useful canonical reference link in place.
      referenceAuditTokenHash = undefined;
      referenceAuditUrl = referenceAudit.url;
    }
  }

  const discardReferenceAuditTracking = async (): Promise<void> => {
    if (referenceAuditTokenHash === undefined) return;
    await deleteReferenceAuditLink(connection, referenceAuditTokenHash).catch(() => undefined);
    referenceAuditTokenHash = undefined;
    referenceAuditUrl = referenceAudit.url;
  };

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
    referenceAuditUrl,
    referenceAuditVersion: referenceAudit.referenceVersion,
    dataOrigins: ['public-hotel-catalogue', 'public-website'],
    privacyUrl: links.privacy,
    optOutUrl: optOutLink.url,
  });
  if (!assembled.assembled) {
    await discardReferenceAuditTracking();
    await recordFailedOutreachDraft(connection, {
      prospectId,
      threadId: thread.thread.threadId,
      touch: 1,
      language: options.language,
      roleAddress: contact.address,
      previewId: preview.previewId,
      previewUrl: preview.url,
      referenceAuditUrl,
      referenceAuditVersion: referenceAudit.referenceVersion,
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
    await discardReferenceAuditTracking();
    await recordFailedOutreachDraft(connection, {
      prospectId,
      threadId: thread.thread.threadId,
      touch: 1,
      language: options.language,
      roleAddress: contact.address,
      previewId: preview.previewId,
      previewUrl: preview.url,
      referenceAuditUrl,
      referenceAuditVersion: referenceAudit.referenceVersion,
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
      referenceAuditUrl,
      referenceAuditVersion: referenceAudit.referenceVersion,
      ...(referenceAuditTokenHash === undefined ? {} : { referenceAuditTokenHash }),
      evidenceVersion: EVIDENCE_VERSION,
      outreachPromptVersion: CURRENT_OUTREACH_PROMPT_VERSION,
      providerDraftId: providerDraft.providerDraftId,
      providerMessageId: providerDraft.providerMessageId,
      providerThreadId: providerDraft.providerThreadId,
      createdAt: now,
    });
  } catch {
    await mailbox.deleteDraft(providerDraft.providerDraftId).catch(() => undefined);
    await discardReferenceAuditTracking();
    return { configured: true, created: false, refusal: 'provider-draft-unrecorded' };
  }

  if (referenceAuditTokenHash !== undefined) {
    // Attribution is explicitly best effort. The provider draft and its
    // historical body remain usable even if the private mapping cannot be
    // attached after the draft row is recorded.
    await attachReferenceAuditDraft(connection, referenceAuditTokenHash, draft.draftId).catch(
      () => undefined,
    );
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
    referenceAuditUrl,
    referenceAuditVersion: referenceAudit.referenceVersion,
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
  | 'coverage-incomplete'
  | 'report-not-ready'
  | 'priority-copy-unavailable'
  | 'preview-stale';
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

  // Do this readiness check before publishing a new preview. A first-touch
  // attempt must not leave a live preview behind when the permanent reference
  // pointer is unavailable and the email would consequently be refused.
  if (options.previewToken === undefined) {
    const referenceAudit = await resolveReferenceAuditForDraft();
    if (referenceAudit === null) {
      return { configured: true, created: false, refusal: 'reference-audit-unavailable' };
    }
  }

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
  const previewStore = createMongoOutreachPreviewStoreV3(connection, { prospectId });
  const published = await publishPreviewV3({
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
  // A discarded follow-up draft leaves the thread at eN-drafted; it is due again.
  const drafted = draftedOutreachTouch(thread.state);
  const threadState = effectiveOutreachThreadState(
    thread.state,
    drafted !== undefined &&
      (await findLiveOutreachDraft(connection, thread.threadId, drafted)) !== null
      ? [drafted]
      : [],
  );
  const touch = threadState === 'e1-sent' ? 2 : threadState === 'e2-sent' ? 3 : undefined;
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
