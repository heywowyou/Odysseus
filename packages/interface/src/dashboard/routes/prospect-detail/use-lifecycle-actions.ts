/** Archive, restore and permanent deletion, with the impact each asks
 *  about first (issue #532). */

import { useState } from 'react';
import { fetchJson, sendJson } from '../../lib/api';
import type { ProspectDeletionImpact } from '../prospect-hub-model';
import { archiveFailureNotice, deleteFailureNotice } from '../prospect-hub-detail-model';
import type { ProspectDetailShared } from './shared';

export function useLifecycleActions(shared: ProspectDetailShared) {
  const { prospect, copy, navigate, refreshAll, setOutreachNotice } = shared;
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [deletionImpact, setDeletionImpact] = useState<ProspectDeletionImpact | null>(null);
  const [archiveImpact, setArchiveImpact] = useState<ProspectDeletionImpact | null>(null);
  const [lifecycleNotice, setLifecycleNotice] = useState<string | null>(null);

  // Plan 050: archive is the ordinary removal from active work. Issue #381:
  // it keeps the CRM record and correspondence but permanently deletes the
  // prospect's scans, so it asks first with the counts it will remove.
  // Restore returns the record only.
  const restore = async (): Promise<void> => {
    setLifecycleBusy(true);
    setLifecycleNotice(null);
    try {
      await sendJson(
        `/api/prospects/${encodeURIComponent(prospect.prospectId)}/restore`,
        'POST',
        {},
      );
      refreshAll();
    } catch {
      setLifecycleNotice(copy.actionFailed);
    } finally {
      setLifecycleBusy(false);
    }
  };

  const requestArchive = async (): Promise<void> => {
    setLifecycleBusy(true);
    setLifecycleNotice(null);
    try {
      setArchiveImpact(
        await fetchJson<ProspectDeletionImpact>(
          `/api/prospects/${encodeURIComponent(prospect.prospectId)}/deletion-impact`,
        ),
      );
    } catch {
      setLifecycleNotice(copy.actionFailed);
    } finally {
      setLifecycleBusy(false);
    }
  };

  // Also the retry when an earlier archive left scans behind: the archive
  // endpoint is idempotent and resumes the purge.
  const archive = async (): Promise<void> => {
    setLifecycleBusy(true);
    try {
      await sendJson(
        `/api/prospects/${encodeURIComponent(prospect.prospectId)}/archive`,
        'POST',
        {},
      );
    } catch (error) {
      setLifecycleNotice(archiveFailureNotice(copy, error));
    } finally {
      setLifecycleBusy(false);
      refreshAll();
    }
  };

  const requestPermanentDelete = async (): Promise<void> => {
    setLifecycleBusy(true);
    setOutreachNotice(null);
    try {
      setDeletionImpact(
        await fetchJson<ProspectDeletionImpact>(
          `/api/prospects/${encodeURIComponent(prospect.prospectId)}/deletion-impact`,
        ),
      );
    } catch {
      setOutreachNotice(copy.actionFailed);
    } finally {
      setLifecycleBusy(false);
    }
  };

  const deletePermanently = async (): Promise<void> => {
    try {
      await sendJson(`/api/prospects/${encodeURIComponent(prospect.prospectId)}`, 'DELETE', {});
      void navigate('/prospects');
    } catch (error) {
      setOutreachNotice(deleteFailureNotice(copy, error));
    }
  };

  return {
    lifecycleBusy,
    deletionImpact,
    setDeletionImpact,
    archiveImpact,
    setArchiveImpact,
    lifecycleNotice,
    restore,
    requestArchive,
    archive,
    requestPermanentDelete,
    deletePermanently,
  };
}

export type LifecycleActions = ReturnType<typeof useLifecycleActions>;
