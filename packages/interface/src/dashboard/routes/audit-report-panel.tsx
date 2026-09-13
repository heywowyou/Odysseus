/**
 * The audit report panel (plan 045 stage 3.1): replaces the five-step
 * ladder (audit-report-stepper.tsx) with one Report panel whose every
 * action stays visible - greyed with an inline reason when it is not
 * available yet, never hidden. The panel owns every write action; the
 * optional preparation inputs and non-identity hotel fields moved out to
 * the collapsed report-details-form.tsx, which never gates anything here.
 */

import { useState } from 'react';
import type { JSX } from 'react';
import { toast } from 'sonner';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { useI18n } from '../i18n/provider';
import { postEmpty } from '../lib/api';
import { useApi } from '../lib/use-api';
import { auditReportPanelRows, findPanelRow, produceButtonState } from './audit-report-panel-model';
import { unconfirmedIdentityFields } from './audit-detail-model';
import type { AuditDetailResponse } from './audit-detail-types';
import { IdentityConfirmField } from './identity-confirm-field';
import { ReportDetailsForm } from './report-details-form';
import { ReportsCard } from './audit-reports-section';
import type { PreparationViewResponse, RegenerateWritingResponse } from './prepare-report-types';

/** DOM ids the failure card (audit-reports-section.tsx) scrolls to when it
 *  names which action to redo; kept in sync with that file's own literal
 *  ids rather than shared, since exporting them for a single caller in a
 *  different file was itself dead weight fallow flagged. */
const AUDIT_PANEL_ANCHORS = {
  identity: 'audit-hotel-fields',
  writing: 'audit-panel-writing',
  produce: 'audit-panel-produce',
} as const;

