/**
 * The preparation form of the client-report stepper's Prepare step
 * (plan 019 step 5, restructured by plan 040 slice 5): one guided form for
 * the bounded operator context (situation, trigger, optional notes, custom
 * question, stakeholder names, journey confirmations), a live bilingual
 * preview of what the report will show, and the typed missing-context
 * warnings. The form owns no button: the stepper's single Enregistrer
 * calls save() through a ref, and the warnings confirmation moved to the
 * stepper's Write step, which is what it gates. All persistence goes
 * through the report-preparation endpoints; the pure logic lives in
 * prepare-report-model.ts. The preparation view itself is fetched once by
 * the stepper and passed down, so every step reads the same data.
 */

import { useEffect, forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { useI18n } from '../i18n/provider';
import type { DashboardStrings } from '../i18n/types';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Field } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { SegmentedControl } from '../components/ui/segmented';
import { sendJson } from '../lib/api';
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

export interface PrepareReportFormHandle {
  /** PATCHes the changed preparation choices; resolves true when the
   *  stored state is correct afterwards (saved, or nothing had changed).
   *  Request errors toast inside, so the caller owes only the one success
   *  toast for the whole step. */
  save: () => Promise<boolean>;
}

interface PrepareReportFormProps {
  auditId: string;
  view: PreparationViewResponse;
}

export const PrepareReportForm = forwardRef<PrepareReportFormHandle, PrepareReportFormProps>(
  function PrepareReportForm({ auditId, view }, ref): JSX.Element {
    const { language, strings } = useI18n();
    const basePath = `/api/audits/${encodeURIComponent(auditId)}/report-preparation`;
    const baseline = useMemo(() => formValuesFromView(view), [view]);
    const [values, setValues] = useState<PreparationFormValues>(baseline);
    const [isDirty, setIsDirty] = useState(false);
    const [previewLanguage, setPreviewLanguage] = useState<PreviewLanguage>('fr');

    // Re-seed the form whenever a fresh view arrives while the form is
    // clean; a dirty form is never clobbered by a refetch (same contract
    // as the hotel-information form beside it).
    useEffect(() => {
      if (!isDirty) setValues(baseline);
    }, [baseline, isDirty]);

    useImperativeHandle(ref, () => ({
      save: async (): Promise<boolean> => {
        const patch = buildPreparationPatch(values, baseline);
        if (Object.keys(patch).length === 0) {
          // Nothing changed server-side; saving anyway would only churn
          // the row's updatedAt.
          setIsDirty(false);
          return true;
        }
        try {
          await sendJson(basePath, 'PATCH', patch);
          setIsDirty(false);
          return true;
        } catch (saveError) {
          toast.error(strings.auditDetail.actionError, {
            description: saveError instanceof Error ? saveError.message : undefined,
          });
          return false;
        }
      },
    }));

    const set = (patch: Partial<PreparationFormValues>): void => {
      setIsDirty(true);
      setValues((current) => ({ ...current, ...patch }));
    };

    const decideJourney = (journeyId: JourneyVocab, decision: 'confirmed' | 'removed'): void => {
      setIsDirty(true);
      setValues((current) => ({
        ...current,
        journeyDecisions: { ...current.journeyDecisions, [journeyId]: decision },
      }));
    };

    const detectedTurnover = view.preparation.turnover?.detected;
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
      <Card title={strings.prepareReport.title} description={strings.prepareReport.description}>
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
              <span className="numeric text-[13px] font-medium text-ink">
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
                <p className="numeric text-sm font-semibold text-ink">
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

        <h3 className="mt-5 text-[13px] font-medium">
          {strings.prepareReport.stakeholdersHeading}
        </h3>
        <div className="mt-2 grid max-w-reading grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
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
              /* The field label is dashboard chrome, so it follows the operator's
                 own language. It used to come from the preview being previewed,
                 which made it flip language with the preview selector and fall
                 back to the raw English role key when the preview had no entry. */
              label={strings.labels.stakeholderRole[role]}
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
          {view.suggestions.map((suggestion) => {
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

        {/* Purely informational: a missing-context warning never blocks
            writing regeneration (plan 045 section 2.2), so nothing here
            gates anything else on the panel. */}
        <div className="mt-5 border-t border-line pt-4">
          <h3 className="text-[13px] font-medium">{strings.prepareReport.warningsHeading}</h3>
        </div>
        {view.preview.warnings.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1 text-[13px] text-ink-muted">
            {view.preview.warnings.map((warning) => (
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
            <PreviewPane view={view} language={previewLanguage} />
          </div>
        </div>
      </Card>
    );
  },
);
