/**
 * Issue #569: the prospect lifecycle actions, each owning its guards and side
 * effects and returning a typed outcome the routes and the CLI translate.
 * The rules used to live in route handlers and drift apart: an opt-out from
 * the status selector recorded no `opted-out` event, and only the public
 * opt-out revoked the domain's previews and closed the domain's threads.
 *
 * An opt-out now has the same effects whichever way it arrives: suppression
 * (unless the caller already applied the reach the rules allow), the
 * `opted-out` event, the prospect's outreach withdrawn, and every live preview
 * and thread of its website's domain taken out of circulation.
 *
 * The mailbox, the preview publisher and artifact storage are injected, as is
 * the in-flight probe: the server's probe sees work running in its own
 * process; a separate process such as the CLI can only see persisted state.
 */

import type { Connection } from 'mongoose';
import { primaryWebsite, type Prospect, type ProspectStatus } from '@odysseus/core';
import {
  archiveProspect,
  closeOutreachThreadsForDomain,
  confirmOutreachSentByOperator,
  countActiveProspectDeletionJobs,
  findOutreachThreadByProspect,
  getProspectHub,
  listLivePreviewsForDomain,
  recordProspectOutcome,
  revokeOutreachPreview,
  setProspectStatus,
  type ProspectLifecycleResult,
  type ProspectStatusSuppressionOptions,
} from '@odysseus/store';
import { AuditArtifactDeletionError } from '../artifacts/delete-audit-artifacts.js';
import type { ArtifactStore } from '../artifacts/artifact-store.js';
import {
  deleteProspectWithStorage,
  type ProspectDeletionOutcome,
} from '../artifacts/delete-prospect-with-storage.js';
import {
  purgeProspectAuditStorage,
  type ProspectAuditPurge,
} from '../artifacts/purge-prospect-audit-storage.js';
import type { MailboxDraftAdapter } from '../outreach/mailbox-draft-adapter.js';
import type { PreviewPublisher } from '../outreach/preview-publisher.js';
import {
  deletePendingMailboxDraftRows,
  withdrawOutreachForProspect,
  type WithdrawnOutreachSummary,
} from '../outreach/withdraw-prospect-outreach.js';

/** Whether work that could still write the prospect's audits is running. */
export type ProspectWorkProbe = (prospectId: string) => Promise<boolean>;

export interface ProspectLifecycleAdapters {
  /** Resolved lazily so an action with no live preview never needs a bucket. */
  publisher: () => PreviewPublisher;
  mailbox: MailboxDraftAdapter | null;
}

export interface ProspectStorageAdapters {
  artifactsRoot: string;
  store: ArtifactStore | undefined;
  workInFlight: ProspectWorkProbe;
}

/** The CLI's probe: a queued or running job row. A separate process cannot
 *  see the server's in-process work (a stopped job still finishing its
 *  stage, report production), and no persisted signal records either, so
 *  this is the whole of what it can check. */
export function persistedProspectWorkProbe(connection: Connection): ProspectWorkProbe {
  return async (prospectId) => (await countActiveProspectDeletionJobs(connection, prospectId)) > 0;
}

const OPT_OUT_REVOCATION_REASON = 'opted-out';

export interface OptOutEffects {
  withdrawn: WithdrawnOutreachSummary;
  /** Live previews of the prospect's domain revoked beyond its own. */
  domainPreviewsRevoked: number;
}

export type OptOutOutcome =
  | { kind: 'not-found' }
  | { kind: 'opted-out'; prospect: Prospect; effects: OptOutEffects }
  /** The opt-out, its suppression and event are saved, but taking the
   *  outreach out of circulation failed; repeating the opt-out finishes it. */
  | { kind: 'withdrawal-failed'; prospect: Prospect; error: unknown };

/**
 * Opts a prospect out. `suppression: 'already-applied'` is the public
 * opt-out's: it already wrote the reach its token allows, and opting the
 * prospect out must not widen it. A won or lost prospect keeps its result;
 * the suppression still stops any further contact.
 */
