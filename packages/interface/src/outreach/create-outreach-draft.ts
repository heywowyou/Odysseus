/**
 * Suppression-safe draft orchestration, milestone 9c plan 011.
 *
 * The deep interface plan 011 asks for: it takes one candidate, not loose
 * email content, and everything that decides whether a message may exist
 * happens here rather than in a command. A caller cannot assemble a body and
 * ask for it to be drafted, because there is no parameter for one.
 *
 * **The two suppression checks are the point of the module.** One immediately
 * before generation, one immediately before the provider call. They check the
 * hotel domain and, when present, the effective address. Everything between
 * them takes real time, so an objection that arrives during that window has to
 * stop the draft that is in flight, not merely the next batch.
 *
 * **Plan 037: the draft consumes an already published preview.** A preview
 * link is the only access control on one hotel's evidence, so the raw token
 * exists only where it was first shown. The caller supplies the token and the
 * adapter validates it live, unrevoked, unexpired, and attached to the
 * candidate's current outreach audit.
 */

import {
  HOTEL_EVIDENCE_MIN_SUMMARIES,
  HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION,
  isTerminalOutreachThreadState,
  selectOutreachEvidence,
  type HotelContactAddressOrigin,
  type HotelPrescanEvidence,
  type OutreachEvidenceSlot,
  type OutreachThreadState,
} from '@odysseus/core';
import {
  getOutreachReplyWindowDays,
  getOutreachTouch2AfterDays,
  getOutreachTouch3AfterDays,
} from '../config.js';
import { assembleOutreachDraft, type OutreachDataOrigin } from './assemble-outreach-draft.js';
import { formatHotelName } from './hotel-name.js';
import type { OutreachCategory } from './outreach-email-template.js';
import type { MailboxDraftAdapter } from './mailbox-draft-adapter.js';
import { previewLinks, registryAssessment, type PreviewSireneFacts } from './publish-preview.js';

export const FIRST_TOUCH = 1;
export const CURRENT_OUTREACH_PROMPT_VERSION = 'template-v1';

export type CreateOutreachDraftRefusal =
  | 'candidate-unknown'
  | 'no-usable-contact'
  | 'evidence-incomplete'
  | 'evidence-schema-outdated'
  | 'prescan-expired'
  | 'no-distinct-second-observation'
  | 'observation-not-in-allowlist'
  | 'thread-closed'
  | 'draft-already-live'
  | 'suppressed-before-generation'
  | 'suppressed-before-provider'
  | 'preview-not-published'
  | 'preview-revoked'
  | 'preview-expired'
  | 'preview-wrong-audit'
  | 'assembly-refused'
  | 'provider-draft-unrecorded';

export interface OutreachContactFacts {
  address: string;
  state: string;
  /** Undefined on legacy discovered rows, which means the hotel website. */
  addressOrigin?: HotelContactAddressOrigin;
}

export interface OutreachDraftRow {
  candidateId: string;
  domain: string;
  businessName: string;
  prescanId: string;
  prescanVersion: string;
  prescanExpiresAt: Date;
  evidence?: HotelPrescanEvidence;
  contact?: OutreachContactFacts;
  sirene?: PreviewSireneFacts;
}

export interface OutreachThreadRef {
  threadId: string;
  state: OutreachThreadState;
  currentTouch: number;
  providerThreadId?: string;
}

export interface RecordDraftFacts {
  threadId: string;
  candidateId: string;
  touch: number;
  language: 'fr' | 'en';
  roleAddress: string;
  subject: string;
  body: string;
  htmlBody: string;
  touch1EvidenceSlot: OutreachEvidenceSlot;
  previewId: string;
  previewUrl: string;
  prescanVersion: string;
  evidenceVersion: string;
  outreachPromptVersion: string;
  providerDraftId: string;
  providerMessageId: string;
  providerThreadId: string;
  createdAt: Date;
}

export interface RecordFailureFacts {
  threadId: string;
  candidateId: string;
  touch: number;
  language: 'fr' | 'en';
  roleAddress: string;
  previewId: string;
  previewUrl: string;
  prescanVersion: string;
  evidenceVersion: string;
  outreachPromptVersion: string;
  failureReason: CreateOutreachDraftRefusal;
  createdAt: Date;
}

