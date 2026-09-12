/**
 * The client-report stepper (plan 040 slice 5, approved IA "The audit
 * page"): the five numbered steps from preparation to delivery approval,
 * one button per step, each step unlocked by the previous one. The ladder
 * itself is pure (reportStepperSteps), so the gating is unit-tested
 * without a render; this component fetches the shared preparation view,
 * hosts the moved-out forms and sections in their step, and owns every
 * write action. The failure card deep-links into these steps by their
 * anchor ids instead of carrying its own regenerate button.
 */

import { useRef, useState } from 'react';
import type { JSX } from 'react';
import { toast } from 'sonner';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { ConfirmDialog } from '../components/ui/dialog';
import { Skeleton } from '../components/ui/skeleton';
import { useI18n } from '../i18n/provider';
import { postEmpty, sendJson } from '../lib/api';
import { cn } from '../lib/cn';
import { useApi } from '../lib/use-api';
import { REPORT_STEP_ANCHORS, reportStepperSteps } from './audit-detail-model';
import type { ReportStep } from './audit-detail-model';
import type { AuditDetailResponse } from './audit-detail-types';
import { HotelFieldsForm } from './audit-hotel-fields-form';
import type { HotelFieldsFormHandle } from './audit-hotel-fields-form';
import { ReportsCard } from './audit-reports-section';
import { PrepareReportForm } from './prepare-report-card';
import type { PrepareReportFormHandle } from './prepare-report-card';
import type { PreparationViewResponse } from './prepare-report-types';