export async function optOutProspect(
  connection: Connection,
  prospectId: string,
  adapters: ProspectLifecycleAdapters,
  options: { actor: string; suppression?: ProspectStatusSuppressionOptions['suppression'] },
): Promise<OptOutOutcome> {
  const prospect = await recordProspectOutcome(connection, prospectId, 'opt-out', options.actor, {
    ...(options.suppression !== undefined ? { suppression: options.suppression } : {}),
  });
  if (prospect === null) return { kind: 'not-found' };
  try {
    const withdrawn = await withdrawOutreachForProspect(
      connection,
      prospectId,
      'opted-out',
      adapters,
    );
    let domainPreviewsRevoked = 0;
    const website = primaryWebsite(prospect.websites);
    if (website !== undefined) {
      for (const preview of await listLivePreviewsForDomain(
        connection,
        website.registrableDomain,
      )) {
        // Object first, record second, as in every other revocation.
        await adapters.publisher().delete(preview.objectKey);
        await revokeOutreachPreview(connection, preview.previewId, OPT_OUT_REVOCATION_REASON);
        domainPreviewsRevoked += 1;
      }
      await closeOutreachThreadsForDomain(
        connection,
        website.registrableDomain,
        OPT_OUT_REVOCATION_REASON,
      );
    }
    return { kind: 'opted-out', prospect, effects: { withdrawn, domainPreviewsRevoked } };
  } catch (error) {
    return { kind: 'withdrawal-failed', prospect, error };
  }
}

export type SetStatusOutcome =
  | { kind: 'not-found' }
  | {
      kind: 'updated';
      prospect: Prospect;
      sendConfirmed?: { touch: number; threadClosed: boolean };
      mailboxDraftsNotRemoved?: number;
    }
  | Exclude<OptOutOutcome, { kind: 'not-found' }>;

/**
 * The operator's status selector. Opting out goes through optOutProspect. A
 * manual contacted/follow-up with a touch still drafted means the operator
 * sent it in an email the mailbox sync cannot see (one message to a contact
 * shared by several prospects), so that send is confirmed, or the draft would
 * stay in review forever. Rerunning the same status repairs a prospect set by
 * hand before this existed.
 */
export async function setProspectStatusAction(
  connection: Connection,
  prospectId: string,
  status: ProspectStatus,
  adapters: ProspectLifecycleAdapters,
): Promise<SetStatusOutcome> {
  if (status === 'opted-out') {
    return optOutProspect(connection, prospectId, adapters, { actor: 'operator' });
  }
  const prospect = await setProspectStatus(connection, prospectId, status);
  if (prospect === null) return { kind: 'not-found' };
  if (status !== 'contacted' && status !== 'follow-up') return { kind: 'updated', prospect };
  const confirmed = await confirmOutreachSentByOperator(connection, prospect.prospectId, status);
  if (confirmed.touch === undefined) return { kind: 'updated', prospect };
  const mailboxDraftsNotRemoved = await deletePendingMailboxDraftRows(
    connection,
    confirmed.providerDrafts,
    adapters.mailbox,
  );
  return {
    kind: 'updated',
    prospect,
    sendConfirmed: { touch: confirmed.touch, threadClosed: confirmed.threadClosed },
    mailboxDraftsNotRemoved,
  };
}

export const PROSPECT_OUTCOMES = [
  'no-reply',
  'reply-positive',
  'reply-not-now',
  'reply-negative',
  'opt-out',
  'call',
  'quoted',
  'won',
  'lost',
] as const;
export type ProspectOutcome = (typeof PROSPECT_OUTCOMES)[number];

const REPLY_OUTCOMES: ReadonlySet<ProspectOutcome> = new Set([
  'no-reply',
  'reply-positive',
  'reply-not-now',
  'reply-negative',
]);

export type RecordOutcomeOutcome =
  | { kind: 'not-found' }
  | { kind: 'recorded'; prospect: Prospect }
  /** Issue #278: a reply outcome describes an email that was sent. */
  | { kind: 'refused'; refusal: 'nothing-sent' }
  | { kind: 'refused'; refusal: 'status-transition'; message: string }
  | Exclude<OptOutOutcome, { kind: 'not-found' }>;