export interface OutreachDraftStorePort {
  findDraftRow(candidateId: string): Promise<OutreachDraftRow | null>;
  isSuppressed(domain: string, address?: string): Promise<boolean>;
  openThread(input: {
    candidateId: string;
    prescanId: string;
    previewId: string;
    domain: string;
    roleAddress: string;
    language: 'fr' | 'en';
    openedAt: Date;
    spacing: {
      touch2AfterDays: number;
      touch3AfterDays: number;
      replyWindowDays: number;
    };
  }): Promise<OutreachThreadRef>;
  findLiveDraft(threadId: string, touch: number): Promise<{ draftId: string } | null>;
  recordDraft(facts: RecordDraftFacts): Promise<{ draftId: string }>;
  recordFailure(facts: RecordFailureFacts): Promise<void>;
  attachProviderThreadId(threadId: string, providerThreadId: string): Promise<boolean>;
  advanceTouch(threadId: string, touch: number): Promise<void>;
  transition(input: {
    threadId: string;
    from: readonly OutreachThreadState[];
    to: OutreachThreadState;
    at: Date;
    reason?: string;
  }): Promise<boolean>;
}

export interface PublishedPreviewRef {
  previewId: string;
  url: string;
  publicExpiresAt: Date;
  proofCardCategories: OutreachCategory[];
}

export interface OutreachPreviewPort {
  resolvePublished(
    candidateId: string,
    previewToken: string,
    language: 'fr' | 'en',
  ): Promise<PublishedPreviewRef | { refusal: string }>;
}

export interface CreateOutreachDraftOptions {
  store: OutreachDraftStorePort;
  mailbox: MailboxDraftAdapter;
  preview: OutreachPreviewPort;
  publicBaseUrl: string;
  candidateId: string;
  language: 'fr' | 'en';
  dryRun: boolean;
  previewToken: string;
  now?: Date;
}

export interface CreateOutreachDraftResult {
  created: boolean;
  refusal?: CreateOutreachDraftRefusal;
  draftId?: string;
  threadId?: string;
  providerDraftId?: string;
  previewId?: string;
  subject?: string;
  body?: string;
  plan?: {
    wouldDraft: true;
    domain: string;
    roleAddress: string;
    language: 'fr' | 'en';
    touch: number;
  };
}

function mapPreviewRefusal(refusal: string): CreateOutreachDraftRefusal {
  switch (refusal) {
    case 'preview-revoked':
    case 'preview-expired':
    case 'preview-wrong-audit':
      return refusal;
    default:
      return 'preview-not-published';
  }
}

function refuse(refusal: CreateOutreachDraftRefusal): CreateOutreachDraftResult {
  return { created: false, refusal };
}

/** Every origin the data behind this draft actually came from. Public site and
 * catalogue facts remain present because the message discusses the audit; a
 * manual contact adds the approved per-address origin when it differs from the
 * hotel's own site. */
function dataOriginsFor(row: OutreachDraftRow): OutreachDataOrigin[] {
  const origins: OutreachDataOrigin[] = ['public-hotel-catalogue', 'public-website'];
  if (row.contact?.addressOrigin === 'other-public-source') origins.push('other-public-source');
  if (row.contact?.addressOrigin === 'provided-directly') origins.push('provided-directly');
  if (registryAssessment(row.sirene) !== undefined) origins.push('public-business-registry');
  return origins;
}