export function AuditReportStepper(props: {
  auditId: string;
  detail: AuditDetailResponse;
  /** Signals the page that one of this stepper's writes is in flight, so
   *  the detail page can poll until it lands (plan 040 poll policy). */
  onBusy: (active: boolean) => void;
  /** Refetches the audit detail after an action changed server state. */
  refresh: () => void;
}): JSX.Element {
  const { auditId, detail, onBusy, refresh } = props;
  const { strings } = useI18n();
  const copy = strings.auditDetail.stepper;
  const basePath = `/api/audits/${encodeURIComponent(auditId)}/report-preparation`;
  const {
    data: preparation,
    error: preparationError,
    refresh: refreshPreparation,
  } = useApi<PreparationViewResponse>(basePath);

  const prepareFormRef = useRef<PrepareReportFormHandle>(null);
  const hotelFormRef = useRef<HotelFieldsFormHandle>(null);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isConfirmRewriteOpen, setIsConfirmRewriteOpen] = useState(false);
  const [isConfirmApproveOpen, setIsConfirmApproveOpen] = useState(false);

  const candidate = preparation?.preparation.writingSelection?.candidate;
  const selected = preparation?.preparation.writingSelection?.selected;
  const steps = reportStepperSteps({
    acknowledgementCurrent: preparation?.acknowledgementCurrent ?? false,
    warningCount: preparation?.preview.warnings.length ?? 0,
    candidateStatus: candidate?.status,
    isWritingSelected: selected !== undefined,
    lifecycle: detail.lifecycle,
    hasStoredReportPair: detail.reportLanguages.length > 0,
    hasFreshReportPair: detail.lifecycle === 'rendered' || detail.lifecycle === 'approved',
  });

  /** Step 1's single save: the preparation choices and the hotel fields
   *  PATCH in one click, and the operator reads one success toast no
   *  matter how many of the two halves had something to store. */
  const handleSaveAll = async (): Promise<void> => {
    if (isSavingAll) return;
    setIsSavingAll(true);
    onBusy(true);
    try {
      const hotelForm = hotelFormRef.current;
      // The detected identity fields ride along when they still await a
      // confirmation, which is exactly what the needs-input gate wants.
      const fieldsSaved = hotelForm
        ? await hotelForm.save({ confirmDetected: hotelForm.hasDetectedConfirmation() })
        : true;
      const preparationSaved = (await prepareFormRef.current?.save()) ?? true;
      if (fieldsSaved && preparationSaved) {
        toast.success(strings.prepareReport.savedMessage);
      }
      refreshPreparation();
      refresh();
    } finally {
      onBusy(false);
      setIsSavingAll(false);
    }
  };

  const handleConfirmWarnings = async (): Promise<void> => {
    onBusy(true);
    try {
      await sendJson(`${basePath}/confirm-warnings`, 'POST', {});
      toast.success(strings.prepareReport.warningsConfirmedLabel);
      refreshPreparation();
      refresh();
    } catch (confirmError) {
      toast.error(strings.auditDetail.actionError, {
        description: confirmError instanceof Error ? confirmError.message : undefined,
      });
    } finally {
      onBusy(false);
    }
  };

  const handleRewrite = async (): Promise<void> => {
    setIsConfirmRewriteOpen(false);
    // UX pre-check only; the server re-verifies and is the authority.
    if (
      preparation !== undefined &&
      !preparation.acknowledgementCurrent &&
      preparation.preview.warnings.length > 0
    ) {
      toast.info(strings.prepareReport.confirmWarningsFirstHint);
      return;
    }
    setIsRewriting(true);
    onBusy(true);
    try {
      await sendJson(`${basePath}/regenerate-writing`, 'POST', { costWarningConfirmed: true });
      toast.success(strings.prepareReport.candidateReadyLabel);
      refreshPreparation();
      refresh();
    } catch (rewriteError) {
      toast.error(strings.auditDetail.actionError, {
        description: rewriteError instanceof Error ? rewriteError.message : undefined,
      });
    } finally {
      setIsRewriting(false);
      onBusy(false);
    }
  };

  const handleApproveCandidate = async (): Promise<void> => {
    onBusy(true);
    try {
      await sendJson(`${basePath}/approve-candidate`, 'POST', {});
      toast.success(strings.prepareReport.approvedMessage);
      refreshPreparation();
      refresh();
    } catch (approveError) {
      toast.error(strings.auditDetail.actionError, {
        description: approveError instanceof Error ? approveError.message : undefined,
      });
    } finally {
      onBusy(false);
    }
  };

  const handleProduce = async (): Promise<void> => {
    if (isRegenerating) return;
    setIsRegenerating(true);
    onBusy(true);
    toast(strings.auditDetail.regeneratingMessage);
    try {
      await postEmpty(`/api/audits/${encodeURIComponent(auditId)}/regenerate-report`);
      toast.success(strings.auditDetail.regeneratedMessage);
      refresh();
    } catch (produceError) {
      toast.error(strings.auditDetail.actionError, {
        description: produceError instanceof Error ? produceError.message : undefined,
      });
    } finally {
      setIsRegenerating(false);
      onBusy(false);
    }
  };

  const handleApproveReports = async (): Promise<void> => {
    try {
      await postEmpty(`/api/audits/${encodeURIComponent(auditId)}/approve-reports`);
      toast.success(strings.auditDetail.reportsApprovedMessage);
      refresh();
    } catch (approveError) {
      // A 409 means an unmet precondition (no fresh verified pair yet) and
      // its message explains which; it stays as the toast's detail line.
      toast.error(strings.auditDetail.actionError, {
        description: approveError instanceof Error ? approveError.message : undefined,
      });
    }
  };

  const renderStepBody = (step: ReportStep): JSX.Element => {
    switch (step.key) {
      case 'prepare':
        return (
          <div className="flex flex-col gap-4">
            {preparation === undefined ? (
              <div className="flex flex-col gap-1">
                {preparationError !== undefined ? (
                  <p className="text-[13px] text-ink-muted">{strings.common.requestFailed}</p>
                ) : (
                  <Skeleton className="h-40" />
                )}
                <p className="text-[13px] text-ink-muted">{copy.unavailable}</p>
              </div>
            ) : (
              <PrepareReportForm ref={prepareFormRef} auditId={auditId} view={preparation} />
            )}
            {/* Anchor target of the failure card's "go to the fields"
                action: the identity gate lands on this form. */}
            <div id="audit-hotel-fields">
              <HotelFieldsForm
                ref={hotelFormRef}
                auditId={auditId}
                manualFields={detail.manualFields ?? null}
                detectedTransactionalFlow={detail.detectedTransactionalFlow}
                awaitingIdentityFields={detail.failure?.needsInputFields}
              />
            </div>
            <div className="flex justify-end">
              <Button isLoading={isSavingAll} onClick={() => void handleSaveAll()}>
                {strings.prepareReport.saveButton}
              </Button>
            </div>
          </div>
        );
      case 'redact':
        return (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-[13px] font-medium">{strings.prepareReport.warningsHeading}</h4>
              {preparation?.acknowledgementCurrent ? (
                <Badge>{strings.prepareReport.warningsConfirmedLabel}</Badge>
              ) : preparation !== undefined && preparation.preview.warnings.length > 0 ? (
                <Button variant="secondary" size="sm" onClick={() => void handleConfirmWarnings()}>
                  {strings.prepareReport.confirmWarningsButton}
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
              <h4 className="text-[13px] font-medium">{strings.prepareReport.writingHeading}</h4>
              <Button
                variant="secondary"
                size="sm"
                isLoading={isRewriting}
                onClick={() => setIsConfirmRewriteOpen(true)}
              >
                {strings.prepareReport.regenerateButton}
              </Button>
            </div>
            <div className="flex flex-col gap-1 text-[13px]">
              {selected !== undefined ? (
                <p>
                  {strings.prepareReport.selectedWritingLabel} · {selected.frAnalysisId.slice(0, 8)}{' '}
                  / {selected.enAnalysisId.slice(0, 8)}
                </p>
              ) : null}
              {candidate?.status === 'ready' ? (
                <p className="flex items-center gap-2">
                  <Badge>{strings.prepareReport.candidateReadyLabel}</Badge>
                  {candidate.pair.frAnalysisId.slice(0, 8)} /{' '}
                  {candidate.pair.enAnalysisId.slice(0, 8)}
                </p>
              ) : candidate?.status === 'failed' ? (
                <p className="text-ink-muted">
                  {strings.prepareReport.candidateFailedLabel} · {candidate.reason}
                </p>
              ) : null}
            </div>
          </div>
        );
      case 'choose':
        return (
          <div className="flex flex-col gap-2 text-[13px]">
            {candidate?.status === 'ready' ? (
              <>
                <p className="flex flex-wrap gap-3">
                  <a
                    className="underline"
                    href={`${basePath}/candidate/fr/preview`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {strings.prepareReport.candidatePreviewLabel} (FR)
                  </a>
                  <a
                    className="underline"
                    href={`${basePath}/candidate/en/preview`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {strings.prepareReport.candidatePreviewLabel} (EN)
                  </a>
                </p>
                <div>
                  <Button size="sm" onClick={() => void handleApproveCandidate()}>
                    {strings.prepareReport.approveCandidateButton}
                  </Button>
                </div>
              </>
            ) : selected !== undefined || candidate?.status === 'selected' ? (
              <p className="text-ink-muted">{strings.prepareReport.candidateSelectedLabel}</p>
            ) : null}
          </div>
        );
      case 'produce':
        return (
          <div className="flex flex-col gap-3">
            <div>
              <Button size="sm" isLoading={isRegenerating} onClick={() => void handleProduce()}>
                {copy.produceButton}
              </Button>
            </div>
            <ReportsCard detail={detail} />
          </div>
        );
      case 'approve':
        return detail.lifecycle === 'approved' ? (
          <p className="flex items-center gap-2 text-[13px] text-ink-soft">
            <Badge tone="minor">{strings.auditDetail.lifecycle.approved}</Badge>
            {strings.auditDetail.reportsApprovedMessage}
          </p>
        ) : (
          <div>
            <Button size="sm" onClick={() => setIsConfirmApproveOpen(true)}>
              {strings.auditDetail.approveReportsButton}
            </Button>
          </div>
        );
    }
  };

  return (
    <Card title={copy.heading} description={copy.description}>
      <ol className="flex flex-col gap-6">
        {steps.map((step, index) => {
          const isMuted = !step.enabled;
          return (
            <li
              key={step.key}
              id={REPORT_STEP_ANCHORS[step.key]}
              className={cn('flex gap-4', isMuted && 'opacity-50')}
            >
              <span
                className="numeric mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-line bg-raised text-xs font-medium text-ink-soft"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-ink">{copy.steps[step.key]}</h3>
                  {step.state === 'done' ? (
                    <Badge tone="minor">{copy.stepDone}</Badge>
                  ) : step.state === 'todo' ? (
                    <span className="text-xs text-ink-muted">{copy.stepTodo}</span>
                  ) : null}
                </div>
                {/* A step the ladder has not reached shows its number and
                    title only: no button, no body, nothing to click past
                    the step that gates it. */}
                {step.enabled ? <div className="mt-3">{renderStepBody(step)}</div> : null}
              </div>
            </li>
          );
        })}
      </ol>
      <ConfirmDialog
        open={isConfirmRewriteOpen}
        onOpenChange={setIsConfirmRewriteOpen}
        title={strings.prepareReport.confirmRegenerateTitle}
        description={strings.prepareReport.confirmRegenerateBody}
        confirmLabel={strings.prepareReport.regenerateButton}
        cancelLabel={strings.common.cancel}
        onConfirm={handleRewrite}
      />
      <ConfirmDialog
        open={isConfirmApproveOpen}
        onOpenChange={setIsConfirmApproveOpen}
        title={strings.auditDetail.confirmApproveTitle}
        description={strings.auditDetail.confirmApproveBody}
        confirmLabel={strings.auditDetail.approveReportsButton}
        cancelLabel={strings.common.cancel}
        onConfirm={handleApproveReports}
      />
    </Card>
  );
}
