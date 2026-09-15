import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ChevronDown } from 'lucide-react';
import { PAGE_WIDTH, PageHeader } from '../components/page-header';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Field } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { SegmentedControl } from '../components/ui/segmented';
import { Select } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { useI18n } from '../i18n/provider';
import type { ScanCreated } from '../lib/api-types';
import { ApiError, fetchJson, sendJson } from '../lib/api';
import { cn } from '../lib/cn';
import {
  buildScanRequest,
  createEmptyFormValues,
  isValidAbsoluteHttpUrl,
  prefillUrlFromQuery,
  validateSiren,
} from './new-scan-model';
import type { NewScanFormValues, NewScanType } from './new-scan-model';
import type { ProspectHubListResponse } from './prospect-hub-model';

interface ProspectMatch {
  prospectId: string;
  name: string;
  status: string;
}

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
    prospectId: searchParams.get('prospectId')?.trim() ?? '',
  }));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [prospectMatches, setProspectMatches] = useState<ProspectMatch[]>([]);
  const [prospectSearch, setProspectSearch] = useState('');
  const [prospectSearchMatches, setProspectSearchMatches] = useState<ProspectMatch[]>([]);
  const [createProspectOpen, setCreateProspectOpen] = useState(false);
  const [newProspectName, setNewProspectName] = useState('');
  const [creatingProspect, setCreatingProspect] = useState(false);

  // Issue #187: a scan-failure card can link straight here to the crawl
  // delay / scan concurrency fields (e.g. #new-scan-delay-ms); since they
  // only exist in the DOM once the advanced section is open, a plain hash
  // link would otherwise land on the page with nothing to scroll to.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash === '') return;
    setAdvancedOpen(true);
    const frame = requestAnimationFrame(() => {
      document.getElementById(hash)?.scrollIntoView({ block: 'center' });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const isFullAudit = form.type === 'full-audit';
  const isBatchProspecting = form.type === 'prospecting';
  const sirenError = validateSiren(form.siren, copy.sirenInvalidError);
  const trimmedUrl = form.url.trim();
  const urlError =
    trimmedUrl === '' || isValidAbsoluteHttpUrl(trimmedUrl) ? null : copy.urlInvalidError;
  const showTransactionalFlowReason = form.transactionalFlow !== '';

  useEffect(() => {
    if (isBatchProspecting || !isValidAbsoluteHttpUrl(trimmedUrl)) {
      setProspectMatches([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void fetchJson<ProspectMatch[]>(
        `/api/prospects/match?domain=${encodeURIComponent(new URL(trimmedUrl).hostname)}`,
      )
        .then((matches) => {
          if (cancelled) return;
          setProspectMatches(matches);
          if (matches.length === 1) {
            setForm((previous) =>
              previous.prospectId === ''
                ? { ...previous, prospectId: matches[0]!.prospectId }
                : previous,
            );
          }
        })
        .catch(() => {
          if (!cancelled) setProspectMatches([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [form.type, isBatchProspecting, trimmedUrl]);

  useEffect(() => {
    const query = prospectSearch.trim();
    if (query === '') {
      setProspectSearchMatches([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void fetchJson<ProspectHubListResponse>(
        `/api/prospects?q=${encodeURIComponent(query)}&page=1&pageSize=20`,
      )
        .then((page) => {
          if (cancelled) return;
          setProspectSearchMatches(
            page.rows.map((row) => ({
              prospectId: row.prospectId,
              name: row.name,
              status: row.status,
            })),
          );
        })
        .catch(() => {
          if (!cancelled) setProspectSearchMatches([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [prospectSearch]);

  const availableProspectMatches = [...prospectMatches, ...prospectSearchMatches].filter(
    (match, index, matches) =>
      matches.findIndex((candidate) => candidate.prospectId === match.prospectId) === index,
  );

  const setField = <K extends keyof NewScanFormValues>(key: K, value: NewScanFormValues[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const createProspect = async (): Promise<void> => {
    const name = newProspectName.trim();
    if (name === '') return;
    setCreatingProspect(true);
    try {
      const website = isValidAbsoluteHttpUrl(trimmedUrl) ? trimmedUrl : '';
      const created = await sendJson<ProspectMatch>('/api/prospects', 'POST', {
        sector: 'hotel',
        name,
        ...(website === ''
          ? {}
          : {
              websites: [
                {
                  url: website,
                  registrableDomain: new URL(website).hostname,
                  kind: 'unknown',
                  primary: true,
                },
              ],
              fieldOrigins: { name: 'operator', websites: 'operator' },
            }),
      });
      setField('prospectId', created.prospectId);
      setProspectSearch('');
      setProspectSearchMatches([]);
      setProspectMatches([]);
      setCreateProspectOpen(false);
      toast.success(copy.prospectCreated);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : String(error);
      toast.error(copy.submitError, { description: message });
    } finally {
      setCreatingProspect(false);
    }
  };

  const submit = async (): Promise<void> => {
    setIsSubmitting(true);
    try {
      const request = buildScanRequest(form);
      const created = await sendJson<ScanCreated>('/api/scans', 'POST', request);
      navigate(`/scans/${created.jobId}`);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : String(error);
      // The technical string rides as the toast's detail line; the headline
      // stays the localized product copy.
      toast.error(copy.submitError, { description: message });
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (isSubmitting) return;
    if (!isBatchProspecting && (urlError !== null || (isFullAudit && sirenError !== null))) return;
    void submit();
  };

  return (
    <article className={PAGE_WIDTH.reading}>
      <PageHeader title={copy.title} description={copy.description} />
      <Card className="max-w-3xl">
        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <SegmentedControl<NewScanType>
            value={form.type}
            onValueChange={(type) => setField('type', type)}
            options={[
              { value: 'full-audit', label: copy.typeFullAudit },
              { value: 'quick-check', label: copy.typeQuickCheck },
              { value: 'light-audit', label: copy.typeLightAudit },
              { value: 'prospecting-audit', label: copy.typeProspectingAudit },
              { value: 'prospecting', label: copy.typeProspectingBatch },
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
          ) : isBatchProspecting ? (
            <Field label={copy.urlsLabel} htmlFor="new-scan-urls">
              <Textarea
                id="new-scan-urls"
                value={form.urls}
                onChange={(event) => setField('urls', event.target.value)}
                placeholder={copy.urlsPlaceholder}
              />
            </Field>
          ) : (
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
          )}

          {!isBatchProspecting ? (
            <Field label={copy.prospectLabel} htmlFor="new-scan-prospect-search">
              <Input
                id="new-scan-prospect-search"
                value={prospectSearch}
                onChange={(event) => setProspectSearch(event.target.value)}
                placeholder={copy.prospectSearchPlaceholder}
                aria-label={copy.prospectSearchAria}
              />
              <Select
                id="new-scan-prospect"
                value={form.prospectId}
                onChange={(event) => setField('prospectId', event.target.value)}
                aria-label={copy.prospectLabel}
              >
                <option value="">{copy.noProspectOption}</option>
                {availableProspectMatches.map((match) => (
                  <option key={match.prospectId} value={match.prospectId}>
                    {match.name}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-ink-muted">{copy.prospectMatchHint}</p>
              {prospectSearch.trim() !== '' && availableProspectMatches.length === 0 ? (
                <p className="mt-2 text-xs text-ink-muted">{copy.prospectSearchEmpty}</p>
              ) : null}
              <div className="mt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setNewProspectName((current) => current || prospectSearch.trim());
                    setCreateProspectOpen((open) => !open);
                  }}
                >
                  {copy.createProspectAction}
                </Button>
              </div>
              {createProspectOpen ? (
                <div className="mt-2 rounded-lg border border-line bg-raised p-3">
                  <p className="mb-2 text-sm font-medium text-ink">{copy.createProspectTitle}</p>
                  <div className="flex gap-2">
                    <Input
                      value={newProspectName}
                      onChange={(event) => setNewProspectName(event.target.value)}
                      placeholder={copy.createProspectNamePlaceholder}
                      aria-label={copy.createProspectNameAria}
                    />
                    <Button
                      type="button"
                      isLoading={creatingProspect}
                      disabled={newProspectName.trim() === ''}
                      onClick={() => void createProspect()}
                    >
                      {copy.createProspectSubmit}
                    </Button>
                  </div>
                </div>
              ) : null}
            </Field>
          ) : null}

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
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                    <Field
                      label={copy.delayLabel}
                      htmlFor="new-scan-delay-ms"
                      hint={copy.delayHint}
                    >
                      <Input
                        id="new-scan-delay-ms"
                        type="number"
                        min={0}
                        value={form.delayMs}
                        onChange={(event) => setField('delayMs', event.target.value)}
                      />
                    </Field>
                    <Field
                      label={copy.scanConcurrencyLabel}
                      htmlFor="new-scan-scan-concurrency"
                      hint={copy.scanConcurrencyHint}
                    >
                      <Input
                        id="new-scan-scan-concurrency"
                        type="number"
                        min={1}
                        value={form.scanConcurrency}
                        onChange={(event) => setField('scanConcurrency', event.target.value)}
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