export async function recordProspectOutcomeAction(
  connection: Connection,
  prospectId: string,
  outcome: ProspectOutcome,
  adapters: ProspectLifecycleAdapters,
): Promise<RecordOutcomeOutcome> {
  if (outcome === 'opt-out') {
    return optOutProspect(connection, prospectId, adapters, { actor: 'operator' });
  }
  if (REPLY_OUTCOMES.has(outcome)) {
    const thread = await findOutreachThreadByProspect(connection, prospectId);
    if (thread === null || thread.touches.length === 0) {
      return { kind: 'refused', refusal: 'nothing-sent' };
    }
  }
  try {
    const prospect = await recordProspectOutcome(connection, prospectId, outcome);
    return prospect === null ? { kind: 'not-found' } : { kind: 'recorded', prospect };
  } catch (error) {
    if (error instanceof Error && error.name === 'AutomaticStatusTransitionError') {
      return { kind: 'refused', refusal: 'status-transition', message: error.message };
    }
    throw error;
  }
}

export type ArchiveOutcome =
  | { kind: 'not-found' }
  | { kind: 'refused'; refusal: 'active-job' | 'work-in-flight' }
  | { kind: 'archived'; result: ProspectLifecycleResult; purged: ProspectAuditPurge }
  /** Archived, but some audits' storage could not be removed; they stay
   *  attached, and archiving again resumes the purge. */
  | { kind: 'purge-failed'; message: string };

/**
 * Plan 050, amended by issue #381: archive keeps the CRM record,
 * correspondence, suppression and directory link, and never withdraws
 * outreach, but it permanently removes the prospect's audits and their stored
 * files (delivered audits come back slimmed, issue #560). It refuses while
 * work could still recreate those audits or files.
 */
export async function archiveProspectAction(
  connection: Connection,
  prospectId: string,
  storage: ProspectStorageAdapters,
): Promise<ArchiveOutcome> {
  if ((await getProspectHub(connection, prospectId)) === null) return { kind: 'not-found' };
  if ((await countActiveProspectDeletionJobs(connection, prospectId)) > 0) {
    return { kind: 'refused', refusal: 'active-job' };
  }
  if (await storage.workInFlight(prospectId)) {
    return { kind: 'refused', refusal: 'work-in-flight' };
  }
  const result = await archiveProspect(connection, prospectId);
  if (result === null) return { kind: 'not-found' };
  const purged = await purgeArchivedProspectAudits(connection, prospectId, storage);
  return purged.kind === 'purged' ? { kind: 'archived', result, purged: purged.purged } : purged;
}

export type PurgeOutcome =
  | { kind: 'purged'; purged: ProspectAuditPurge }
  | { kind: 'refused'; refusal: 'work-in-flight' }
  | { kind: 'purge-failed'; message: string };

/** Removes an archived prospect's audits and their stored files, unless the
 *  probe reports work that could recreate them. The archive action and the
 *  CLI's catch-up purge share it. */
export async function purgeArchivedProspectAudits(
  connection: Connection,
  prospectId: string,
  storage: ProspectStorageAdapters,
): Promise<PurgeOutcome> {
  if (await storage.workInFlight(prospectId)) {
    return { kind: 'refused', refusal: 'work-in-flight' };
  }
  try {
    const purged = await purgeProspectAuditStorage(connection, prospectId, {
      artifactsRoot: storage.artifactsRoot,
      store: storage.store,
    });
    return { kind: 'purged', purged };
  } catch (error) {
    if (!(error instanceof AuditArtifactDeletionError)) throw error;
    return { kind: 'purge-failed', message: error.message };
  }
}

/**
 * Permanent deletion, the exceptional path (duplicates, test records, bad
 * imports). Refused while work could recreate the audits and artifact folders
 * being removed; otherwise outreach is withdrawn, then storage, then records
 * (deleteProspectWithStorage).
 */
export async function deleteProspectAction(
  connection: Connection,
  prospectId: string,
  adapters: ProspectLifecycleAdapters & ProspectStorageAdapters,
): Promise<ProspectDeletionOutcome | { refusal: 'work-in-flight'; detail: string }> {
  if ((await getProspectHub(connection, prospectId)) === null) {
    return { refusal: 'not-found', detail: 'prospect not found' };
  }
  if (await adapters.workInFlight(prospectId)) {
    return {
      refusal: 'work-in-flight',
      detail: 'work for this prospect is still finishing; try again shortly',
    };
  }
  return deleteProspectWithStorage(connection, prospectId, {
    artifactsRoot: adapters.artifactsRoot,
    store: adapters.store,
    publisher: adapters.publisher,
    mailbox: adapters.mailbox,
  });
}
