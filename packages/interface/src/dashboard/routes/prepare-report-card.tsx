/**
 * The preparation form of the client-report stepper's Prepare step
 * (plan 019 step 5, restructured by plan 040 slice 5): the optional custom
 * cover question, a live bilingual preview of what the report will show,
 * and the typed missing-context warnings. The form owns no button: the
 * stepper's single Enregistrer calls save() through a ref. All persistence goes
 * through the report-preparation endpoints; the pure logic lives in
 * prepare-report-model.ts. The preparation view itself is fetched once by
 * the stepper and passed down, so every step reads the same data.
 */

import { useEffect, forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { useI18n } from '../i18n/provider';
import type { DashboardStrings } from '../i18n/types';
import { Card } from '../components/ui/card';
import { Field } from '../components/ui/field';
import { Textarea } from '../components/ui/textarea';
import { SegmentedControl } from '../components/ui/segmented';
import { sendJson } from '../lib/api';
import { toast } from 'sonner';
import {
  buildPreparationPatch,
  formValuesFromView,
  type PreparationFormValues,
} from './prepare-report-model';
import type { PreparationViewResponse } from './prepare-report-types';

type PreviewLanguage = 'fr' | 'en';

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
    const { strings } = useI18n();
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

    return (
      <Card title={strings.prepareReport.title} description={strings.prepareReport.description}>
        <div className="grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2">
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

        {/* Purely informational: a missing-context warning never blocks
            writing regeneration (plan 045 section 2.2), so nothing here
            gates anything else on the panel, and nothing shows without one. */}
        {view.preview.warnings.length > 0 ? (
          <div className="mt-5 border-t border-line pt-4">
            <h3 className="text-[13px] font-medium">{strings.prepareReport.warningsHeading}</h3>
            <ul className="mt-2 flex flex-col gap-1 text-[13px] text-ink-muted">
              {view.preview.warnings.map((warning) => (
                <li key={warning}>{strings.prepareReport.warningCommercialName}</li>
              ))}
            </ul>
          </div>
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