export async function createOutreachDraft(
  options: CreateOutreachDraftOptions,
): Promise<CreateOutreachDraftResult> {
  const now = options.now ?? new Date();
  const touch = FIRST_TOUCH;

  const row = await options.store.findDraftRow(options.candidateId);
  if (row === null) return refuse('candidate-unknown');

  // Check the effective address as well as the hotel domain whenever we have
  // one. This is intentionally before the contact-state refusal so a newly
  // suppressed mailbox cannot be used simply because its domain is not on the
  // suppression list.
  if (await options.store.isSuppressed(row.domain, row.contact?.address)) {
    return refuse('suppressed-before-generation');
  }

  if (row.contact === undefined || row.contact.state !== 'found' || row.contact.address === '') {
    return refuse('no-usable-contact');
  }

  const evidence = row.evidence;
  if (evidence === undefined || evidence.status !== 'complete')
    return refuse('evidence-incomplete');
  if (evidence.schemaVersion !== HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION) {
    return refuse('evidence-schema-outdated');
  }
  if (evidence.summaries.length < HOTEL_EVIDENCE_MIN_SUMMARIES)
    return refuse('evidence-incomplete');
  if (row.prescanExpiresAt.getTime() <= now.getTime()) return refuse('prescan-expired');

  const selection = selectOutreachEvidence(evidence);
  if (selection.state !== 'selected') {
    return refuse(
      selection.refusal === 'no-distinct-second-observation'
        ? 'no-distinct-second-observation'
        : selection.refusal === 'observation-not-in-allowlist'
          ? 'observation-not-in-allowlist'
          : selection.refusal === 'evidence-schema-outdated'
            ? 'evidence-schema-outdated'
            : 'evidence-incomplete',
    );
  }

  if (options.dryRun) {
    return {
      created: false,
      plan: {
        wouldDraft: true,
        domain: row.domain,
        roleAddress: row.contact.address,
        language: options.language,
        touch,
      },
    };
  }

  const published = await options.preview.resolvePublished(
    options.candidateId,
    options.previewToken,
    options.language,
  );
  if ('refusal' in published) return refuse(mapPreviewRefusal(published.refusal));

  const thread = await options.store.openThread({
    candidateId: row.candidateId,
    prescanId: row.prescanId,
    previewId: published.previewId,
    domain: row.domain,
    roleAddress: row.contact.address,
    language: options.language,
    openedAt: now,
    spacing: {
      touch2AfterDays: getOutreachTouch2AfterDays(),
      touch3AfterDays: getOutreachTouch3AfterDays(),
      replyWindowDays: getOutreachReplyWindowDays(),
    },
  });
  if (isTerminalOutreachThreadState(thread.state)) return refuse('thread-closed');
  if ((await options.store.findLiveDraft(thread.threadId, touch)) !== null) {
    return refuse('draft-already-live');
  }

  const evidenceVersion = String(evidence.schemaVersion);
  const failureFacts = {
    threadId: thread.threadId,
    candidateId: row.candidateId,
    touch,
    language: options.language,
    roleAddress: row.contact.address,
    previewId: published.previewId,
    previewUrl: published.url,
    prescanVersion: row.prescanVersion,
    evidenceVersion,
    outreachPromptVersion: CURRENT_OUTREACH_PROMPT_VERSION,
    createdAt: now,
  };

  const links = previewLinks(options.publicBaseUrl);
  const assembled = assembleOutreachDraft({
    touch: 1,
    language: options.language,
    hotelName: formatHotelName(row.businessName),
    variantSeed: row.candidateId,
    categories: published.proofCardCategories,
    previewUrl: published.url,
    dataOrigins: dataOriginsFor(row),
    privacyUrl: links.privacy,
    optOutUrl: links.optOut,
  });
  if (!assembled.assembled) {
    await options.store.recordFailure({ ...failureFacts, failureReason: 'assembly-refused' });
    return refuse('assembly-refused');
  }

  if (await options.store.isSuppressed(row.domain, row.contact.address)) {
    await options.store.recordFailure({
      ...failureFacts,
      failureReason: 'suppressed-before-provider',
    });
    return refuse('suppressed-before-provider');
  }

  const providerDraft = await options.mailbox.createDraft({
    to: row.contact.address,
    subject: assembled.subject,
    body: assembled.body,
    htmlBody: assembled.htmlBody,
    ...(thread.providerThreadId !== undefined ? { providerThreadId: thread.providerThreadId } : {}),
  });

  let recorded: { draftId: string };
  try {
    recorded = await options.store.recordDraft({
      ...failureFacts,
      subject: assembled.subject,
      body: assembled.body,
      htmlBody: assembled.htmlBody,
      touch1EvidenceSlot: selection.touch1.slot,
      providerDraftId: providerDraft.providerDraftId,
      providerMessageId: providerDraft.providerMessageId,
      providerThreadId: providerDraft.providerThreadId,
    });
  } catch {
    await options.mailbox.deleteDraft(providerDraft.providerDraftId).catch(() => undefined);
    await options.store
      .recordFailure({ ...failureFacts, failureReason: 'provider-draft-unrecorded' })
      .catch(() => undefined);
    return refuse('provider-draft-unrecorded');
  }

  await options.store.attachProviderThreadId(thread.threadId, providerDraft.providerThreadId);
  await options.store.advanceTouch(thread.threadId, touch);
  await options.store.transition({
    threadId: thread.threadId,
    from: ['open'],
    to: 'e1-drafted',
    at: now,
    reason: 'draft-created',
  });

  return {
    created: true,
    draftId: recorded.draftId,
    threadId: thread.threadId,
    providerDraftId: providerDraft.providerDraftId,
    previewId: published.previewId,
    subject: assembled.subject,
    body: assembled.body,
  };
}
