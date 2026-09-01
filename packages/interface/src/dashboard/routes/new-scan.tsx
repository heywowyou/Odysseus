import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ChevronDown } from 'lucide-react';
import { PageHeader } from '../components/page-header';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Field } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { SegmentedControl } from '../components/ui/segmented';
import { Select } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { useI18n } from '../i18n/provider';
import type { JobType, ScanCreated } from '../lib/api-types';
import { ApiError, sendJson } from '../lib/api';
import { cn } from '../lib/cn';
import {
  buildScanRequest,
  createEmptyFormValues,
  isValidAbsoluteHttpUrl,
  prefillUrlFromQuery,
  validateSiren,
} from './new-scan-model';
import type { NewScanFormValues } from './new-scan-model';

/** Form page replacing public/index.html + public/app-new-scan.ts. The
 *  request body construction, validation, and conditional fields are ported
 *  into new-scan-model.ts so they stay pure and tested; this component only
 *  wires state, copy, and navigation. */
export function NewScanPage() {
  const { strings } = useI18n();
  const copy = strings.newScan;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // ?url= prefill from the prospect page's launch-audit link, read once as
  // the initial state; the route boundary revalidates the submitted value.
  const [form, setForm] = useState<NewScanFormValues>(() => ({
    ...createEmptyFormValues(),
    url: prefillUrlFromQuery(searchParams.get('url')),
  }));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isFullAudit = form.type === 'full-audit';
  const sirenError = validateSiren(form.siren, copy.sirenInvalidError);
  const trimmedUrl = form.url.trim();
  const urlError =
    trimmedUrl === '' || isValidAbsoluteHttpUrl(trimmedUrl) ? null : copy.urlInvalidError;
  const showTransactionalFlowReason = form.transactionalFlow !== '';

  const setField = <K extends keyof NewScanFormValues>(key: K, value: NewScanFormValues[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const submit = async (): Promise<void> => {
    setIsSubmitting(true);
    try {
      const request = buildScanRequest(form);
      const created = await sendJson<ScanCreated>('/api/scans', 'POST', request);
      navigate(`/scans/${created.jobId}`);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : String(error);
      toast.error(`${copy.submitError}: ${message}`);
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (isSubmitting) return;
    if (isFullAudit && (urlError !== null || sirenError !== null)) return;
    void submit();
  };

  return (
    <article>
      <PageHeader title={copy.title} description={copy.description} />
      <Card className="max-w-3xl">
        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <SegmentedControl<JobType>
            value={form.type}
            onValueChange={(type) => setField('type', type)}
            options={[
              { value: 'full-audit', label: copy.typeFullAudit },
              { value: 'prospecting', label: copy.typeProspecting },
            ]}
            ariaLabel={copy.typeLabel}
          />

          {isFullAudit ? (
            <>
              <Field
                label={copy.urlLabel}
                htmlFor="new-scan-url"
                {...(urlError !== null ? { error: urlError } : {})}
              >
                <Input
                  id="new-scan-url"
                  type="url"
                  required
                  value={form.url}
                  onChange={(event) => setField('url', event.target.value)}
                  placeholder={copy.urlPlaceholder}
                />
              </Field>
              <Field
                label={copy.sirenLabel}
                htmlFor="new-scan-siren"
                hint={copy.sirenHint}
                {...(sirenError !== null ? { error: sirenError } : {})}
              >
                <Input
                  id="new-scan-siren"
                  type="text"
                  inputMode="numeric"
                  value={form.siren}
                  onChange={(event) => setField('siren', event.target.value)}
                  placeholder={copy.sirenPlaceholder}
                />
              </Field>
              <Field label={copy.transactionalFlowLabel} htmlFor="new-scan-transactional-flow">
                <Select
                  id="new-scan-transactional-flow"
                  value={form.transactionalFlow}
                  onChange={(event) =>
                    setField(
                      'transactionalFlow',
                      event.target.value as NewScanFormValues['transactionalFlow'],
                    )
                  }
                >
                  <option value="">{copy.transactionalFlowAutoOption}</option>
                  <option value="true">{copy.transactionalFlowYesOption}</option>
                  <option value="false">{copy.transactionalFlowNoOption}</option>
                </Select>
              </Field>
              {showTransactionalFlowReason ? (
                <Field
                  label={copy.transactionalFlowReasonLabel}
                  htmlFor="new-scan-transactional-flow-reason"
                >
                  <Input
                    id="new-scan-transactional-flow-reason"
                    type="text"
                    value={form.transactionalFlowReason}
                    onChange={(event) => setField('transactionalFlowReason', event.target.value)}
                    placeholder={copy.transactionalFlowReasonPlaceholder}
                  />
                </Field>
              ) : null}
            </>
          ) : (
            <Field label={copy.urlsLabel} htmlFor="new-scan-urls">
              <Textarea
                id="new-scan-urls"
                value={form.urls}
                onChange={(event) => setField('urls', event.target.value)}
                placeholder={copy.urlsPlaceholder}
              />
            </Field>
          )}

          {isFullAudit ? (
            <div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAdvancedOpen((open) => !open)}
                aria-expanded={advancedOpen}
              >
                <ChevronDown
                  className={cn('size-4 transition-transform', advancedOpen && 'rotate-180')}
                  aria-hidden="true"
                />
                {copy.advancedOptions}
              </Button>
              {advancedOpen ? (
                <div className="mt-4 flex flex-col gap-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <Field
                      label={copy.maxPagesLabel}
                      htmlFor="new-scan-max-pages"
                      hint={copy.maxPagesHint}
                    >
                      <Input
                        id="new-scan-max-pages"
                        type="number"
                        min={1}
                        value={form.maxPages}
                        onChange={(event) => setField('maxPages', event.target.value)}
                      />
                    </Field>
                    <Field label={copy.maxDepthLabel} htmlFor="new-scan-max-depth">
                      <Input
                        id="new-scan-max-depth"
                        type="number"
                        min={0}
                        value={form.maxDepth}
                        onChange={(event) => setField('maxDepth', event.target.value)}
                      />
                    </Field>
                    <Field label={copy.delayLabel} htmlFor="new-scan-delay-ms">
                      <Input
                        id="new-scan-delay-ms"
                        type="number"
                        min={0}
                        value={form.delayMs}
                        onChange={(event) => setField('delayMs', event.target.value)}
                      />
                    </Field>
                  </div>
                  <Field label={copy.seedsLabel} htmlFor="new-scan-seeds">
                    <Textarea
                      id="new-scan-seeds"
                      value={form.seeds}
                      onChange={(event) => setField('seeds', event.target.value)}
                      placeholder={copy.seedsPlaceholder}
                    />
                  </Field>
                  <Field label={copy.exclusionsLabel} htmlFor="new-scan-exclusions">
                    <Textarea
                      id="new-scan-exclusions"
                      value={form.exclusions}
                      onChange={(event) => setField('exclusions', event.target.value)}
                      placeholder={copy.exclusionsPlaceholder}
                    />
                  </Field>
                  <Field label={copy.bookingEngineUrlLabel} htmlFor="new-scan-booking-engine-url">
                    <Input
                      id="new-scan-booking-engine-url"
                      type="text"
                      value={form.bookingEngineUrl}
                      onChange={(event) => setField('bookingEngineUrl', event.target.value)}
                      placeholder={copy.bookingEngineUrlPlaceholder}
                    />
                  </Field>
                </div>
              ) : null}
            </div>
          ) : null}

          <Button type="submit" className="w-full" isLoading={isSubmitting}>
            {copy.submitButton}
          </Button>
        </form>
      </Card>
    </article>
  );
}
