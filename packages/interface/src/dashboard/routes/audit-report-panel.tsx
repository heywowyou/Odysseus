/**
 * The audit report panel (plan 045 stage 3.1): replaces the five-step
 * ladder (audit-report-stepper.tsx) with one Report panel whose every
 * action stays visible - greyed with an inline reason when it is not
 * available yet, never hidden. The panel owns every write action; the
 * optional preparation inputs and non-identity hotel fields moved out to
 * the collapsed report-details-form.tsx, which never gates anything here.
 */

import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { toast } from 'sonner';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { useI18n } from '../i18n/provider';
import { postEmpty } from '../lib/api';
import { useApi } from '../lib/use-api';
import {
  auditReportPanelRows,
  describeProduceFailure,
  findPanelRow,
  produceButtonState,
} from './audit-report-panel-model';
import { unconfirmedIdentityFields } from './audit-detail-model';
import type { AuditDetailResponse } from './audit-detail-types';
import { IdentityConfirmField } from './identity-confirm-field';
import { ReportDetailsForm } from './report-details-form';
import { ReportsCard } from './audit-reports-section';
import type { PreparationViewResponse } from './prepare-report-types';

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
  // Kept until dismissed or the next attempt: a toast alone vanished before
  // the operator could read why the PDFs were refused.
  const [produceFailure, setProduceFailure] = useState<string | null>(null);

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

  // Plan 045 section 2.1: regeneration approves and renders automatically,
  // so this single call replaces the old rewrite-then-approve pair, and no
  // confirm dialog gates it any more (2.4) - it is already the explicit
  // operator action that replaces the current version. Never gated: a
  // missing-context warning and an unconfirmed identity field are both
  // informational here, not preconditions to writing.
  // Issue #281: writing runs as tracked background work. The panel polls
  // the preparation view while the server reports a run in flight, keeps
  // the launch disabled, and refreshes the page once the run has ended.
  const writingInFlight = isRewriting || preparation?.regenerationInFlight === true;
  const wasInFlight = useRef(false);
  useEffect(() => {
    if (!writingInFlight) return;
    const timer = setInterval(refreshPreparation, 5_000);
    return () => clearInterval(timer);
  }, [writingInFlight, refreshPreparation]);
  useEffect(() => {
    const running = preparation?.regenerationInFlight === true;
    if (wasInFlight.current && !running) {
      const outcome = preparation?.lastWritingRun;
      if (outcome?.status === 'failed') {
        toast.error(strings.auditDetail.actionError, { description: outcome.message });
      } else if (outcome?.status === 'succeeded' && outcome.pdfsGenerated) {
        toast.success(strings.prepareReport.writingRegeneratedMessage);
      } else if (outcome?.status === 'succeeded') {
        toast.success(strings.prepareReport.writingApprovedPdfsPendingMessage, {
          description: outcome.pdfsRefusedReason,
        });
      }
      refresh();
      onBusy(false);
    }
    wasInFlight.current = running;
  }, [preparation, refresh, onBusy, strings]);

  const handleRewrite = async (): Promise<void> => {
    if (writingInFlight) return;
    setIsRewriting(true);
    onBusy(true);
    try {
      await postEmpty(`${basePath}/regenerate-writing?async=true`);
      wasInFlight.current = true;
      refreshPreparation();
    } catch (rewriteError) {
      onBusy(false);
      toast.error(strings.auditDetail.actionError, {
        description: rewriteError instanceof Error ? rewriteError.message : undefined,
      });
    } finally {
      setIsRewriting(false);
    }
  };

  const handleProduce = async (): Promise<void> => {
    if (isRegenerating || !produceState.enabled) return;
    setIsRegenerating(true);
    onBusy(true);
    setProduceFailure(null);
    toast(strings.auditDetail.regeneratingMessage);
    try {
      await postEmpty(`/api/audits/${encodeURIComponent(auditId)}/regenerate-report`);
      toast.success(strings.auditDetail.regeneratedMessage);
      refresh();
    } catch (produceError) {
      const message = produceError instanceof Error ? produceError.message : '';
      setProduceFailure(message);
      toast.error(describeProduceFailure(message, language).heading);
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
            <Button
              variant="secondary"
              size="sm"
              isLoading={writingInFlight}
              disabled={writingInFlight}
              onClick={() => void handleRewrite()}
            >
              {selected === undefined
                ? strings.prepareReport.writeButton
                : strings.prepareReport.regenerateButton}
            </Button>
          </div>
          {writingInFlight ? (
            <p className="text-[13px] text-ink-muted" role="status">
              {strings.prepareReport.writingInProgress}
            </p>
          ) : null}
          <div className="flex flex-col gap-1 text-[13px]">
            {selected !== undefined ? (
              <p>
                {strings.prepareReport.selectedWritingLabel} · {selected.frAnalysisId.slice(0, 8)} /{' '}
                {selected.enAnalysisId.slice(0, 8)}
              </p>
            ) : null}
            {candidate?.status === 'failed' ? (
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
          {produceFailure !== null ? (
            <ProduceFailureNotice
              failure={describeProduceFailure(produceFailure, language)}
              technicalLabel={copy.produceFailedTechnicalLabel}
              dismissLabel={copy.produceFailedDismiss}
              onDismiss={() => setProduceFailure(null)}
            />
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

function ProduceFailureNotice(props: {
  failure: ReturnType<typeof describeProduceFailure>;
  technicalLabel: string;
  dismissLabel: string;
  onDismiss: () => void;
}): JSX.Element {
  const { failure } = props;
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-md border border-line p-3 text-[13px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-ink">{failure.heading}</p>
        <Button variant="secondary" size="sm" onClick={props.onDismiss}>
          {props.dismissLabel}
        </Button>
      </div>
      <p>{failure.explanation}</p>
      {failure.technicalDetail !== undefined ? (
        <details className="text-xs text-ink-muted">
          <summary>{props.technicalLabel}</summary>
          <p className="mt-1 break-words font-mono">{failure.technicalDetail}</p>
        </details>
      ) : null}
    </div>
  );
}
