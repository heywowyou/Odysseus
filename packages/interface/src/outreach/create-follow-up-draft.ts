/**
 * Follow-up draft orchestration, milestone 9c plan 012 step 4.
 *
 * A sibling of `create-outreach-draft.ts`'s `createOutreachDraft`, sharing its
 * refusal-not-throw discipline and its two suppression gates (immediately
 * before generation, and again immediately before the provider call, for the
 * same reason: an objection arriving during a model round trip has to stop
 * the draft in flight, not merely the next batch).
 *
 * **Why this module publishes no preview and adds no link.** Touch 1 needs a
 * fresh access-controlled link because it is the hotel's first contact.
 * Touches 2 and 3 continue an existing conversation the hotel can already
 * opt out of by replying, so `docs/rules/outreach-rules.md` section 7 does not
 * require a second link, and this module never calls `preview.publish`.
 *
 * **Why `previousSubject` comes from the touch-1 draft row, not the thread.**
 * The thread never stores the exact subject a message went out with -
 * `outreach_threads` records state and provider facts, not content. The
 * touch-1 draft row stays queryable at `status: 'created'` indefinitely
 * (nothing marks a manually-sent draft any other way), so it is the one place
 * that subject still lives, and `assembleOutreachDraft` needs it to produce
 * one idempotent `Re:` rather than a fresh subject line.
 *
 * **Why touch 3's facts are built through `registryAssessment`, never
 * `assessObligations`.** Calling the real assessor here would compute a scope
 * determination this document is forbidden from stating (trade-off 42). The
 * same shared helper `publish-preview.ts` uses for touch 1's preview is used
 * again here, so both documents describe the same hotel from the same
 * registry read.
 */

import {
  buildOutreachFactsBlock,
  HOTEL_EVIDENCE_MIN_SUMMARIES,
  HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION,
  selectOutreachEvidence,
  type HotelPrescanEvidence,
  type OutreachThreadState,
  type SelectedOutreachEvidence,
} from '@odysseus/core';
import { buildOutreachProseInput, generateOutreachProse } from '@odysseus/llm';
import type { OutreachProseOutput } from '@odysseus/llm';
import { assembleOutreachDraft } from './assemble-outreach-draft.js';
import type { MailboxDraftAdapter } from './mailbox-draft-adapter.js';
import { registryAssessment, type PreviewSireneFacts } from './publish-preview.js';

export const SECOND_TOUCH = 2;
export const THIRD_TOUCH = 3;

export const CURRENT_OUTREACH_PROMPT_VERSION = 'v1';

export type CreateFollowUpDraftRefusal =
  | 'thread-unknown'
  | 'thread-not-eligible'
  | 'evidence-incomplete'
  | 'evidence-schema-outdated'
  | 'prescan-expired'
  | 'no-distinct-second-observation'
  | 'observation-not-in-allowlist'
  | 'previous-draft-missing'
  | 'draft-already-live'
  | 'suppressed-before-generation'
  | 'suppressed-before-provider'
  | 'assembly-refused'
  | 'provider-draft-unrecorded';

/** Everything drafting touch 2 or 3 needs about one thread, read in one go by
 *  the store adapter so this module never issues a query of its own. */
export interface FollowUpDraftRow {
  threadId: string;
  candidateId: string;
  domain: string;
  businessName: string;
  language: 'fr' | 'en';
  roleAddress: string;
  state: OutreachThreadState;
  providerThreadId?: string;
  prescanVersion: string;
  prescanExpiresAt: Date;
  evidence?: HotelPrescanEvidence;
  /** Registry facts read the same way touch 1's row does, only ever consumed
   *  through `registryAssessment`. */
  sirene?: PreviewSireneFacts;
}

export interface RecordFollowUpDraftFacts {
  threadId: string;
  candidateId: string;
  touch: number;
  language: 'fr' | 'en';
  roleAddress: string;
  subject: string;
  body: string;
  prescanVersion: string;
  evidenceVersion: string;
  outreachPromptVersion: string;
  providerDraftId: string;
  providerMessageId: string;
  providerThreadId: string;
  createdAt: Date;
}

