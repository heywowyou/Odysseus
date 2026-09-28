/** Preview, email drafts, outcomes and status: the outreach mutations the
 *  recommended, outreach, actions and history panels share (issue #532). */

import { useState } from 'react';
import { ApiError, sendJson } from '../../lib/api';
import type { ProspectStatus } from '../prospect-hub-model';
import {
  firstEmailBody,
  outcomeFailureNotice,
  outcomeNotice,
  outreachResultNotice,
} from '../prospect-hub-detail-model';
import { TERMINAL_STATUSES } from './types';
import type { ProspectDetailShared } from './shared';

export function useOutreachActions(shared: ProspectDetailShared) {
  const {
    prospect,
    copy,
    strings,
    refreshAll,
    setSaving,
    setOutreachBusy,
    setOutreachNotice,
    livePreviewUrl,
  } = shared;
  const [pendingOutcome, setPendingOutcome] = useState<string | null>(null);
  const [pendingTerminalStatus, setPendingTerminalStatus] = useState<string | null>(null);

  const publishPreview = async (): Promise<void> => {
    setOutreachBusy('preview');
    setOutreachNotice(null);
    try {
      const result = await sendJson<{ published: boolean; refusal?: string; url?: string }>(
        `/api/prospects/${prospect.prospectId}/preview/publish`,
        'POST',
        {},
      );
      setOutreachNotice(
        outreachResultNotice(
          copy,
          strings.common.vocabularyFallback,
          { done: result.published, refusal: result.refusal },
          copy.previewPublished,
        ),
      );
      refreshAll();
    } catch {
      setOutreachNotice(copy.actionFailed);
    } finally {
      setOutreachBusy(null);
    }
  };

  const runFirstEmail = async (): Promise<void> => {
    setOutreachBusy('first-email');
    setOutreachNotice(null);
    try {
      const result = await sendJson<{ created: boolean; refusal?: string }>(
        `/api/prospects/${prospect.prospectId}/outreach/first-email`,
        'POST',
        firstEmailBody(livePreviewUrl),
      );
      setOutreachNotice(
        outreachResultNotice(
          copy,
          strings.common.vocabularyFallback,
          { done: result.created, refusal: result.refusal },
          copy.firstEmailCreated,
        ),
      );
      refreshAll();
    } catch {
      setOutreachNotice(copy.actionFailed);
    } finally {
      setOutreachBusy(null);
    }
  };

  const runFollowUp = async (): Promise<void> => {
    setOutreachBusy('follow-up');
    setOutreachNotice(null);
    try {
      const result = await sendJson<{ created: boolean; refusal?: string }>(
        `/api/prospects/${prospect.prospectId}/outreach/follow-up`,
        'POST',
        {},
      );
      setOutreachNotice(
        outreachResultNotice(
          copy,
          strings.common.vocabularyFallback,
          { done: result.created, refusal: result.refusal },
          copy.followUpCreated,
        ),
      );
      refreshAll();
    } catch {
      setOutreachNotice(copy.actionFailed);
    } finally {
      setOutreachBusy(null);
    }
  };

  const recordOutcome = async (outcome: string): Promise<void> => {
    setOutreachBusy('outcome');
    setOutreachNotice(null);
    try {
      const result = await sendJson<{
        withdrawn?: {
          drafts: number;
          previews: number;
          mailboxDraftsNotRemoved?: number;
        };
      }>(`/api/prospects/${prospect.prospectId}/outcome`, 'POST', { outcome });
      setOutreachNotice(outcomeNotice(copy, outcome, result));
    } catch (error) {
      setOutreachNotice(outcomeFailureNotice(copy, error));
    } finally {
      setOutreachBusy(null);
      refreshAll();
    }
  };

  const requestOutcome = (outcome: string): void => {
    if (['opt-out', 'won', 'lost'].includes(outcome)) setPendingOutcome(outcome);
    else void recordOutcome(outcome);
  };

  const requestStatusChange = (status: string): void => {
    if (TERMINAL_STATUSES.includes(status as ProspectStatus)) setPendingTerminalStatus(status);
    else void changeStatus(status);
  };

  const discardDraft = async (draftId: string): Promise<void> => {
    if (!window.confirm(copy.confirmDiscardDraft)) return;
    setOutreachBusy(`discard-${draftId}`);
    setOutreachNotice(null);
    try {
      const result = await sendJson<{
        previewRevoked?: boolean;
        previewStillLive?: boolean;
        mailboxDraftsNotRemoved?: number;
      }>(
        `/api/prospects/${prospect.prospectId}/drafts/${encodeURIComponent(draftId)}/discard`,
        'POST',
        {},
      );
      const baseNotice =
        result.previewStillLive === true
          ? copy.draftDiscardedPreviewLive
          : result.previewRevoked === true
            ? copy.draftDiscardedWithPreview
            : copy.draftDiscarded;
      const pending = result.mailboxDraftsNotRemoved ?? 0;
      setOutreachNotice(
        pending > 0
          ? `${baseNotice} ${copy.mailboxDeletionWarning.replace('{count}', String(pending))}`
          : baseNotice,
      );
    } catch (error) {
      // Issue #478: the server keeps the draft when the mailbox no longer
      // has it (it was probably sent) or could not be checked.
      const status = error instanceof ApiError ? error.status : undefined;
      setOutreachNotice(
        status === 409
          ? copy.draftNotInMailbox
          : status === 502
            ? copy.draftMailboxCheckFailed
            : copy.actionFailed,
      );
    } finally {
      setOutreachBusy(null);
      refreshAll();
    }
  };

  const revokePreview = async (previewId: string): Promise<void> => {
    if (!window.confirm(copy.confirmRevokePreview)) return;
    setOutreachBusy(`revoke-${previewId}`);
    setOutreachNotice(null);
    try {
      await sendJson(
        `/api/prospects/${prospect.prospectId}/previews/${encodeURIComponent(previewId)}/revoke`,
        'POST',
        {},
      );
      setOutreachNotice(copy.previewRevoked);
    } catch {
      setOutreachNotice(copy.actionFailed);
    } finally {
      setOutreachBusy(null);
      refreshAll();
    }
  };

  const copyPreviewLink = async (url: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(url);
      setOutreachNotice(copy.previewLinkCopied);
    } catch {
      setOutreachNotice(copy.actionFailed);
    }
  };

  const changeOutreachLanguage = async (next: string): Promise<void> => {
    setSaving(true);
    try {
      await sendJson(`/api/prospects/${prospect.prospectId}`, 'PATCH', { outreachLanguage: next });
      refreshAll();
    } catch {
      setOutreachNotice(copy.actionFailed);
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (status: string): Promise<void> => {
    setOutreachBusy('status');
    setOutreachNotice(null);
    try {
      const result = await sendJson<{
        withdrawn?: { mailboxDraftsNotRemoved?: number };
        /** Set when the status confirmed a drafted touch sent elsewhere. */
        mailboxDraftsNotRemoved?: number;
      }>(`/api/prospects/${prospect.prospectId}/status`, 'PATCH', { status });
      const pending =
        result.withdrawn?.mailboxDraftsNotRemoved ?? result.mailboxDraftsNotRemoved ?? 0;
      if (pending > 0) {
        setOutreachNotice(copy.mailboxDeletionWarning.replace('{count}', String(pending)));
      }
      refreshAll();
    } catch {
      setOutreachNotice(copy.actionFailed);
    } finally {
      setOutreachBusy(null);
    }
  };

  return {
    pendingOutcome,
    setPendingOutcome,
    pendingTerminalStatus,
    setPendingTerminalStatus,
    publishPreview,
    runFirstEmail,
    runFollowUp,
    recordOutcome,
    requestOutcome,
    requestStatusChange,
    discardDraft,
    revokePreview,
    copyPreviewLink,
    changeOutreachLanguage,
    changeStatus,
  };
}

export type OutreachActions = ReturnType<typeof useOutreachActions>;