export function AuditReportPanel(props: {
  auditId: string;
  detail: AuditDetailResponse;
  /** Signals the page that one of this panel's writes is in flight, so the
   *  detail page can poll until it lands (plan 040 poll policy). */
  onBusy: (active: boolean) => void;
  /** Refetches the audit detail after an action changed server state. */
  refresh: () => void;
}): JSX.Element {
  const { auditId, detail, onBusy, refresh } = props;
  const { language, strings } = useI18n();
  const copy = strings.auditDetail.panel;
  const basePath = `/api/audits/${encodeURIComponent(auditId)}/report-preparation`;
  const {
    data: preparation,
    error: preparationError,
    refresh: refreshPreparation,
  } = useApi<PreparationViewResponse>(basePath);

  const [isRewriting, setIsRewriting] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const candidate = preparation?.preparation.writingSelection?.candidate;
  const selected = preparation?.preparation.writingSelection?.selected;
  const pendingIdentityFields = unconfirmedIdentityFields(detail.manualFields);

  const rows = auditReportPanelRows(
    {
      findingsStale: detail.findingsStale,
      hasUnconfirmedIdentityFields: pendingIdentityFields.length > 0,
      analysisPair: detail.analysisPair,
      lifecycle: detail.lifecycle,
    },
    language,
  );
  const findingsRow = findPanelRow(rows, 'findings');
  const identityRow = findPanelRow(rows, 'identity');
  const produceRow = findPanelRow(rows, 'produce');
  const produceState = produceButtonState(produceRow, detail.findingsStale, language);

  const handleAfterSave = (): void => {
    refreshPreparation();
    refresh();
  };

  const handleConfirmWarnings = async (): Promise<void> => {
    onBusy(true);
    try {
      await postEmpty(`${basePath}/confirm-warnings`);
      toast.success(strings.prepareReport.warningsConfirmedLabel);
      handleAfterSave();
    } catch (confirmError) {
      toast.error(strings.auditDetail.actionError, {
        description: confirmError instanceof Error ? confirmError.message : undefined,
      });
    } finally {
      onBusy(false);
    }
  };

  // Plan 045 section 2.1: regeneration approves and renders automatically,
  // so this single call replaces the old rewrite-then-approve pair, and no
  // confirm dialog gates it any more (2.4) - it is already the explicit
  // operator action that replaces the current version. Never gated: a
  // missing-context warning and an unconfirmed identity field are both
  // informational here, not preconditions to writing.
  const handleRewrite = async (): Promise<void> => {
    setIsRewriting(true);
    onBusy(true);
    try {
      const result = await postEmpty<RegenerateWritingResponse>(`${basePath}/regenerate-writing`);
      if (result.replacedApprovedSelection) {
        toast.info(strings.prepareReport.writingReplacedDeliveredMessage);
      }
      if (result.pdfs.kind === 'generated') {
        toast.success(strings.prepareReport.writingRegeneratedMessage);
      } else {
        toast.success(strings.prepareReport.writingApprovedPdfsPendingMessage, {
          description: result.pdfs.reason,
        });
      }
      handleAfterSave();
    } catch (rewriteError) {
      toast.error(strings.auditDetail.actionError, {
        description: rewriteError instanceof Error ? rewriteError.message : undefined,
      });
    } finally {
      setIsRewriting(false);
      onBusy(false);
    }
  };

  // Kept for a candidate left in 'ready' state by a pre-2.1 run; every
  // regeneration from this build already approves inline. Goes away with
  // the rest of this fallback in stage 3.4, alongside the server route.
  const handleApproveCandidate = async (): Promise<void> => {
    onBusy(true);
    try {
      await postEmpty(`${basePath}/approve-candidate`);
      toast.success(strings.prepareReport.approvedMessage);
      handleAfterSave();
    } catch (approveError) {
      toast.error(strings.auditDetail.actionError, {
        description: approveError instanceof Error ? approveError.message : undefined,
      });
    } finally {
      onBusy(false);
    }
  };

  const handleProduce = async (): Promise<void> => {
    if (isRegenerating || !produceState.enabled) return;
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

  return (
    <Card title={copy.heading} description={copy.description}>
      <div className="flex flex-col gap-6">
        <section id={AUDIT_PANEL_ANCHORS.identity}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-ink">{copy.identityHeading}</h3>
            {identityRow.status === 'done' ? <Badge tone="minor">{copy.doneLabel}</Badge> : null}
          </div>
          {pendingIdentityFields.length > 0 ? (
            <div className="mt-3 flex flex-col gap-3">
              {pendingIdentityFields.map((entry) => (
                <IdentityConfirmField
                  key={entry.field}
                  auditId={auditId}
                  field={entry.field}
                  detectedValue={entry.value}
                  onConfirmed={handleAfterSave}
                />
              ))}
            </div>
          ) : null}
        </section>

        <section
          id={AUDIT_PANEL_ANCHORS.writing}
          className="flex flex-col gap-3 border-t border-line pt-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink">{copy.writingHeading}</h3>
            <div className="flex flex-wrap items-center gap-2">
              {preparation?.acknowledgementCurrent ? (
                <Badge tone="minor">{strings.prepareReport.warningsConfirmedLabel}</Badge>
              ) : preparation !== undefined && preparation.preview.warnings.length > 0 ? (
                <Button variant="secondary" size="sm" onClick={() => void handleConfirmWarnings()}>
                  {strings.prepareReport.confirmWarningsButton}
                </Button>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                isLoading={isRewriting}
                onClick={() => void handleRewrite()}
              >
                {strings.prepareReport.regenerateButton}
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1 text-[13px]">
            {selected !== undefined ? (
              <p>
                {strings.prepareReport.selectedWritingLabel} · {selected.frAnalysisId.slice(0, 8)} /{' '}
                {selected.enAnalysisId.slice(0, 8)}
              </p>
            ) : null}
            {candidate?.status === 'ready' ? (
              <>
                <p className="flex items-center gap-2">
                  <Badge>{strings.prepareReport.candidateReadyLabel}</Badge>
                  {candidate.pair.frAnalysisId.slice(0, 8)} /{' '}
                  {candidate.pair.enAnalysisId.slice(0, 8)}
                </p>
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
            ) : candidate?.status === 'failed' ? (
              <p className="text-ink-muted">
                {strings.prepareReport.candidateFailedLabel} · {candidate.reason}
              </p>
            ) : null}
          </div>
        </section>

        <section
          id={AUDIT_PANEL_ANCHORS.produce}
          className="flex flex-col gap-2 border-t border-line pt-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-ink">{copy.produceHeading}</h3>
            <Badge tone={findingsRow.status === 'done' ? 'minor' : 'moderate'}>
              {findingsRow.status === 'done' ? copy.findingsFreshLabel : copy.findingsStaleLabel}
            </Badge>
          </div>
          <div>
            <Button
              size="sm"
              disabled={!produceState.enabled}
              isLoading={isRegenerating}
              onClick={() => void handleProduce()}
            >
              {produceState.label}
            </Button>
          </div>
          {!produceState.enabled ? (
            <p className="text-xs text-ink-muted">{produceRow.disabledReason}</p>
          ) : produceState.hint !== undefined ? (
            <p className="text-xs text-ink-muted">{produceState.hint}</p>
          ) : null}
        </section>

        <section className="border-t border-line pt-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">{copy.deliveryHeading}</h3>
          <ReportsCard detail={detail} onApproved={refresh} />
        </section>
      </div>

      <div className="mt-6">
        <ReportDetailsForm
          auditId={auditId}
          manualFields={detail.manualFields}
          detectedTransactionalFlow={detail.detectedTransactionalFlow}
          preparation={preparation}
          preparationError={preparationError}
          onSaved={handleAfterSave}
        />
      </div>
    </Card>
  );
}
