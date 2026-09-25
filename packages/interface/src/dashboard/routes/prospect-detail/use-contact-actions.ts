/** The contacts editor's state and mutations: websites, emails and
 *  stakeholders (issue #532). */

import { useState } from 'react';
import { sendJson } from '../../lib/api';
import {
  contactRemovalRequest,
  stakeholderFromInput,
  stakeholdersAfterChange,
  type ContactRemoval,
  type ProspectStakeholder,
} from '../prospect-contact-model';
import { emailAddition, websiteAddition } from '../prospect-hub-detail-model';
import type { ProspectHubDetail } from './types';
import type { ProspectDetailShared } from './shared';

export function useContactActions(shared: ProspectDetailShared) {
  const { prospect, copy, refreshAll, setSaving, setOutreachNotice, stakeholders } = shared;
  const [website, setWebsite] = useState('');
  const [email, setEmail] = useState('');
  const [pendingRemoval, setPendingRemoval] = useState<ContactRemoval | null>(null);
  const [newStakeholder, setNewStakeholder] = useState({ name: '', position: '' });
  const [stakeholderEdit, setStakeholderEdit] = useState<{
    index: number;
    name: string;
    position: string;
  } | null>(null);
  const [pendingStakeholderRemoval, setPendingStakeholderRemoval] = useState<number | null>(null);

  const saveWebsite = async (): Promise<void> => {
    const addition = websiteAddition(prospect.websites, website);
    if (addition.kind === 'invalid') {
      setOutreachNotice(copy.actionFailed);
      return;
    }
    if (addition.kind === 'unchanged') return;
    setSaving(true);
    try {
      await sendJson(`/api/prospects/${prospect.prospectId}`, 'PATCH', {
        websites: addition.websites,
      });
      setWebsite('');
      setOutreachNotice(null);
      refreshAll();
    } catch {
      setOutreachNotice(copy.actionFailed);
    } finally {
      setSaving(false);
    }
  };

  const removeContact = async (removal: ContactRemoval): Promise<void> => {
    const request = contactRemovalRequest(prospect.prospectId, removal);
    try {
      const result = await sendJson<{ mailboxDraftsNotRemoved?: number }>(
        request.path,
        'DELETE',
        request.body,
      );
      const pending = result.mailboxDraftsNotRemoved ?? 0;
      if (pending > 0) {
        setOutreachNotice(copy.mailboxDeletionWarning.replace('{count}', String(pending)));
      }
      refreshAll();
    } catch {
      setOutreachNotice(copy.actionFailed);
    }
  };

  const choosePrimary = async (kind: 'websites' | 'emails', value: string): Promise<void> => {
    setSaving(true);
    try {
      await sendJson(
        `/api/prospects/${encodeURIComponent(prospect.prospectId)}/${kind}/primary`,
        'POST',
        kind === 'websites' ? { url: value } : { address: value },
      );
      refreshAll();
    } catch {
      setOutreachNotice(copy.actionFailed);
    } finally {
      setSaving(false);
    }
  };

  const saveEmail = async (
    suggestion?: NonNullable<ProspectHubDetail['contactSuggestion']>,
  ): Promise<void> => {
    const emails = emailAddition(prospect.emails, email, suggestion);
    if (emails === null) return;
    setSaving(true);
    try {
      await sendJson(`/api/prospects/${prospect.prospectId}`, 'PATCH', { emails });
      if (suggestion === undefined) setEmail('');
      setOutreachNotice(null);
      refreshAll();
    } catch {
      setOutreachNotice(copy.actionFailed);
    } finally {
      setSaving(false);
    }
  };

  /** `index` undefined appends; `entry` null removes. Resolves true once saved. */
  const saveStakeholders = async (
    index: number | undefined,
    entry: ProspectStakeholder | null,
  ): Promise<boolean> => {
    setSaving(true);
    try {
      await sendJson(`/api/prospects/${prospect.prospectId}`, 'PATCH', {
        stakeholders: stakeholdersAfterChange(stakeholders, index, entry),
      });
      refreshAll();
      return true;
    } catch {
      setOutreachNotice(copy.actionFailed);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const addStakeholder = async (): Promise<void> => {
    const entry = stakeholderFromInput(newStakeholder.name, newStakeholder.position);
    if (entry === null) return;
    if (await saveStakeholders(undefined, entry)) setNewStakeholder({ name: '', position: '' });
  };

  const saveStakeholderEdit = async (): Promise<void> => {
    if (stakeholderEdit === null) return;
    const entry = stakeholderFromInput(stakeholderEdit.name, stakeholderEdit.position);
    if (entry === null) return;
    if (await saveStakeholders(stakeholderEdit.index, entry)) setStakeholderEdit(null);
  };

  return {
    website,
    setWebsite,
    email,
    setEmail,
    pendingRemoval,
    setPendingRemoval,
    newStakeholder,
    setNewStakeholder,
    stakeholderEdit,
    setStakeholderEdit,
    pendingStakeholderRemoval,
    setPendingStakeholderRemoval,
    saveWebsite,
    removeContact,
    choosePrimary,
    saveEmail,
    saveStakeholders,
    addStakeholder,
    saveStakeholderEdit,
  };
}

export type ContactActions = ReturnType<typeof useContactActions>;
