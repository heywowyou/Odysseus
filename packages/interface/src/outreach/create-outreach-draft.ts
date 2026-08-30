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
 * redundant and are not: everything between them takes real time (a model
 * round trip, a preview publication, four validators), and an objection that
 * arrives during that window has to stop the draft that is in flight, not
 * merely the next batch. `publish-preview.ts` states the same rule for the
 * same reason.
 *
 * **Why this module publishes the preview rather than looking one up.** A
 * preview link is the only access control on one hotel's evidence, so plan 009
 * stores the token's hash and never the token: the raw URL is returned exactly
 * once, at publication, and nothing can recover it afterwards. A draft needs a
 * working link, so the only honest options were to publish here or to make the
 * operator paste a URL by hand. Publishing here is chosen because it also
 * makes the link's 30-day lifetime start when the draft is written rather than
 * whenever a preview happened to be made, so a draft sitting in review for a
 * week still carries a link that outlives the conversation.
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
  selectOutreachEvidence,
  type HotelPrescanEvidence,
} from '@odysseus/core';
import { buildOutreachProseInput, type OutreachProseOutput } from '@odysseus/llm';
import { generateOutreachProse } from '@odysseus/llm';
import { assembleOutreachDraft, type OutreachDataOrigin } from './assemble-outreach-draft.js';
import type { MailboxDraftAdapter } from './mailbox-draft-adapter.js';
import { previewLinks, registryAssessment, type PreviewSireneFacts } from './publish-preview.js';

/** Only the first touch is orchestrated by this plan. Touches 2 and 3 need
 *  reply detection to know whether a follow-up is still wanted, which is plan
 *  012's job, and creating them before that exists would be a sequencer. */
export const FIRST_TOUCH = 1;

export const CURRENT_OUTREACH_PROMPT_VERSION = 'v1';

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
  | 'preview-publication-failed'
  | 'assembly-refused'
  | 'provider-draft-unrecorded';

export interface OutreachContactFacts {
  address: string;
  /** `found` is the only state that may be written to. The others are the four
   *  typed absences plan 007 records instead of a null. */
  state: string;
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
  status: 'open' | 'closed';
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
  isSuppressed(domain: string): Promise<boolean>;
  openThread(input: {
    candidateId: string;
    prescanId: string;
    previewId: string;
    domain: string;
    roleAddress: string;
    language: 'fr' | 'en';
    openedAt: Date;
  }): Promise<OutreachThreadRef>;
  findLiveDraft(threadId: string, touch: number): Promise<{ draftId: string } | null>;
  recordDraft(facts: RecordDraftFacts): Promise<{ draftId: string }>;
  recordFailure(facts: RecordFailureFacts): Promise<void>;
  attachProviderThreadId(threadId: string, providerThreadId: string): Promise<boolean>;
  advanceTouch(threadId: string, touch: number): Promise<void>;
}

export interface PublishedPreviewRef {
  previewId: string;
  url: string;
  publicExpiresAt: Date;
}

/** Narrow view of plan 009's publication path, so this module depends on the
 *  act of publishing rather than on `publishPreview`'s whole option surface. */
export interface OutreachPreviewPort {
  publish(
    candidateId: string,
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
  now?: Date;
  /** Injected so tests never reach the live model, matching the LLM package's
   *  own stubbed-client discipline. */
  generateProse?: typeof generateOutreachProse;
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
  return origins;
}

export async function createOutreachDraft(
  options: CreateOutreachDraftOptions,
): Promise<CreateOutreachDraftResult> {
  const now = options.now ?? new Date();
  const touch = FIRST_TOUCH;
  const generate = options.generateProse ?? generateOutreachProse;

  const row = await options.store.findDraftRow(options.candidateId);
  if (row === null) return refuse('candidate-unknown');

  // Before anything else, and again below. An objection has to stop the next
  // thing we do, not the next batch.
  if (await options.store.isSuppressed(row.domain)) return refuse('suppressed-before-generation');

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

  const prose = await generate(
    buildOutreachProseInput({
      language: options.language,
      touch,
      businessName: row.businessName,
      selected: selection.touch1,
      ageFramingPermitted: true,
    }),
    selection.touch1.observationKey,
  );

  // Published after generation, so a run the model could not satisfy leaves no
  // orphan preview object behind.
  const published = await options.preview.publish(options.candidateId, options.language);
  if ('refusal' in published) return refuse('preview-publication-failed');

  const thread = await options.store.openThread({
    candidateId: row.candidateId,
    prescanId: row.prescanId,
    previewId: published.previewId,
    domain: row.domain,
    roleAddress: row.contact.address,
    language: options.language,
    openedAt: now,
  });
  if (thread.status === 'closed') return refuse('thread-closed');
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
    prose: prose.output as OutreachProseOutput,
    language: options.language,
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
  if (await options.store.isSuppressed(row.domain)) {
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
    ...(thread.providerThreadId !== undefined ? { providerThreadId: thread.providerThreadId } : {}),
  });

  let recorded: { draftId: string };
  try {
    recorded = await options.store.recordDraft({
      ...failureFacts,
      subject: assembled.subject,
      body: assembled.body,
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
