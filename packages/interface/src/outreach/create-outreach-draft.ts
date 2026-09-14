/**
 * Suppression-safe draft orchestration, milestone 9c plan 011.
 *
 * The deep interface plan 011 asks for: it takes one candidate, not loose
 * email content, and everything that decides whether a message may exist
 * happens here rather than in a command. A caller cannot assemble a body and
 * ask for it to be drafted, because there is no parameter for one.
 *
 * **The two suppression checks are the point of the module.** One immediately
 * before the model call, one immediately before the provider call. They look
 * redundant and are not: everything between them takes real time (a preview
 * resolution, an audit read, four validators), and an objection that
 * arrives during that window has to stop the draft that is in flight, not
 * merely the next batch. `publish-preview.ts` states the same rule for the
 * same reason.
 *
 * **Plan 037: the draft consumes an already published preview.** A preview
 * link is the only access control on one hotel's evidence, so the raw token
 * exists only where it was first shown: at publication, on the audit page,
 * exactly once. Under the v1 flow this module published its own preview for
 * that reason; under v2 that side effect is forbidden, because an unreviewed
 * publication must never be a side effect of drafting. The caller supplies
 * the token the operator copied after reviewing and publishing, and the
 * adapter validates it live, unrevoked, unexpired, and attached to the
 * candidate's current outreach audit. A draft sitting in review now risks
 * its link expiring rather than a stale one being minted for it, which is
 * the fail-closed direction.
 *
 * Refusals are returned, never thrown, matching `assembleOutreachDraft` and
 * `publishPreview`: the caller is a bounded batch, and one hotel that cannot
 * be drafted must not abort the run. Every refusal past the point a thread
 * exists is also written to the drafts collection, so a hotel that was
 * selected and never contacted has a recorded reason rather than an absence.
 */

import {
  HOTEL_EVIDENCE_MIN_SUMMARIES,
  HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION,
  isTerminalOutreachThreadState,
  selectOutreachEvidence,
  type HotelContactAddressOrigin,
  type HotelPrescanEvidence,
  type OutreachEvidenceSlot,
  type OutreachPreviewSeverity,
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

/** Only the first touch is orchestrated by this plan. Touches 2 and 3 need
 *  reply detection to know whether a follow-up is still wanted, which is plan
 *  012's job, and creating them before that exists would be a sequencer. */
export const FIRST_TOUCH = 1;

/** Recorded on every draft as `outreachPromptVersion` (the field predates
 *  trade-off 83): which approved code-owned template produced the text.
 *  `template-v2` is the operator-approved wording locked 2026-09-14. */
export const CURRENT_OUTREACH_PROMPT_VERSION = 'template-v2';

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
  /** `found` is the only state that may be written to. The others are the four
   *  typed absences plan 007 records instead of a null. */
  state: string;
  /** Undefined on legacy discovered rows, which means the hotel website. */
  addressOrigin?: HotelContactAddressOrigin;
}

/** Everything drafting needs about one hotel, read in one go by the store
 *  adapter so this module never issues a query of its own. */
export interface OutreachDraftRow {
  candidateId: string;
  domain: string;
  businessName: string;
  prescanId: string;
  prescanVersion: string;
  prescanExpiresAt: Date;
  evidence?: HotelPrescanEvidence;
  contact?: OutreachContactFacts;
  /** Registry facts as the qualification pass stored them, in the same shape
   *  `PreviewPublicationRow` carries. Turned into an `ObligationAssessment` by
   *  the one shared `registryAssessment` builder, which never calls
   *  `assessObligations`: that decides scope, and a scope determination is a
   *  conclusion outreach may not state (trade-off 42). */
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
  /** Moves the thread into its "drafted" state once the provider has actually
   *  accepted the draft. Without this, `listThreadsToSync` (which reads only
   *  drafted/sent states) would never pick the thread up, and a confirmed send
   *  would have nothing to transition from. */
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
  /** Safe aggregate facts rendered from the same full outreach audit as the
   *  published preview. Touch 1 reuses them verbatim rather than falling back
   *  to prescan evidence or inventing personalised-looking copy. */
  distinctFindingCount: number;
  affectedPageCount: number;
  severityTotals: Record<OutreachPreviewSeverity, number>;
  proofCardCategories: OutreachCategory[];
}

/** Plan 037: the draft consumes an ALREADY published v2 preview, resolved
 *  from the one-time token the operator copied at publication. This module
 *  can no longer publish, render, scan, or reissue as a side effect, and a
 *  missing, revoked, expired, or wrong-audit preview refuses the draft. */
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
  /** The one-time token of the v2 preview the operator published and copied
   *  from the audit page. Required: without a published preview there is no
   *  link for the email to carry, and publishing one here is forbidden. */
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
  /** Populated only by `--dry-run`: what would have happened, nothing
   *  observed, no model call and no preview published. */
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

/** Every origin the data behind this draft actually came from, per
 *  `docs/rules/outreach-rules.md` section 7. Built per hotel rather than as a fixed
 *  list: a hotel with no registry match must not disclose an origin it has
 *  none of. */
function dataOriginsFor(row: OutreachDraftRow): OutreachDataOrigin[] {
  const origins: OutreachDataOrigin[] = ['public-hotel-catalogue', 'public-website'];
  if (registryAssessment(row.sirene) !== undefined) origins.push('public-business-registry');
  const contactOrigin = row.contact?.addressOrigin;
  if (contactOrigin === 'other-public-source' || contactOrigin === 'provided-directly') {
    origins.push(contactOrigin);
  }
  return origins;
}

export async function createOutreachDraft(
  options: CreateOutreachDraftOptions,
): Promise<CreateOutreachDraftResult> {
  const now = options.now ?? new Date();
  const touch = FIRST_TOUCH;

  const row = await options.store.findDraftRow(options.candidateId);
  if (row === null) return refuse('candidate-unknown');

  // Before anything else, and again below. An objection has to stop the next
  // thing we do, not the next batch. The store adapter expands this one gate
  // to the hotel domain, mailbox domain, and exact address when an address is present.
  if (await options.store.isSuppressed(row.domain, row.contact?.address)) {
    return refuse('suppressed-before-generation');
  }

  // Plan 007 records four typed absences rather than a null, and only `found`
  // carries an address that passed the allowlist and the MX check.
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
  // A prescan past its own retention describes a site as it was too long ago
  // to write to anybody about, and its screenshots may already be swept.
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

  // The draft consumes the already published v2 preview the operator's token
  // names; it can never publish or reissue one itself.
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
    scanSummary: {
      distinctFindingCount: published.distinctFindingCount,
      affectedPageCount: published.affectedPageCount,
      severityTotals: published.severityTotals,
      proofCardCategories: published.proofCardCategories,
    },
    previewUrl: published.url,
    dataOrigins: dataOriginsFor(row),
    privacyUrl: links.privacy,
    optOutUrl: links.optOut,
  });
  if (!assembled.assembled) {
    await options.store.recordFailure({ ...failureFacts, failureReason: 'assembly-refused' });
    return refuse('assembly-refused');
  }

  // The second gate, immediately before the provider call and after every slow
  // step above.
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
    // The provider has a draft we cannot account for. Left in the mailbox it
    // would be an unreviewed message the operator could send by reflex with no
    // record of what produced it, so it is withdrawn rather than orphaned.
    // Deletion is idempotent, so a second failure here is survivable.
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