export interface RecordFollowUpFailureFacts {
  threadId: string;
  candidateId: string;
  touch: number;
  language: 'fr' | 'en';
  roleAddress: string;
  prescanVersion: string;
  evidenceVersion: string;
  outreachPromptVersion: string;
  failureReason: CreateFollowUpDraftRefusal;
  createdAt: Date;
}

export interface CreateFollowUpDraftStorePort {
  findFollowUpRow(threadId: string): Promise<FollowUpDraftRow | null>;
  isSuppressed(domain: string): Promise<boolean>;
  /** The prior touch's own live draft, read only for its subject line. Touch 2
   *  reads touch 1's; touch 3 reads touch 2's. */
  findPreviousDraft(threadId: string, touch: number): Promise<{ subject: string } | null>;
  findLiveDraft(threadId: string, touch: number): Promise<{ draftId: string } | null>;
  recordDraft(facts: RecordFollowUpDraftFacts): Promise<{ draftId: string }>;
  recordFailure(facts: RecordFollowUpFailureFacts): Promise<void>;
  advanceTouch(threadId: string, touch: number): Promise<void>;
  transition(input: {
    threadId: string;
    from: readonly OutreachThreadState[];
    to: OutreachThreadState;
    at: Date;
    reason?: string;
  }): Promise<boolean>;
}

export interface CreateFollowUpDraftOptions {
  store: CreateFollowUpDraftStorePort;
  mailbox: MailboxDraftAdapter;
  threadId: string;
  dryRun: boolean;
  now?: Date;
  /** Injected so tests never reach the live model, matching the LLM
   *  package's own stubbed-client discipline. */
  generateProse?: typeof generateOutreachProse;
}

export interface CreateFollowUpDraftResult {
  created: boolean;
  refusal?: CreateFollowUpDraftRefusal;
  draftId?: string;
  threadId?: string;
  touch?: number;
  providerDraftId?: string;
  subject?: string;
  body?: string;
  /** Populated only by `--dry-run`: what would have happened, nothing
   *  observed, no model call. */
  plan?: {
    wouldDraft: true;
    domain: string;
    roleAddress: string;
    language: 'fr' | 'en';
    touch: number;
  };
}

function refuse(refusal: CreateFollowUpDraftRefusal): CreateFollowUpDraftResult {
  return { created: false, refusal };
}

/** Touch 2 continues from a sent touch 1; touch 3 continues from a sent touch
 *  2. Any other state is not this orchestrator's business - `sync` decides
 *  when a thread becomes eligible, this function only re-confirms it still is
 *  at the moment it actually runs. */
function touchFor(state: OutreachThreadState): 2 | 3 | undefined {
  if (state === 'e1-sent') return SECOND_TOUCH;
  if (state === 'e2-sent') return THIRD_TOUCH;
  return undefined;
}

