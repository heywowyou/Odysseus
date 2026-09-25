/** The identity form's draft and save (issue #532). */

import { useState } from 'react';
import { sendJson } from '../../lib/api';
import {
  identityOriginNotes,
  sirenDraftError,
  type ProspectIdentityValues,
} from '../prospect-identity-model';
import { detailsPatch } from '../prospect-hub-detail-model';
import type { ProspectDetailShared } from './shared';

export function useIdentityEdit(shared: ProspectDetailShared) {
  const { prospect, copy, strings, refreshAll, setSaving, setOutreachNotice } = shared;
  const [editedFields, setEditedFields] = useState<
    Partial<
      Record<
        | 'name'
        | 'sector'
        | 'address'
        | 'postcode'
        | 'commune'
        | 'department'
        | 'phone'
        | 'siren'
        | 'tradingName'
        | 'legalName'
        | 'notes',
        string
      >
    >
  >({});

  const fieldValue = (key: keyof typeof editedFields): string =>
    editedFields[key] ?? String(prospect[key] ?? '');

  // Issue #289: the stored identity the summary and edit form reflect,
  // whatever its origin (operator, directory, or a scan's fill).
  const identityValues: ProspectIdentityValues = {
    siren: prospect.siren,
    tradingName: prospect.tradingName,
    legalName: prospect.legalName,
  };
  // A draft SIREN blocks the save until it passes the checksum, exactly
  // like the new-scan page's field; the server re-validates on PATCH.
  const sirenError =
    editedFields.siren !== undefined
      ? sirenDraftError(editedFields.siren, copy.sirenInvalidError)
      : null;
  const identityNotes = identityOriginNotes(
    identityValues,
    prospect.fieldOrigins,
    copy,
    strings.common.vocabularyFallback,
  );

  const saveDetails = async (): Promise<void> => {
    if (sirenError !== null) return;
    const patch = detailsPatch(editedFields);
    if (patch === null) return;
    setSaving(true);
    try {
      await sendJson(`/api/prospects/${prospect.prospectId}`, 'PATCH', patch);
      setEditedFields({});
      setOutreachNotice(null);
      refreshAll();
    } catch {
      setOutreachNotice(copy.actionFailed);
    } finally {
      setSaving(false);
    }
  };

  return { editedFields, setEditedFields, fieldValue, sirenError, identityNotes, saveDetails };
}

export type IdentityEdit = ReturnType<typeof useIdentityEdit>;
