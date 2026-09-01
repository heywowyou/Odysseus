/**
 * The Prepare report card, plan 019 step 5: one guided form for the
 * bounded operator context (situation, trigger, optional notes, custom
 * question, stakeholder names, journey confirmations), a live bilingual
 * preview of what the report will show, the typed missing-context
 * warnings with their confirmation, and the candidate-first writing
 * lifecycle (cost-warned regeneration, preview without persistence,
 * explicit approval). All persistence goes through the report-preparation
 * endpoints; the pure logic lives in prepare-report-model.ts.
 */

import { useEffect, useMemo, useState, type JSX } from 'react';
import { useI18n } from '../i18n/provider';
import type { DashboardStrings } from '../i18n/types';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Field } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { SegmentedControl } from '../components/ui/segmented';
import { ConfirmDialog } from '../components/ui/dialog';
import { Skeleton } from '../components/ui/skeleton';
import { useApi } from '../lib/use-api';
import { ApiError, sendJson } from '../lib/api';
import { toast } from 'sonner';
import {
  buildPreparationPatch,
  exclusionLabel,
  formValuesFromView,
  resolveTurnoverFormPreview,
  showsTriggerOtherNotes,
  type PreparationFormValues,
} from './prepare-report-model';
import type {
  JourneyVocab,
  ManualTurnoverSourceResponse,
  PreparationViewResponse,
  TriggerVocab,
  SituationVocab,
} from './prepare-report-types';

type PreviewLanguage = 'fr' | 'en';