export async function createFollowUpDraft(
  options: CreateFollowUpDraftOptions,
): Promise<CreateFollowUpDraftResult> {
  const now = options.now ?? new Date();
  const generate = options.generateProse ?? generateOutreachProse;

  const row = await options.store.findFollowUpRow(options.threadId);
  if (row === null) return refuse('thread-unknown');

  const touch = touchFor(row.state);
  if (touch === undefined) return refuse('thread-not-eligible');

  // Before anything else, and again below. An objection has to stop the next
  // thing we do, not the next batch.
  if (await options.store.isSuppressed(row.domain)) return refuse('suppressed-before-generation');

  if ((await options.store.findLiveDraft(row.threadId, touch)) !== null) {
    return refuse('draft-already-live');
  }

  const previousDraft = await options.store.findPreviousDraft(row.threadId, touch - 1);
  if (previousDraft === null) return refuse('previous-draft-missing');

  let selectedForTouch2: SelectedOutreachEvidence | undefined;

  if (touch === SECOND_TOUCH) {
    const evidence = row.evidence;
    if (evidence === undefined || evidence.status !== 'complete')
      return refuse('evidence-incomplete');
    if (evidence.schemaVersion !== HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION) {
      return refuse('evidence-schema-outdated');
    }
    if (evidence.summaries.length < HOTEL_EVIDENCE_MIN_SUMMARIES)
      return refuse('evidence-incomplete');
    // A prescan past its own retention describes a site as it was too long
    // ago to write to anybody about, and its screenshots may already be
    // swept.
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
    selectedForTouch2 = selection.touch2;
  }

  if (options.dryRun) {
    return {
      created: false,
      plan: {
        wouldDraft: true,
        domain: row.domain,
        roleAddress: row.roleAddress,
        language: row.language,
        touch,
      },
    };
  }

  const prose = await generate(
    buildOutreachProseInput({
      language: row.language,
      touch,
      businessName: row.businessName,
      selected: selectedForTouch2,
      ageFramingPermitted: true,
    }),
    selectedForTouch2?.observationKey,
  );

  const evidenceVersion =
    selectedForTouch2 !== undefined ? String(row.evidence?.schemaVersion ?? '') : '';
  const failureFacts = {
    threadId: row.threadId,
    candidateId: row.candidateId,
    touch,
    language: row.language,
    roleAddress: row.roleAddress,
    prescanVersion: row.prescanVersion,
    evidenceVersion,
    outreachPromptVersion: CURRENT_OUTREACH_PROMPT_VERSION,
    createdAt: now,
  };

  const assessment = touch === THIRD_TOUCH ? registryAssessment(row.sirene) : undefined;
  const expectedFacts =
    touch === THIRD_TOUCH
      ? buildOutreachFactsBlock({
          assessment,
          language: row.language,
          capabilities: { argumentB: true },
        })
      : undefined;
  const assembled = assembleOutreachDraft({
    prose: prose.output as OutreachProseOutput,
    language: row.language,
    previousSubject: previousDraft.subject,
    ...(assessment !== undefined ? { assessment } : {}),
    ...(expectedFacts !== undefined ? { expectedFacts } : {}),
  });
  if (!assembled.assembled) {
    await options.store.recordFailure({ ...failureFacts, failureReason: 'assembly-refused' });
    return refuse('assembly-refused');
  }

  // The second gate, immediately before the provider call and after every
  // slow step above.
  if (await options.store.isSuppressed(row.domain)) {
    await options.store.recordFailure({
      ...failureFacts,
      failureReason: 'suppressed-before-provider',
    });
    return refuse('suppressed-before-provider');
  }

  const providerDraft = await options.mailbox.createDraft({
    to: row.roleAddress,
    subject: assembled.subject,
    body: assembled.body,
    ...(row.providerThreadId !== undefined ? { providerThreadId: row.providerThreadId } : {}),
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
    // would be an unreviewed message the operator could send by reflex with
    // no record of what produced it, so it is withdrawn rather than orphaned.
    // Deletion is idempotent, so a second failure here is survivable.
    await options.mailbox.deleteDraft(providerDraft.providerDraftId).catch(() => undefined);
    await options.store
      .recordFailure({ ...failureFacts, failureReason: 'provider-draft-unrecorded' })
      .catch(() => undefined);
    return refuse('provider-draft-unrecorded');
  }

  await options.store.advanceTouch(row.threadId, touch);
  await options.store.transition({
    threadId: row.threadId,
    from: [row.state],
    to: touch === SECOND_TOUCH ? 'e2-drafted' : 'e3-drafted',
    at: now,
    reason: 'follow-up-draft-created',
  });

  return {
    created: true,
    draftId: recorded.draftId,
    threadId: row.threadId,
    touch,
    providerDraftId: providerDraft.providerDraftId,
    subject: assembled.subject,
    body: assembled.body,
  };
}
