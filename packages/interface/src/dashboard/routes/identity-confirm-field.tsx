/**
 * Plan 045 slice 1.3: the inline Confirm control for a detected identity
 * field (nomCommercial or raisonSociale). D8's cover-identity gate
 * (packages/report/src/template/unconfirmed-fields.ts) refuses to print a
 * detected-but-unconfirmed value on a paid deliverable's cover, and
 * confirming used to mean opening the stepper's Prepare step, editing the
 * hotel-fields form, and saving the whole form - or, before that, an
 * implicit confirm-on-Save that fired whenever the form happened to submit
 * with the detected value untouched. Both routes gave the operator no way
 * to just say "yes, that's right" on the one field the gate is stuck on.
 *
 * This component is that one action: the detected value prefilled and
 * editable, one Confirm button, calling
 * POST /api/audits/:auditId/manual-fields/confirm directly. Used both in
 * the stepper's first step and in NeedsInputCard on the progress page
 * (scan-progress.tsx), which used to only link away to the audit page.
 */

import { useState } from 'react';
import type { JSX } from 'react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Field } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { useI18n } from '../i18n/provider';
import { sendJson } from '../lib/api';
import type { IdentityField, ManualFieldsConfirmResponse } from './audit-detail-types';

export type { IdentityField };

export function IdentityConfirmField(props: {
  auditId: string;
  field: IdentityField;
  /** The detected value, shown prefilled and editable: the operator can
   *  correct a wrong guess and confirm the correction in the same click,
   *  rather than confirming junk just to unblock the PDF. */
  detectedValue: string;
  /** Called after a successful confirm, whatever it unblocked, so the
   *  caller can refetch the audit/job state the confirmed field affects. */
  onConfirmed: () => void;
}): JSX.Element {
  const { auditId, field, detectedValue, onConfirmed } = props;
  const { strings } = useI18n();
  const [value, setValue] = useState(detectedValue);
  const [isConfirming, setIsConfirming] = useState(false);

  const label =
    field === 'nomCommercial'
      ? strings.auditDetail.nomCommercialLabel
      : strings.auditDetail.raisonSocialeLabel;

  const handleConfirm = async (): Promise<void> => {
    const trimmed = value.trim();
    if (trimmed === '' || isConfirming) return;
    setIsConfirming(true);
    try {
      const result = await sendJson<ManualFieldsConfirmResponse>(
        `/api/audits/${encodeURIComponent(auditId)}/manual-fields/confirm`,
        'POST',
        { field, value: trimmed },
      );
      if (result.pdfs === 'generated') {
        toast.success(strings.auditDetail.identityConfirmedGeneratedMessage);
      } else if (result.pdfs === 'waiting-other-field') {
        toast.success(strings.auditDetail.identityConfirmedWaitingMessage);
      } else {
        // A refusal (scan-data-missing, no-analysis, or another identity
        // field still unconfirmed after all): the field itself is still
        // confirmed and saved, only the automatic PDF attempt fell short.
        toast.error(strings.auditDetail.actionError, { description: result.pdfs.kind });
      }
      onConfirmed();
    } catch (error) {
      toast.error(strings.auditDetail.actionError, {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Field label={label} htmlFor={`identity-confirm-${field}`}>
        <div className="flex gap-2">
          <Input
            id={`identity-confirm-${field}`}
            name={field}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <Button
            variant="secondary"
            isLoading={isConfirming}
            disabled={value.trim() === ''}
            onClick={() => void handleConfirm()}
          >
            {strings.auditDetail.identityConfirmButton}
          </Button>
        </div>
      </Field>
      <p className="text-xs text-accent-bright">{strings.auditDetail.detectedFieldHint}</p>
    </div>
  );
}
