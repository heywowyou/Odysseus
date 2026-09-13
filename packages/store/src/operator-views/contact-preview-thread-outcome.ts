/**
 * Contact, preview, thread, and outcome views: one candidate's per-stage
 * outreach state, each projection stripped of address, token, and content
 * material.
 */

import type { Connection } from 'mongoose';
import type {
  ContactSourceKind,
  HotelContactState,
  MailDomainStatus,
  OutreachEvidenceSlot,
  OutreachLostReason,
  OutreachOutcome,
  OutreachThreadState,
} from '@odysseus/core';
import { getHotelContact, MANUAL_CONTACT_VERSION } from '../hotel-contacts.js';
import { findOutreachThreadByCandidate } from '../outreach-threads.js';
import { listOutreachDrafts } from '../outreach-drafts.js';
import { listOutreachPreviews } from '../outreach-previews.js';
import {
  createHotelContactModel,
  type HotelContactDocument,
} from '../schemas/hotel-contact.schema.js';
import type {
  OutreachLanguageSource,
  OutreachThreadDocument,
} from '../schemas/outreach-thread.schema.js';
import type {
  OutreachDraftDocument,
  OutreachDraftReviewOutcome,
  OutreachDraftStatus,
} from '../schemas/outreach-draft.schema.js';
import { createOutreachOutcomeModel } from '../schemas/outreach-outcome.schema.js';
import type {
  OutreachPreviewSourceKind,
  OutreachPreviewStatus,
} from '../schemas/outreach-preview.schema.js';
import {
  pageBounds,
  THREAD_DRAFT_HISTORY_LIMIT,
  type OperatorViewPage,
  type OperatorViewPageOptions,
} from './shared.js';
import { candidateIdentityView } from './prescan-evidence.js';

export interface OperatorContactView {
  contactId: string;
  contactVersion: string;
  /** Manual contacts can exist without a discovered-contact cohort. */
  cohortId: string | null;
  domain: string;
  state: HotelContactState;
  reason: string;
  mxStatus: MailDomainStatus;
  /** The allowlisted source kind (contact page, legal page), never the page
   *  url and never the address itself. */
  sourceKind: ContactSourceKind | null;
  validatedAt: Date;
}

export interface GetProspectContactViewOptions {
  contactVersion?: string;
}

/** Plan 045: a manual override must win this view exactly as it wins drafting,
 *  never a "whichever row was validated most recently" comparison. Without
 *  this, a later automated recontact re-validating the discovered row could
 *  make this generic status panel show the discovered state again while the
 *  contact editor right beside it still shows the override as effective. */
async function effectiveContactAcrossVersions(
  connection: Connection,
  candidateId: string,
): Promise<HotelContactDocument | null> {
  const manual = await getHotelContact(connection, MANUAL_CONTACT_VERSION, candidateId);
  if (manual !== null) return manual;
  return createHotelContactModel(connection)
    .findOne({ candidateId, contactVersion: { $ne: MANUAL_CONTACT_VERSION } })
    .sort({ validatedAt: -1, contactId: 1 })
    .lean<HotelContactDocument>();
}

/** Contact state with no address material: `address`, `localPart`, and
 *  `sourceUrl` are the three fields this view must never carry, whatever a
 *  future render might want. */
export async function getProspectContactView(
  connection: Connection,
  candidateId: string,
  options: GetProspectContactViewOptions = {},
): Promise<OperatorContactView | null> {
  const contact =
    options.contactVersion !== undefined
      ? await getHotelContact(connection, options.contactVersion, candidateId)
      : await effectiveContactAcrossVersions(connection, candidateId);
  if (contact === null) return null;
  return {
    contactId: contact.contactId,
    contactVersion: contact.contactVersion,
    cohortId: contact.cohortId ?? null,
    domain: contact.domain,
    state: contact.state,
    reason: contact.reason,
    mxStatus: contact.mxStatus,
    sourceKind: contact.source ?? null,
    validatedAt: contact.validatedAt,
  };
}

export interface OperatorPreviewView {
  previewId: string;
  name: string;
  commune: string | null;
  postcode: string | null;
  domain: string;
  language: 'fr' | 'en';
  status: OutreachPreviewStatus;
  publishedAt: Date;
  publicExpiresAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
  /** v1 (prescan) rows only; null on v2 full-audit rows (plan 037). */
  prescanVersion: string | null;
  evidenceVersion: string | null;
  previewContentVersion: string;
  sourceKind: OutreachPreviewSourceKind;
}

/** The latest published preview for one candidate. `tokenHash` and
 *  `objectKey` are access-control material and have no place in an operator
 *  view, for the reason outreach-preview.schema.ts gives about the raw
 *  token. */
export async function getProspectPreviewView(
  connection: Connection,
  candidateId: string,
): Promise<OperatorPreviewView | null> {
  const [latest] = await listOutreachPreviews(connection, { candidateId, limit: 1 });
  if (latest === undefined) return null;
  const identity = await candidateIdentityView(connection, candidateId);
  return {
    previewId: latest.previewId,
    ...identity,
    domain: latest.domain,
    language: latest.language,
    status: latest.status,
    publishedAt: latest.publishedAt,
    publicExpiresAt: latest.publicExpiresAt,
    revokedAt: latest.revokedAt ?? null,
    revokedReason: latest.revokedReason ?? null,
    prescanVersion: latest.prescanVersion ?? null,
    evidenceVersion: latest.evidenceVersion ?? null,
    previewContentVersion: latest.previewContentVersion,
    sourceKind: latest.sourceKind ?? 'prescan',
  };
}

