/**
 * The "Report details (optional)" disclosure (plan 045 stage 3.1): the
 * hotel-information form's non-identity fields (SIREN, sector,
 * transactional-flow override) and the plan 019 custom cover question
 * collapsed under one summary, native <details> so it
 * needs no new dependency. None of this ever gates PDF production; it only
 * refines what the writing pass reads. Both halves share one Save, the same
 * split as the stepper's old Prepare step (audit-hotel-fields-form.tsx,
 * prepare-report-card.tsx), which this component now hosts collapsed
 * instead of as the panel's first always-open step.
 */

import { useRef, useState } from 'react';
import type { JSX } from 'react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { useI18n } from '../i18n/provider';
import { HotelFieldsForm } from './audit-hotel-fields-form';
import type { HotelFieldsFormHandle } from './audit-hotel-fields-form';
import { PrepareReportForm } from './prepare-report-card';
import type { PrepareReportFormHandle } from './prepare-report-card';
import type { ManualFieldsResponse } from './audit-detail-types';
import type { PreparationViewResponse } from './prepare-report-types';

interface ReportDetailsFormProps {
  auditId: string;
  manualFields: ManualFieldsResponse | null;
  detectedTransactionalFlow: boolean | undefined;
  /** Name of the prospect the audit is linked to, or null when unlinked. */
  linkedProspectName: string | null;
  preparation: PreparationViewResponse | undefined;
  preparationError: string | undefined;
  /** Refetches both the preparation view and the audit detail after a
   *  successful save, so provenance and warning state read server truth. */
  onSaved: () => void;
}

export function ReportDetailsForm(props: ReportDetailsFormProps): JSX.Element {
  const {
    auditId,
    manualFields,
    detectedTransactionalFlow,
    linkedProspectName,
    preparation,
    preparationError,
    onSaved,
  } = props;
  const { strings } = useI18n();
  const copy = strings.auditDetail.panel;
  const hotelFormRef = useRef<HotelFieldsFormHandle>(null);
  const prepareFormRef = useRef<PrepareReportFormHandle>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (): Promise<void> => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const fieldsSaved = (await hotelFormRef.current?.save()) ?? true;
      const preparationSaved = (await prepareFormRef.current?.save()) ?? true;
      if (fieldsSaved && preparationSaved) {
        toast.success(strings.prepareReport.savedMessage);
        onSaved();
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <details className="rounded-xl border border-line bg-panel">
      <summary className="cursor-pointer select-none px-5 py-4 text-sm font-semibold text-ink">
        {copy.reportDetailsSummary}
      </summary>
      <div className="flex flex-col gap-4 border-t border-line p-5">
        <HotelFieldsForm
          ref={hotelFormRef}
          auditId={auditId}
          manualFields={manualFields}
          detectedTransactionalFlow={detectedTransactionalFlow}
          linkedProspectName={linkedProspectName}
        />
        {preparation === undefined ? (
          <div className="flex flex-col gap-1">
            {preparationError !== undefined ? (
              <p className="text-[13px] text-ink-muted">{strings.common.requestFailed}</p>
            ) : (
              <Skeleton className="h-40" />
            )}
            <p className="text-[13px] text-ink-muted">{copy.preparationUnavailable}</p>
          </div>
        ) : (
          <PrepareReportForm ref={prepareFormRef} auditId={auditId} view={preparation} />
        )}
        <div className="flex justify-end">
          <Button isLoading={isSaving} onClick={() => void handleSave()}>
            {strings.prepareReport.saveButton}
          </Button>
        </div>
      </div>
    </details>
  );
}