function formatEur(amount: number, language: 'fr' | 'en'): string {
  return new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function situationOptions(strings: DashboardStrings): { value: SituationVocab; label: string }[] {
  return (Object.entries(strings.prepareReport.situationOptions) as [SituationVocab, string][]).map(
    ([value, label]) => ({ value, label }),
  );
}

function triggerOptions(strings: DashboardStrings): { value: TriggerVocab; label: string }[] {
  return (Object.entries(strings.prepareReport.triggerOptions) as [TriggerVocab, string][]).map(
    ([value, label]) => ({ value, label }),
  );
}

function previewSourceLabel(
  source: 'custom' | 'automatic' | 'fallback',
  strings: DashboardStrings,
): string {
  if (source === 'custom') return strings.prepareReport.previewCustomLabel;
  if (source === 'automatic') return strings.prepareReport.previewAutomaticLabel;
  return strings.prepareReport.previewFallbackLabel;
}

function PreviewPane(props: {
  view: PreparationViewResponse;
  language: PreviewLanguage;
}): JSX.Element {
  const { view, language } = props;
  const { strings } = useI18n();
  const preview = view.preview[language];
  return (
    <div className="flex flex-col gap-4 text-[13px]">
      <div>
        <p className="text-ink-muted">
          {strings.auditDetail.languageLabels[language]} ·{' '}
          <span className="text-[11px] uppercase tracking-wide">
            {previewSourceLabel(preview.coverQuestion.source, strings)}
          </span>
        </p>
        <p className="mt-1 font-medium">{preview.coverQuestion.value}</p>
      </div>
      {!preview.hook.evidenceUnavailable ? (
        <div>
          <p className="text-ink-muted">
            {strings.prepareReport.previewAutomaticLabel} · {preview.hook.family.replace(/-/g, ' ')}
          </p>
          <p className="mt-1">{preview.hook.value}</p>
        </div>
      ) : null}
      {preview.journeys.map((journey) => (
        <div key={journey.journeyId}>
          <p className="font-medium">{journey.label}</p>
          <p className="text-ink-muted">{journey.description}</p>
          <ul className="mt-1 flex flex-col gap-1">
            {journey.steps.map((step) => (
              <li key={step.stepId} className="flex justify-between gap-4">
                <span>{step.label}</span>
                <span className="text-ink-muted">{step.stateLabel}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {preview.journeys.length === 0 && preview.hook.evidenceUnavailable ? (
        <p className="text-ink-muted">{strings.prepareReport.previewFallbackLabel}</p>
      ) : null}
    </div>
  );
}

export function PrepareReportCard(props: { auditId: string }): JSX.Element {
  const { auditId } = props;
  const { language, strings } = useI18n();
  const basePath = `/api/audits/${encodeURIComponent(auditId)}/report-preparation`;
  const { data, error, refresh } = useApi<PreparationViewResponse>(basePath);

  const baseline = useMemo(() => (data ? formValuesFromView(data) : null), [data]);
  const [values, setValues] = useState<PreparationFormValues | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isConfirmRegenerateOpen, setIsConfirmRegenerateOpen] = useState(false);
  const [previewLanguage, setPreviewLanguage] = useState<PreviewLanguage>('fr');

  // Re-seed the form whenever a fresh view arrives while the form is
  // clean; a dirty form is never clobbered by a refetch (same contract as
  // the enrichment card).
  useEffect(() => {
    if (baseline !== null && !isDirty) setValues(baseline);
  }, [baseline, isDirty]);

  if (error !== undefined && data === undefined) {
    return (
      <Card title={strings.prepareReport.title}>
        <p className="text-[13px] text-ink-muted">{error}</p>
      </Card>
    );
  }
  if (data === undefined || values === null || baseline === null) {
    return (
      <Card title={strings.prepareReport.title}>
        <Skeleton className="h-40" />
      </Card>
    );
  }

  const set = (patch: Partial<PreparationFormValues>): void => {
    setIsDirty(true);
    setValues((current) => (current === null ? current : { ...current, ...patch }));
  };

  const decideJourney = (journeyId: JourneyVocab, decision: 'confirmed' | 'removed'): void => {
    setIsDirty(true);
    setValues((current) =>
      current === null
        ? current
        : { ...current, journeyDecisions: { ...current.journeyDecisions, [journeyId]: decision } },
    );
  };

  const handleSave = async (): Promise<void> => {
    const patch = buildPreparationPatch(values, baseline);
    if (Object.keys(patch).length === 0) {
      setIsDirty(false);
      toast.success(strings.prepareReport.savedMessage);
      return;
    }
    setIsSaving(true);
    try {
      await sendJson(basePath, 'PATCH', patch);
      setIsDirty(false);
      toast.success(strings.prepareReport.savedMessage);
      refresh();
    } catch (saveError) {
      toast.error(
        saveError instanceof ApiError ? saveError.message : strings.auditDetail.actionError,
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmWarnings = async (): Promise<void> => {
    try {
      await sendJson(`${basePath}/confirm-warnings`, 'POST', {});
      toast.success(strings.prepareReport.warningsConfirmedLabel);
      refresh();
    } catch (confirmError) {
      toast.error(
        confirmError instanceof ApiError ? confirmError.message : strings.auditDetail.actionError,
      );
    }
  };

  const handleRegenerate = async (): Promise<void> => {
    setIsConfirmRegenerateOpen(false);
    // UX pre-check only; the server re-verifies and is the authority.
    if (!data.acknowledgementCurrent && data.preview.warnings.length > 0) {
      toast.info(strings.prepareReport.confirmWarningsFirstHint);
      return;
    }
    setIsRegenerating(true);
    try {
      await sendJson(`${basePath}/regenerate-writing`, 'POST', { costWarningConfirmed: true });
      toast.success(strings.prepareReport.candidateReadyLabel);
      refresh();
    } catch (regenerateError) {
      toast.error(
        regenerateError instanceof ApiError
          ? regenerateError.message
          : strings.auditDetail.actionError,
      );
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleApprove = async (): Promise<void> => {
    try {
      await sendJson(`${basePath}/approve-candidate`, 'POST', {});
      toast.success(strings.prepareReport.approvedMessage);
      refresh();
    } catch (approveError) {
      toast.error(
        approveError instanceof ApiError ? approveError.message : strings.auditDetail.actionError,
      );
    }
  };

  const candidate = data.preparation.writingSelection?.candidate;
  const selected = data.preparation.writingSelection?.selected;
  const detectedTurnover = data.preparation.turnover?.detected;
  const turnoverPreview = resolveTurnoverFormPreview(values, detectedTurnover);
  const turnoverSourceOptions: { value: ManualTurnoverSourceResponse; label: string }[] = [
    {
      value: 'official-annual-accounts',
      label: strings.prepareReport.turnoverSourceOfficialAccounts,
    },
    { value: 'client-stated', label: strings.prepareReport.turnoverSourceClient },
    { value: 'other-documented', label: strings.prepareReport.turnoverSourceOther },
  ];

  return (
    <Card
      title={strings.prepareReport.title}
      description={strings.prepareReport.description}
      actions={
        <Button isLoading={isSaving} onClick={() => void handleSave()}>
          {strings.prepareReport.saveButton}
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2">
        <Field label={strings.prepareReport.situationLabel} htmlFor="prep-situation">
          <Select
            id="prep-situation"
            value={values.situation}
            onChange={(event) => set({ situation: event.target.value })}
          >
            <option value="">{strings.prepareReport.automaticOption}</option>
            {situationOptions(strings).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={strings.prepareReport.triggerLabel} htmlFor="prep-trigger">
          <Select
            id="prep-trigger"
            value={values.trigger}
            onChange={(event) => set({ trigger: event.target.value })}
          >
            <option value="">{strings.prepareReport.automaticOption}</option>
            {triggerOptions(strings).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        {showsTriggerOtherNotes(values.trigger) ? (
          <>
            <Field
              label={`${strings.prepareReport.triggerOtherNotesLabel} (${strings.prepareReport.frenchFieldLabel})`}
              htmlFor="prep-other-fr"
            >
              <Textarea
                id="prep-other-fr"
                value={values.triggerOtherFr}
                onChange={(event) => set({ triggerOtherFr: event.target.value })}
              />
            </Field>
            <Field
              label={`${strings.prepareReport.triggerOtherNotesLabel} (${strings.prepareReport.englishFieldLabel})`}
              htmlFor="prep-other-en"
            >
              <Textarea
                id="prep-other-en"
                value={values.triggerOtherEn}
                onChange={(event) => set({ triggerOtherEn: event.target.value })}
              />
            </Field>
          </>
        ) : null}
        <Field
          label={`${strings.prepareReport.customQuestionLabel} (${strings.prepareReport.frenchFieldLabel})`}
          htmlFor="prep-question-fr"
        >
          <Textarea
            id="prep-question-fr"
            value={values.customQuestionFr}
            onChange={(event) => set({ customQuestionFr: event.target.value })}
          />
        </Field>
        <Field
          label={`${strings.prepareReport.customQuestionLabel} (${strings.prepareReport.englishFieldLabel})`}
          htmlFor="prep-question-en"
        >
          <Textarea
            id="prep-question-en"
            value={values.customQuestionEn}
            onChange={(event) => set({ customQuestionEn: event.target.value })}
          />
        </Field>
      </div>

      <section className="mt-6 border-t border-line pt-5" aria-labelledby="prep-turnover-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-[65ch]">
            <h3 id="prep-turnover-heading" className="text-[13px] font-medium">
              {strings.prepareReport.turnoverHeading}
            </h3>
            <p className="mt-1 text-xs text-ink-muted">
              {strings.prepareReport.turnoverDescription}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            aria-pressed={values.turnoverUseReplacement}
            onClick={() => set({ turnoverUseReplacement: !values.turnoverUseReplacement })}
          >
            {values.turnoverUseReplacement
              ? strings.prepareReport.useOfficialTurnoverLabel
              : strings.prepareReport.useDifferentTurnoverLabel}
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 rounded-lg bg-raised px-3 py-3">
          <span className="text-xs text-ink-muted">
            {strings.prepareReport.detectedTurnoverLabel}
          </span>
          {detectedTurnover ? (
            <span className="text-[13px] font-medium tabular-nums text-ink">
              {formatEur(detectedTurnover.amountEur, language)} · {detectedTurnover.year}
            </span>
          ) : (
            <span className="text-[13px] text-ink-soft">
              {strings.prepareReport.detectedTurnoverUnavailable}
            </span>
          )}
        </div>

        {values.turnoverUseReplacement ? (
          <div className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[13px] font-medium text-ink-soft">
                {strings.prepareReport.turnoverKindLabel}
              </span>
              <SegmentedControl
                value={values.turnoverKind}
                onValueChange={(turnoverKind) => set({ turnoverKind })}
                options={[
                  { value: 'exact', label: strings.prepareReport.turnoverExactOption },
                  { value: 'range', label: strings.prepareReport.turnoverRangeOption },
                ]}
                ariaLabel={strings.prepareReport.turnoverKindLabel}
              />
            </div>

            <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
              {values.turnoverKind === 'exact' ? (
                <Field
                  label={strings.prepareReport.turnoverAmountLabel}
                  htmlFor="prep-turnover-amount"
                >
                  <Input
                    id="prep-turnover-amount"
                    type="number"
                    min="1"
                    max="1000000000000"
                    step="1"
                    inputMode="numeric"
                    value={values.turnoverAmountEur}
                    onChange={(event) => set({ turnoverAmountEur: event.target.value })}
                  />
                </Field>
              ) : (
                <>
                  <Field
                    label={strings.prepareReport.turnoverLowerLabel}
                    htmlFor="prep-turnover-lower"
                  >
                    <Input
                      id="prep-turnover-lower"
                      type="number"
                      min="1"
                      max="1000000000000"
                      step="1"
                      inputMode="numeric"
                      value={values.turnoverLowerEur}
                      onChange={(event) => set({ turnoverLowerEur: event.target.value })}
                    />
                  </Field>
                  <Field
                    label={strings.prepareReport.turnoverUpperLabel}
                    htmlFor="prep-turnover-upper"
                  >
                    <Input
                      id="prep-turnover-upper"
                      type="number"
                      min="1"
                      max="1000000000000"
                      step="1"
                      inputMode="numeric"
                      value={values.turnoverUpperEur}
                      onChange={(event) => set({ turnoverUpperEur: event.target.value })}
                    />
                  </Field>
                </>
              )}
              <Field label={strings.prepareReport.turnoverYearLabel} htmlFor="prep-turnover-year">
                <Input
                  id="prep-turnover-year"
                  type="number"
                  min="2000"
                  max="2026"
                  step="1"
                  inputMode="numeric"
                  value={values.turnoverYear}
                  onChange={(event) => set({ turnoverYear: event.target.value })}
                />
              </Field>
              <Field
                label={strings.prepareReport.turnoverSourceLabel}
                htmlFor="prep-turnover-source"
              >
                <Select
                  id="prep-turnover-source"
                  value={values.turnoverSource}
                  onChange={(event) =>
                    set({
                      turnoverSource: event.target.value as '' | ManualTurnoverSourceResponse,
                    })
                  }
                >
                  <option value="">{strings.prepareReport.automaticOption}</option>
                  {turnoverSourceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              {values.turnoverSource === 'other-documented' ? (
                <Field
                  label={strings.prepareReport.turnoverSourceNoteLabel}
                  htmlFor="prep-turnover-source-note"
                >
                  <Input
                    id="prep-turnover-source-note"
                    maxLength={120}
                    value={values.turnoverSourceNote}
                    onChange={(event) => set({ turnoverSourceNote: event.target.value })}
                  />
                </Field>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="mt-4 rounded-lg bg-accent-tint px-3 py-3" aria-live="polite">
          <p className="text-xs text-ink-muted">{strings.prepareReport.turnoverEffectiveLabel}</p>
          {turnoverPreview.status === 'available' ? (
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1">
              <p className="text-sm font-semibold tabular-nums text-ink">
                {formatEur(turnoverPreview.amountEur, language)} · {turnoverPreview.year}
              </p>
              <p className="text-xs text-ink-soft">
                {turnoverPreview.inputKind === 'range'
                  ? strings.prepareReport.turnoverRangeBasis
                  : turnoverPreview.provenance === 'detected'
                    ? strings.prepareReport.turnoverDetectedBasis
                    : strings.prepareReport.turnoverReplacementBasis}
              </p>
            </div>
          ) : (
            <p className="mt-1 text-[13px] text-ink-soft">
              {turnoverPreview.reason === 'missing-replacement'
                ? strings.prepareReport.turnoverReplacementMissing
                : strings.prepareReport.turnoverMissing}
            </p>
          )}
        </div>
      </section>

      <h3 className="mt-5 text-[13px] font-medium">{strings.prepareReport.stakeholdersHeading}</h3>
      <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
        {(
          [
            ['management', 'stakeholderManagement'],
            ['technical', 'stakeholderTechnical'],
            ['communications', 'stakeholderCommunications'],
            ['legal', 'stakeholderLegal'],
          ] as const
        ).map(([role, key]) => (
          <Field
            key={role}
            label={
              data.preview[previewLanguage].stakeholders.find((entry) => entry.role === role)
                ?.roleLabel ?? role
            }
            htmlFor={`prep-${key}`}
          >
            <Input
              id={`prep-${key}`}
              value={values[key]}
              onChange={(event) => set({ [key]: event.target.value })}
            />
          </Field>
        ))}
      </div>

      <h3 className="mt-5 text-[13px] font-medium">{strings.prepareReport.journeysHeading}</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {data.suggestions.map((suggestion) => {
          const decision = values.journeyDecisions[suggestion.journeyId];
          const reasonLabel = exclusionLabel(suggestion, strings.prepareReport);
          return (
            <li
              key={suggestion.journeyId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-raised px-3 py-2"
            >
              <div className="flex flex-col">
                <span className="text-[13px] font-medium">
                  {strings.prepareReport.journeyLabels[suggestion.journeyId]}
                </span>
                <span className="text-xs text-ink-muted">
                  {decision !== undefined
                    ? decision === 'confirmed'
                      ? strings.prepareReport.journeyConfirmedLabel
                      : strings.prepareReport.journeyRemovedLabel
                    : reasonLabel !== ''
                      ? reasonLabel
                      : ''}
                </span>
              </div>
              {suggestion.available ? (
                <div className="flex gap-2">
                  <Button
                    variant={decision === 'confirmed' ? 'secondary' : 'primary'}
                    onClick={() => decideJourney(suggestion.journeyId, 'confirmed')}
                  >
                    {strings.prepareReport.journeyConfirm}
                  </Button>
                  <Button
                    variant={decision === 'removed' ? 'secondary' : 'primary'}
                    onClick={() => decideJourney(suggestion.journeyId, 'removed')}
                  >
                    {strings.prepareReport.journeyRemove}
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <h3 className="text-[13px] font-medium">{strings.prepareReport.warningsHeading}</h3>
        {data.acknowledgementCurrent ? (
          <Badge>{strings.prepareReport.warningsConfirmedLabel}</Badge>
        ) : data.preview.warnings.length > 0 ? (
          <Button variant="secondary" onClick={() => void handleConfirmWarnings()}>
            {strings.prepareReport.confirmWarningsButton}
          </Button>
        ) : null}
      </div>
      {data.preview.warnings.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1 text-[13px] text-ink-muted">
          {data.preview.warnings.map((warning) => (
            <li key={warning}>
              {warning === 'commercial-name'
                ? strings.prepareReport.warningCommercialName
                : warning === 'situation'
                  ? strings.prepareReport.warningSituation
                  : warning === 'trigger'
                    ? strings.prepareReport.warningTrigger
                    : strings.prepareReport.warningJourneyScope}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5 border-t border-line pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[13px] font-medium">{strings.prepareReport.previewHeading}</h3>
          <SegmentedControl
            value={previewLanguage}
            onValueChange={setPreviewLanguage}
            options={[
              { value: 'fr', label: strings.auditDetail.languageLabels.fr },
              { value: 'en', label: strings.auditDetail.languageLabels.en },
            ]}
            ariaLabel={strings.prepareReport.previewHeading}
          />
        </div>
        <div className="mt-3">
          <PreviewPane view={data} language={previewLanguage} />
        </div>
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[13px] font-medium">{strings.prepareReport.writingHeading}</h3>
          <Button
            variant="secondary"
            isLoading={isRegenerating}
            onClick={() => setIsConfirmRegenerateOpen(true)}
          >
            {strings.prepareReport.regenerateButton}
          </Button>
        </div>
        <div className="mt-2 flex flex-col gap-1 text-[13px]">
          {selected ? (
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
                <Button onClick={() => void handleApprove()}>
                  {strings.prepareReport.approveCandidateButton}
                </Button>
              </p>
            </>
          ) : candidate?.status === 'failed' ? (
            <p className="text-ink-muted">
              {strings.prepareReport.candidateFailedLabel} · {candidate.reason}
            </p>
          ) : candidate?.status === 'selected' ? (
            <p className="text-ink-muted">{strings.prepareReport.candidateSelectedLabel}</p>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={isConfirmRegenerateOpen}
        onOpenChange={setIsConfirmRegenerateOpen}
        title={strings.prepareReport.confirmRegenerateTitle}
        description={strings.prepareReport.confirmRegenerateBody}
        confirmLabel={strings.prepareReport.regenerateButton}
        cancelLabel={strings.common.cancel}
        onConfirm={handleRegenerate}
      />
    </Card>
  );
}