export interface OperatorDraftView {
  draftId: string;
  touch: number;
  language: 'fr' | 'en';
  status: OutreachDraftStatus;
  touch1EvidenceSlot: OutreachEvidenceSlot | null;
  failureReason: string | null;
  hasProviderDraft: boolean;
  createdAt: Date;
  deletedAt: Date | null;
  /** Issue #96: how the operator resolved the review. Null on rows that left
   *  `created` before the outcome was recorded or by another path. */
  reviewOutcome: OutreachDraftReviewOutcome | null;
  reviewedAt: Date | null;
}

export interface OperatorThreadView {
  threadId: string;
  candidateId: string;
  domain: string;
  language: 'fr' | 'en';
  languageSource: OutreachLanguageSource;
  currentTouch: number;
  state: OutreachThreadState;
  stateEnteredAt: Date;
  stateReason: string | null;
  /** Provider-confirmed sends, timing metadata only. */
  touches: { touch: number; sentAt: Date; detectedAt: Date }[];
  lastSyncedAt: Date | null;
  needsReview: { reason: string; detectedAt: Date } | null;
  /** The operator-set outcome event the thread points at, resolved to its
   *  value. Absent until an operator records one. */
  currentOutcome: {
    outcome: OutreachOutcome;
    lostReason: OutreachLostReason | null;
    recordedAt: Date;
  } | null;
  /** Draft attempts for this thread, metadata only: no subject, no body, no
   *  content hashes, no preview url (which is itself a bearer link). */
  drafts: OperatorDraftView[];
}

/** Thread, draft, and reply state for one candidate, metadata only. The
 *  thread stores the role address raw so a draft can be addressed; this view
 *  is exactly the part of the record that stays true without it. */
export async function getProspectThreadView(
  connection: Connection,
  candidateId: string,
): Promise<OperatorThreadView | null> {
  const thread = await findOutreachThreadByCandidate(connection, candidateId);
  if (thread === null) return null;

  const [drafts, currentOutcome] = await Promise.all([
    listOutreachDrafts(connection, {
      threadId: thread.threadId,
      limit: THREAD_DRAFT_HISTORY_LIMIT,
    }),
    resolveOutcomePointer(connection, thread),
  ]);

  return {
    threadId: thread.threadId,
    candidateId: thread.candidateId,
    domain: thread.domain,
    language: thread.language,
    languageSource: thread.languageSource,
    currentTouch: thread.currentTouch,
    state: thread.state,
    stateEnteredAt: thread.stateEnteredAt,
    stateReason: thread.stateReason ?? null,
    touches: thread.touches.map((touch) => ({
      touch: touch.touch,
      sentAt: touch.sentAt,
      detectedAt: touch.detectedAt,
    })),
    lastSyncedAt: thread.lastSyncedAt ?? null,
    needsReview:
      thread.needsReview === undefined
        ? null
        : { reason: thread.needsReview.reason, detectedAt: thread.needsReview.detectedAt },
    currentOutcome,
    drafts: drafts.map(projectDraft),
  };
}

function projectDraft(draft: OutreachDraftDocument): OperatorDraftView {
  return {
    draftId: draft.draftId,
    touch: draft.touch,
    language: draft.language,
    status: draft.status,
    touch1EvidenceSlot: draft.touch1EvidenceSlot ?? null,
    failureReason: draft.failureReason ?? null,
    hasProviderDraft: draft.providerDraftId !== undefined,
    createdAt: draft.createdAt,
    deletedAt: draft.deletedAt ?? null,
    reviewOutcome: draft.reviewOutcome ?? null,
    reviewedAt: draft.reviewedAt ?? null,
  };
}

async function resolveOutcomePointer(
  connection: Connection,
  thread: OutreachThreadDocument,
): Promise<OperatorThreadView['currentOutcome']> {
  if (thread.currentOutcome === undefined) return null;
  const event = await createOutreachOutcomeModel(connection)
    .findOne({ outcomeId: thread.currentOutcome })
    .select({ outcome: 1, lostReason: 1, recordedAt: 1, _id: 0 })
    .lean<{ outcome: OutreachOutcome; lostReason?: OutreachLostReason; recordedAt: Date }>();
  if (event === null) return null;
  return {
    outcome: event.outcome,
    lostReason: event.lostReason ?? null,
    recordedAt: event.recordedAt,
  };
}

export interface OperatorOutcomeEventView {
  outcomeId: string;
  outcome: OutreachOutcome;
  lostReason: OutreachLostReason | null;
  actor: string;
  recordedAt: Date;
}

/** One candidate's operator-recorded outcome events, newest first. */
export async function getProspectOutcomeView(
  connection: Connection,
  candidateId: string,
  options: OperatorViewPageOptions,
): Promise<OperatorViewPage<OperatorOutcomeEventView>> {
  const { limit, offset, skip } = pageBounds(options);
  const OutcomeModel = createOutreachOutcomeModel(connection);
  const filter: Record<string, unknown> = { candidateId };
  const [total, rows] = await Promise.all([
    OutcomeModel.countDocuments(filter),
    OutcomeModel.find(filter)
      .sort({ recordedAt: -1, outcomeId: 1 })
      .skip(skip)
      .limit(limit)
      .select({ outcomeId: 1, outcome: 1, lostReason: 1, actor: 1, recordedAt: 1, _id: 0 })
      .lean<
        {
          outcomeId: string;
          outcome: OutreachOutcome;
          lostReason?: OutreachLostReason;
          actor: string;
          recordedAt: Date;
        }[]
      >(),
  ]);
  return {
    rows: rows.map((row) => ({
      outcomeId: row.outcomeId,
      outcome: row.outcome,
      lostReason: row.lostReason ?? null,
      actor: row.actor,
      recordedAt: row.recordedAt,
    })),
    total,
    limit,
    offset,
  };
}
