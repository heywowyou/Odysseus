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
  describeWritingGuardRejections,
  describeWritingWarning,
  findPanelRow,
  produceButtonState,
  reportProductionView,
  type ReportProductionView,
} from './audit-report-panel-model';
import { unconfirmedIdentityFields } from './audit-detail-model';
import type { AuditDetailResponse } from './audit-detail-types';
import { IdentityConfirmField } from './identity-confirm-field';
import { ReportDetailsForm } from './report-details-form';
import { ReportsCard } from './audit-reports-section';
import type { PreparationViewResponse } from './prepare-report-types';

/** Upper bound for report production. Normal rewriting is French-only, but
 *  a stale-data refresh and Chromium rendering can still take minutes. */
const PRODUCE_REPORT_TIMEOUT_MS = 20 * 60 * 1000;

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
  const [isGeneratingEnglish, setIsGeneratingEnglish] = useState(false);
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
  // Issue #376: the server's production state decides what is running, so
  // a refresh mid-run restores the stage; the local flags only cover the
  // moment between a click and the server's first answer.
  const production = reportProductionView(preparation?.production, language);
  const productionBusy =
    production.busy || writingInFlight || isRegenerating || isGeneratingEnglish;
  const wasInFlight = useRef(false);
  useEffect(() => {
    if (!productionBusy) return;
    const timer = setInterval(refreshPreparation, 5_000);
    return () => clearInterval(timer);
  }, [productionBusy, refreshPreparation]);
  const wasProducing = useRef(false);
  useEffect(() => {
    if (preparation === undefined) return;
    if (wasProducing.current && !production.busy) refresh();
    wasProducing.current = production.busy;
  }, [preparation, production.busy, refresh]);
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

  /** Issue #410 + Plan 067: the default run may reuse compatible French
   *  writing; `fresh` forces a new French writing pass. English has its own
   *  explicit action below and is never an implicit side effect here. */
  const handleRewrite = async (fresh = false): Promise<void> => {
    if (productionBusy) return;
    setIsRewriting(true);
    onBusy(true);
    try {
      await postEmpty(`${basePath}/regenerate-writing?async=true${fresh ? '&fresh=true' : ''}`);
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

  const handleGenerateEnglish = async (): Promise<void> => {
    if (productionBusy || selected === undefined) return;
    setIsGeneratingEnglish(true);
    onBusy(true);
    try {
      await postEmpty(`${basePath}/generate-english-version`, {
        timeoutMs: PRODUCE_REPORT_TIMEOUT_MS,
      });
      toast.success(strings.prepareReport.generateEnglishSuccess);
      refresh();
      refreshPreparation();
    } catch (englishError) {
      toast.error(strings.auditDetail.actionError, {
        description: englishError instanceof Error ? englishError.message : undefined,
      });
      refreshPreparation();
    } finally {
      setIsGeneratingEnglish(false);
      onBusy(false);
    }
  };

  const handleProduce = async (): Promise<void> => {
    if (productionBusy || !produceState.enabled) return;
    setIsRegenerating(true);
    onBusy(true);
    setProduceFailure(null);
    toast(strings.auditDetail.regeneratingMessage);
    setTimeout(refreshPreparation, 1_000);
    try {
      // Producing may first refresh stale findings and rewrite the French
      // analysis before rendering, which takes minutes, not the default request bound.
      await postEmpty(`/api/audits/${encodeURIComponent(auditId)}/regenerate-report`, {
        timeoutMs: PRODUCE_REPORT_TIMEOUT_MS,
      });
      toast.success(strings.auditDetail.regeneratedMessage);
      refresh();
      refreshPreparation();
    } catch (produceError) {
      const message = produceError instanceof Error ? produceError.message : '';
      setProduceFailure(message);
      toast.error(describeProduceFailure(message, language).heading);
      refreshPreparation();
    } finally {
      setIsRegenerating(false);
      onBusy(false);
    }
  };

  return (
    <Card title={copy.heading} description={copy.description}>
      <div className="flex flex-col gap-6">
        <ProductionStatus
          view={production}
          heading={copy.production.heading}
          technicalLabel={copy.produceFailedTechnicalLabel}
        />
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
              <Button
                variant="secondary"
                size="sm"
                isLoading={productionBusy}
                disabled={productionBusy}
                onClick={() => void handleRewrite()}
              >
                {production.busyLabel ??
                  (selected === undefined
                    ? strings.prepareReport.writeButton
                    : strings.prepareReport.regenerateButton)}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={productionBusy}
                title={strings.prepareReport.regenerateBothFreshHint}
                onClick={() => void handleRewrite(true)}
              >
                {strings.prepareReport.regenerateBothFreshButton}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={productionBusy || selected === undefined}
                isLoading={isGeneratingEnglish}
                onClick={() => void handleGenerateEnglish()}
              >
                {strings.prepareReport.generateEnglishButton}
              </Button>
            </div>
          </div>
          {writingInFlight && !production.busy ? (
            <p className="text-[13px] text-ink-muted" role="status">
              {strings.prepareReport.writingInProgress}
            </p>
          ) : null}
          <div className="flex flex-col gap-1 text-[13px]">
            {selected !== undefined ? (
              <p>
                {strings.prepareReport.selectedWritingLabel} · FR{' '}
                {selected.frAnalysisId.slice(0, 8)}
                {selected.enAnalysisId !== undefined
                  ? ` / EN ${selected.enAnalysisId.slice(0, 8)}`
                  : ''}
              </p>
            ) : null}
            {candidate !== undefined &&
            candidate.status !== 'failed' &&
            candidate.warnings !== undefined
              ? candidate.warnings.map((warning) => (
                  <p
                    key={`${warning.code}:${warning.field}`}
                    className="text-ink-muted"
                    role="status"
                  >
                    {describeWritingWarning(warning, language)}
                  </p>
                ))
              : null}
            {candidate?.status === 'failed' ? (
              <>
                <p className="text-ink-muted">
                  {strings.prepareReport.candidateFailedLabel} · {candidate.reason}
                </p>
                {/* Issue #409: the reason above carries only the last
                    attempt's message, so a run that burned three attempts on
                    three different guards used to look like a single failure.
                    Each attempt is listed, so the operator can tell a run
                    blocked on one guard from one failing a new way each
                    time. */}
                {describeWritingGuardRejections(candidate, language).map((line) => (
                  <p key={line} className="text-ink-muted">
                    {line}
                  </p>
                ))}
              </>
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
              disabled={!produceState.enabled || productionBusy}
              isLoading={productionBusy}
              onClick={() => void handleProduce()}
            >
              {production.busyLabel ?? produceState.label}
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
          linkedProspectName={detail.prospect?.name ?? null}
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

const STEP_MARK: Record<ReportProductionView['steps'][number]['state'], string> = {
  done: '✓',
  current: '•',
  pending: '',
  failed: '✕',
};

/** Issue #376: the persistent production status. Discrete stages only, no
 *  percentage: the server knows which stage runs, not how far along it is. */
function ProductionStatus(props: {
  view: ReportProductionView;
  heading: string;
  technicalLabel: string;
}): JSX.Element | null {
  const { banner, steps } = props.view;
  if (banner === null) return null;
  return (
    <section
      aria-label={props.heading}
      role={banner.tone === 'failed' ? 'alert' : 'status'}
      className="flex flex-col gap-3 rounded-md border border-line p-3 text-[13px]"
    >
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {steps.map((step, index) => (
          <li key={step.key} className="flex items-center gap-2">
            {index > 0 ? (
              <span aria-hidden="true" className="text-ink-muted">
                →
              </span>
            ) : null}
            <span
              aria-current={step.state === 'current' ? 'step' : undefined}
              className={
                step.state === 'current' || step.state === 'failed'
                  ? 'font-semibold text-ink'
                  : step.state === 'done'
                    ? 'text-ink'
                    : 'text-ink-muted'
              }
            >
              {STEP_MARK[step.state] === '' ? step.label : `${step.label} ${STEP_MARK[step.state]}`}
            </span>
          </li>
        ))}
      </ol>
      <div>
        <p className="font-semibold text-ink">{banner.title}</p>
        <p>{banner.description}</p>
      </div>
      {banner.technicalDetail !== undefined ? (
        <details className="text-xs text-ink-muted">
          <summary>{props.technicalLabel}</summary>
          <p className="mt-1 break-words font-mono">{banner.technicalDetail}</p>
        </details>
      ) : null}
    </section>
  );
}
