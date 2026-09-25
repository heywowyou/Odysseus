import { useEffect, useRef, useState } from 'react';
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
  ADVANCED_SCAN_FIELDS,
  buildScanRequest,
  createEmptyFormValues,
  initialScanTypeFromQuery,
  isValidAbsoluteHttpUrl,
  normalizeScanUrl,
  NEW_SCAN_TYPES,
  prefillUrlFromQuery,
  validateSiren,
} from './new-scan-model';
import type { AdvancedScanField, NewScanFormValues, NewScanType } from './new-scan-model';
import type { ProspectHubListResponse } from './prospect-hub-model';

interface ScanEstimate {
  available: boolean;
  pageCount?: number;
  estimatedMs?: number;
}

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
  const scanTypeLabels: Record<NewScanType, string> = {
    'full-audit': copy.typeFullAudit,
    'quick-check': copy.typeQuickCheck,
  };
  const scanTypeHints: Record<NewScanType, string> = {
    'full-audit': copy.typeFullAuditHint,
    'quick-check': copy.typeQuickCheckHint,
  };
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // ?url= prefill from the prospect page's launch-audit link, read once as
  // the initial state; the route boundary revalidates the submitted value.
  const [form, setForm] = useState<NewScanFormValues>(() => ({
    ...createEmptyFormValues(),
    type: initialScanTypeFromQuery(searchParams.get('type')),
    url: prefillUrlFromQuery(searchParams.get('url')),
    prospectId: searchParams.get('prospectId')?.trim() ?? '',
    delaySeconds: searchParams.get('delaySeconds') ?? '',
    scanConcurrency: searchParams.get('scanConcurrency') ?? '',
  }));
  const autoAttachedProspectId = useRef<string | undefined>(undefined);
  const normalizedHost = (url: string): string | undefined => {
    if (!isValidAbsoluteHttpUrl(url)) return undefined;
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return undefined;
    }
  };
  const currentHostname = normalizedHost(form.url);
  const previousHostname = useRef(currentHostname);
  useEffect(() => {
    if (previousHostname.current === currentHostname) return;
    previousHostname.current = currentHostname;
    const autoAttached = autoAttachedProspectId.current;
    autoAttachedProspectId.current = undefined;
    if (autoAttached !== undefined) {
      setForm((current) =>
        current.prospectId === autoAttached ? { ...current, prospectId: '' } : current,
      );
    }
  }, [currentHostname]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [prospectMatches, setProspectMatches] = useState<ProspectMatch[]>([]);
  const [scanEstimate, setScanEstimate] = useState<ScanEstimate | undefined>();
  const [prospectSearch, setProspectSearch] = useState('');
  const [prospectSearchMatches, setProspectSearchMatches] = useState<ProspectMatch[]>([]);
  const [createProspectOpen, setCreateProspectOpen] = useState(false);
  const [newProspectName, setNewProspectName] = useState('');
  const [creatingProspect, setCreatingProspect] = useState(false);

  // Issue #187: a scan-failure card can link straight here to the crawl
  // delay / scan concurrency fields (e.g. #new-scan-delay-seconds); since they
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
  const offersField = (field: AdvancedScanField): boolean =>
    ADVANCED_SCAN_FIELDS[form.type].includes(field);
  const sirenError = validateSiren(form.siren, copy.sirenInvalidError);
  const trimmedUrl = normalizeScanUrl(form.url);
  // Shown under the field when a bare domain was completed, so the operator
  // sees the exact address that will be scanned before launching.
  const normalizedUrlHint =
    trimmedUrl !== form.url.trim() && isValidAbsoluteHttpUrl(trimmedUrl)
      ? copy.urlNormalizedHint.replace('{url}', trimmedUrl)
      : undefined;
  const urlError =
    trimmedUrl === '' || isValidAbsoluteHttpUrl(trimmedUrl) ? null : copy.urlInvalidError;
  const showTransactionalFlowReason = form.transactionalFlow !== '';
  const estimateHours =
    scanEstimate?.available === true && scanEstimate.estimatedMs !== undefined
      ? new Intl.NumberFormat(
          typeof document !== 'undefined' &&
            document.documentElement.lang.toLowerCase().startsWith('fr')
            ? 'fr-FR'
            : 'en-GB',
          { maximumFractionDigits: 1 },
        ).format(scanEstimate.estimatedMs / 3_600_000)
      : undefined;

  useEffect(() => {
    setScanEstimate(undefined);
    if (!isFullAudit || !isValidAbsoluteHttpUrl(trimmedUrl)) return;
    let cancelled = false;
    const delayMs = Number(form.delaySeconds) * 1000;
    const params = new URLSearchParams({ url: trimmedUrl });
    if (Number.isFinite(delayMs) && delayMs > 0) params.set('delayMs', String(delayMs));
    const timer = window.setTimeout(() => {
      void fetchJson<ScanEstimate>(`/api/scans/estimate?${params.toString()}`)
        .then((estimate) => {
          if (!cancelled) setScanEstimate(estimate.available ? estimate : undefined);
        })
        .catch(() => {
          if (!cancelled) setScanEstimate(undefined);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [form.delaySeconds, isFullAudit, trimmedUrl]);

  useEffect(() => {
    if (!isValidAbsoluteHttpUrl(trimmedUrl)) {
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
            setForm((previous) => {
              if (previous.prospectId !== '') return previous;
              autoAttachedProspectId.current = matches[0]!.prospectId;
              return { ...previous, prospectId: matches[0]!.prospectId };
            });
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
  }, [trimmedUrl]);

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
      void navigate(`/scans/${created.jobId}`);
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
    if (urlError !== null || (isFullAudit && sirenError !== null)) return;
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
            options={NEW_SCAN_TYPES.map((type) => ({ value: type, label: scanTypeLabels[type] }))}
            ariaLabel={copy.typeLabel}
          />
          <p className="-mt-3 text-sm text-ink-muted">{scanTypeHints[form.type]}</p>

          {isFullAudit ? (
            <>
              <Field
                label={copy.urlLabel}
                htmlFor="new-scan-url"
                {...(urlError !== null ? { error: urlError } : {})}
                {...(normalizedUrlHint !== undefined ? { hint: normalizedUrlHint } : {})}
              >
                <Input
                  id="new-scan-url"
                  type="text"
                  inputMode="url"
                  required
                  value={form.url}
                  onChange={(event) => setField('url', event.target.value)}
                  placeholder={copy.urlPlaceholder}
                />
              </Field>
              {estimateHours !== undefined ? (
                <p className="-mt-3 text-sm text-ink-muted" role="status">
                  {copy.estimateHint.replace('{hours}', estimateHours)}
                </p>
              ) : null}
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
            <Field
              label={copy.urlLabel}
              htmlFor="new-scan-url"
              {...(urlError !== null ? { error: urlError } : {})}
              {...(normalizedUrlHint !== undefined ? { hint: normalizedUrlHint } : {})}
            >
              <Input
                id="new-scan-url"
                type="text"
                inputMode="url"
                required
                value={form.url}
                onChange={(event) => setField('url', event.target.value)}
                placeholder={copy.urlPlaceholder}
              />
            </Field>
          )}

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
              onChange={(event) => {
                autoAttachedProspectId.current = undefined;
                setField('prospectId', event.target.value);
              }}
              aria-label={copy.prospectLabel}
            >
              <option value="">{copy.noProspectOption}</option>
              {form.prospectId !== '' &&
              !availableProspectMatches.some((match) => match.prospectId === form.prospectId) ? (
                <option value={form.prospectId}>{form.prospectId}</option>
              ) : null}
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
                  {offersField('maxPages') ? (
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
                  ) : null}
                  {offersField('maxDepth') ? (
                    <Field label={copy.maxDepthLabel} htmlFor="new-scan-max-depth">
                      <Input
                        id="new-scan-max-depth"
                        type="number"
                        min={0}
                        value={form.maxDepth}
                        onChange={(event) => setField('maxDepth', event.target.value)}
                      />
                    </Field>
                  ) : null}
                  <Field
                    label={copy.delayLabel}
                    htmlFor="new-scan-delay-seconds"
                    hint={copy.delayHint}
                  >
                    <Input
                      id="new-scan-delay-seconds"
                      type="number"
                      min={0}
                      step="any"
                      inputMode="decimal"
                      value={form.delaySeconds}
                      onChange={(event) => setField('delaySeconds', event.target.value)}
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
                {offersField('seeds') ? (
                  <Field label={copy.seedsLabel} htmlFor="new-scan-seeds">
                    <Textarea
                      id="new-scan-seeds"
                      value={form.seeds}
                      onChange={(event) => setField('seeds', event.target.value)}
                      placeholder={copy.seedsPlaceholder}
                    />
                  </Field>
                ) : null}
                {offersField('exclusions') ? (
                  <Field label={copy.exclusionsLabel} htmlFor="new-scan-exclusions">
                    <Textarea
                      id="new-scan-exclusions"
                      value={form.exclusions}
                      onChange={(event) => setField('exclusions', event.target.value)}
                      placeholder={copy.exclusionsPlaceholder}
                    />
                  </Field>
                ) : null}
                {offersField('bookingEngineUrl') ? (
                  <Field label={copy.bookingEngineUrlLabel} htmlFor="new-scan-booking-engine-url">
                    <Input
                      id="new-scan-booking-engine-url"
                      type="text"
                      value={form.bookingEngineUrl}
                      onChange={(event) => setField('bookingEngineUrl', event.target.value)}
                      placeholder={copy.bookingEngineUrlPlaceholder}
                    />
                  </Field>
                ) : null}
              </div>
            ) : null}
          </div>

          <Button type="submit" className="w-full" isLoading={isSubmitting}>
            {copy.submitButton}
          </Button>
        </form>
      </Card>
    </article>
  );
}
