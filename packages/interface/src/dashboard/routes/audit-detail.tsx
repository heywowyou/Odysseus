import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { ChevronDown } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { PAGE_WIDTH, PageHeader } from '../components/page-header';
import { Badge } from '../components/ui/badge';
import type { BadgeTone } from '../components/ui/badge';
import { Button, buttonStyles } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { ConfirmDialog } from '../components/ui/dialog';
import { EmptyState } from '../components/ui/empty-state';
import { Field } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Skeleton } from '../components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../components/ui/table';
import { useI18n } from '../i18n/provider';
import type { DashboardLanguage, DashboardStrings } from '../i18n/types';
import { vocabularyLabel } from '../lib/vocabulary';
import { PrepareReportCard } from './prepare-report-card';
import { ApiError, fetchJson, postEmpty, sendJson } from '../lib/api';
import { cn } from '../lib/cn';
import { formatDateTime } from '../lib/format';
import { usePolling } from '../lib/use-polling';
import {
  SEVERITIES,
  buildManualFieldsPatch,
  countOccurrences,
  countPages,
  failureReasonKind,
  fallbackNoticeText,
  findPublisherIdentificationFinding,
  findingDisplayTitle,
  findingExpansionView,
  firstElementSelector,
  hasPageCountWarning,
  hostnameOf,
  isReportStageFailure,
  isSeverity,
  isValidSiren,
  manualFieldValuesFromResponse,
  normalizeSiren,
  sortFindings,
} from './audit-detail-model';
import type {
  ManualFieldKey,
  ManualFieldsPatch,
  ManualFieldValues,
  RuleCopyMap,
  SectorChoice,
  TextManualFieldKey,
} from './audit-detail-model';
import type {
  AuditDetailResponse,
  AuditFailureResponse,
  AuditLifecycle,
  FindingResponse,
  ManualFieldsResponse,
  ReportFreshness,
  ReportLanguage,
  Severity,
  SeverityRollup,
  SirenPreviewResponse,
} from './audit-detail-types';

type SeverityFilter = '' | Severity;

interface AuditDetailState {
  data: AuditDetailResponse | undefined;
  error: string | undefined;
  isLoading: boolean;
  refresh: () => void;
  isNotFound: boolean;
}

/** useApi-flavoured fetch of the audit detail with one addition: the
 *  polling layer flattens every failure to a message string and drops
 *  ApiError.status, so the fetcher records a 404 itself and the page can
 *  render the dedicated not-found state instead of a generic error. */
function useAuditDetail(auditId: string | undefined): AuditDetailState {
  const path = auditId === undefined ? null : `/api/audits/${encodeURIComponent(auditId)}`;
  const [isNotFound, setIsNotFound] = useState(false);

  useEffect(() => {
    setIsNotFound(false);
  }, [auditId]);

  const fetcher = useCallback(async (): Promise<AuditDetailResponse> => {
    try {
      return await fetchJson<AuditDetailResponse>(path ?? '');
    } catch (cause: unknown) {
      if (cause instanceof ApiError && cause.status === 404) {
        setIsNotFound(true);
      }
      throw cause;
    }
  }, [path]);

  const polling = usePolling<AuditDetailResponse>(fetcher, 0, {
    enabled: path !== null,
    key: path ?? 'none',
  });
  return { ...polling, isNotFound };
}

function DetectedHint({ visible, label }: { visible: boolean; label: string }): JSX.Element | null {
  if (!visible) return null;
  return <p className="mt-1.5 text-xs text-accent-bright">{label}</p>;
}

const FRESHNESS_TONES: Record<ReportFreshness, BadgeTone> = {
  fresh: 'minor',
  stale: 'serious',
  unverified: 'neutral',
};

/** Field labels reused from this page's own manual-fields form: the two
 *  identity fields are the same two fields, so the copy cannot drift. */
function failureFieldLabel(field: string, strings: DashboardStrings): string {
  if (field === 'nomCommercial') return strings.auditDetail.nomCommercialLabel;
  if (field === 'raisonSociale') return strings.auditDetail.raisonSocialeLabel;
  return field;
}

/** Issue #90: a report-stage failure is a needs-input state, and the
 *  reason exists only on the linked job row until this card surfaces it.
 *  The stored message is the pipeline's own English prescription and is
 *  shown verbatim as a technical detail; the bilingual hint above the
 *  actions carries the remediation, keyed on the typed failure case.
 *  A `scanned` audit stores no analysis pair, so regenerating the report
 *  would answer 409 every time; the card points to the Prepare report
 *  card's writing regeneration instead, the only action that creates a
 *  pair. */
function FailureCard(props: {
  failure: AuditFailureResponse;
  lifecycle: AuditLifecycle;
  onRegenerate: () => void;
  isRegenerating: boolean;
}): JSX.Element {
  const { failure, lifecycle, onRegenerate, isRegenerating } = props;
  const { strings } = useI18n();
  const isIdentity = failureReasonKind(failure) === 'identity-confirmation';
  const hasPairToRegenerate = lifecycle !== 'scanned';
  const awaitingFields = failure.needsInputFields ?? [];
  // jsdom ships no layout engine, so scrollIntoView is feature-tested
  // rather than assumed.
  const scrollToFields = (): void => {
    document.getElementById('audit-hotel-fields')?.scrollIntoView(true);
  };
  const scrollToPrepare = (): void => {
    document.getElementById('audit-prepare-report')?.scrollIntoView(true);
  };
  return (
    <Card
      title={strings.auditDetail.failureHeading}
      className={isIdentity ? 'border-sev-moderate/40' : 'border-danger/40'}
    >
      {isIdentity && awaitingFields.length > 0 ? (
        <div className="mb-3">
          <p className="text-sm font-medium text-ink">
            {strings.auditDetail.failureAwaitingFieldsLabel}
          </p>
          <ul className="mt-1 flex flex-col gap-1 text-sm text-ink-soft">
            {awaitingFields.map((entry) => (
              <li key={entry.field}>
                <span className="font-medium text-ink">
                  {failureFieldLabel(entry.field, strings)}:
                </span>{' '}
                {entry.value}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-sm text-ink-soft">
        {isIdentity
          ? strings.auditDetail.failureHintIdentity
          : hasPairToRegenerate
            ? strings.auditDetail.failureHintReportStage
            : strings.auditDetail.failureHintAnalysisStage}
      </p>
      {failure.error !== '' ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-ink-muted">
            {strings.auditDetail.failureMessageLabel}
          </p>
          <pre className="mt-1 overflow-x-auto rounded-lg border border-line bg-raised p-3 font-mono text-xs whitespace-pre-wrap text-ink-soft">
            {failure.error}
          </pre>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {hasPairToRegenerate ? (
          <Button size="sm" isLoading={isRegenerating} onClick={onRegenerate}>
            {strings.auditDetail.regenerateButton}
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={scrollToPrepare}>
            {strings.auditDetail.failureScrollToPrepare}
          </Button>
        )}
        {isIdentity ? (
          <Button variant="secondary" size="sm" onClick={scrollToFields}>
            {strings.auditDetail.failureScrollToFields}
          </Button>
        ) : null}
        <Link
          to={`/scans/${encodeURIComponent(failure.jobId)}`}
          className={buttonStyles('ghost', 'sm')}
        >
          {strings.auditDetail.failureJobLink}
        </Link>
      </div>
    </Card>
  );
}

/** Issue #91: the report endpoints answer conflicts with a JSON body the
 *  browser would render as a raw page, so the click is handled instead of
 *  navigated: the bytes are fetched first, then handed to the browser as
 *  a blob (new tab for the preview, a download for the file). Any non-OK
 *  answer becomes a thrown Error carrying the server's detail line for
 *  the caller's toast. */
async function openReportPdf(
  url: string,
  mode: 'preview' | 'download',
  fileName: string,
): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => ({}));
    const detail =
      body !== null && typeof body === 'object' && 'error' in body
        ? String((body as Record<string, unknown>)['error'])
        : String(response.status);
    throw new Error(detail);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  if (mode === 'preview') {
    window.open(objectUrl, '_blank', 'noopener,noreferrer');
  } else {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }
  // Revoke late: a preview tab the operator opens from the notification
  // may still be loading; a leaked URL for a minute is the smaller harm.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

function ReportsCard(props: {
  detail: AuditDetailResponse;
  onRegenerate: () => void;
  isRegenerating: boolean;
}): JSX.Element {
  const { detail, onRegenerate, isRegenerating } = props;
  const { language, strings } = useI18n();
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const hasReports = detail.reportLanguages.length > 0 && detail.reports.length > 0;
  const reportBase = `/api/audits/${encodeURIComponent(detail.auditId)}/report`;
  // Plan 032 (issue #162): the selected pair came from the audit fallback
  // gate, so the card says why the report has no model-written themes
  // instead of leaving the absence to be read as a failure.
  const staticFallbackNotice = fallbackNoticeText(detail.analysisIsStaticFallback, language);

  const openReport = async (
    language: ReportLanguage,
    mode: 'preview' | 'download',
  ): Promise<void> => {
    setIsLoadingReport(true);
    try {
      await openReportPdf(
        mode === 'preview' ? `${reportBase}/${language}/preview` : `${reportBase}/${language}`,
        mode,
        `odysseus-rapport-${language}.pdf`,
      );
    } catch (error) {
      toast.error(strings.auditDetail.reportUnavailableError, {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsLoadingReport(false);
    }
  };

  return (
    <Card title={strings.auditDetail.reportsHeading}>
      {staticFallbackNotice !== undefined ? (
        <p className="mb-3 max-w-reading text-xs text-ink-muted">{staticFallbackNotice}</p>
      ) : null}
      {!hasReports ? (
        <p className="text-sm text-ink-muted">{strings.auditDetail.noReportsYet}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {detail.reports.map((report) => (
            <li key={report.language} className="flex flex-wrap items-center gap-2">
              <span className="w-14 text-sm font-medium text-ink">
                {strings.auditDetail.languageLabels[report.language]}
              </span>
              {report.pdfAvailable ? (
                <>
                  <Badge tone={FRESHNESS_TONES[report.status]}>
                    {strings.auditDetail.reportFreshness[report.status]}
                  </Badge>
                  {/* Non-blocking length warning (plan 018): the report stays
                      previewable and deliverable, the row only grows a badge. */}
                  {hasPageCountWarning(report.pageCount) ? (
                    <Badge tone="moderate">
                      {strings.auditDetail.reportPageCountWarning.replace(
                        '{count}',
                        String(report.pageCount),
                      )}
                    </Badge>
                  ) : null}
                  <a
                    className={buttonStyles('ghost', 'sm')}
                    href={`${reportBase}/${report.language}/preview`}
                    target="_blank"
                    rel="noreferrer"
                    aria-disabled={isLoadingReport}
                    onClick={(event) => {
                      event.preventDefault();
                      void openReport(report.language, 'preview');
                    }}
                  >
                    {strings.auditDetail.previewReport}
                  </a>
                  <a
                    className={buttonStyles('ghost', 'sm')}
                    href={`${reportBase}/${report.language}`}
                    download
                    aria-disabled={isLoadingReport}
                    onClick={(event) => {
                      event.preventDefault();
                      void openReport(report.language, 'download');
                    }}
                  >
                    {detail.lifecycle === 'approved'
                      ? strings.auditDetail.approvedDownload
                      : strings.common.downloadReport}
                  </a>
                </>
              ) : (
                <>
                  {/* Issue #91: a freshness badge asserts an availability the
                      endpoints cannot honour from this machine, so an
                      unreachable report reads as its own state instead. */}
                  <Badge tone={report.status === 'unverified' ? 'neutral' : 'serious'}>
                    {report.status === 'unverified'
                      ? strings.auditDetail.reportFreshness.unverified
                      : strings.auditDetail.reportPdfUnavailableBadge}
                  </Badge>
                  <p className="w-full text-xs text-ink-muted">
                    {report.status === 'unverified'
                      ? strings.auditDetail.reportPdfMissingNote
                      : strings.auditDetail.reportPdfUnavailableNote}
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    isLoading={isRegenerating}
                    onClick={onRegenerate}
                  >
                    {strings.auditDetail.regenerateButton}
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function FindingsCard(props: {
  findings: FindingResponse[];
  ruleCopy: RuleCopyMap | undefined;
  language: DashboardLanguage;
  expandedFindingId: string | null;
  onExpandedFindingChange: (findingId: string | null) => void;
}): JSX.Element {
  const { findings, ruleCopy, language, expandedFindingId, onExpandedFindingChange } = props;
  const { strings } = useI18n();
  const [filter, setFilter] = useState<SeverityFilter>('');
  const sorted = useMemo(() => sortFindings(findings), [findings]);
  const visible = filter === '' ? sorted : sorted.filter((finding) => finding.severity === filter);
  // The dedicated alert lands on the same actionable control as a direct
  // table click, so its remediation remains the existing reviewed copy.
  useEffect(() => {
    if (expandedFindingId === null) return;
    const control = document.getElementById(`finding-toggle-${expandedFindingId}`);
    if (typeof control?.scrollIntoView === 'function') {
      control.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    (control as HTMLButtonElement | null)?.focus({ preventScroll: true });
  }, [expandedFindingId]);
  return (
    <Card
      title={strings.auditDetail.findingsHeading}
      actions={
        <div className="w-44">
          <Select
            aria-label={strings.auditDetail.findingsFilterAll}
            value={filter}
            onChange={(event) => {
              const next = event.target.value;
              if (next === '' || isSeverity(next)) {
                setFilter(next);
              }
            }}
          >
            <option value="">{strings.auditDetail.findingsFilterAll}</option>
            {SEVERITIES.map((severity) => (
              <option key={severity} value={severity}>
                {strings.common.severityLabels[severity]}
              </option>
            ))}
          </Select>
        </div>
      }
    >
      {visible.length === 0 ? (
        <p className="text-sm text-ink-muted">{strings.auditDetail.findingsEmpty}</p>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell className="w-24">
                {strings.auditDetail.severityColumn}
              </TableHeaderCell>
              <TableHeaderCell>{strings.auditDetail.categoryColumn}</TableHeaderCell>
              <TableHeaderCell>{strings.auditDetail.titleColumn}</TableHeaderCell>
              <TableHeaderCell className="w-28 text-right">
                {strings.auditDetail.occurrencesColumn}
              </TableHeaderCell>
              <TableHeaderCell className="w-28 text-right">
                {strings.auditDetail.pagesColumn}
              </TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.map((finding) => {
              const isExpanded = expandedFindingId === finding.findingId;
              const selector = firstElementSelector(finding);
              return (
                <FindingRowGroup
                  key={finding.findingId}
                  finding={finding}
                  ruleCopy={ruleCopy}
                  language={language}
                  isExpanded={isExpanded}
                  selector={selector}
                  onToggle={() => onExpandedFindingChange(isExpanded ? null : finding.findingId)}
                />
              );
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

/** One finding: the summary row with its visible discriminator (the short
 *  finding id and the first occurrence's selector, which is what makes
 *  repeated detector titles distinguishable), plus the expansion row when
 *  open. The expansion renders the reviewed FR/EN copy the API resolved
 *  for the rule, then the affected pages and the stored element identity
 *  (selector, snippet, page). */
function FindingRowGroup(props: {
  finding: FindingResponse;
  ruleCopy: RuleCopyMap | undefined;
  language: DashboardLanguage;
  isExpanded: boolean;
  selector: string | undefined;
  onToggle: () => void;
}): JSX.Element {
  const { finding, ruleCopy, language, isExpanded, selector, onToggle } = props;
  const { strings } = useI18n();
  const expansion = isExpanded ? findingExpansionView(finding, ruleCopy, language) : undefined;
  return (
    <>
      <TableRow onClick={onToggle} className="cursor-pointer">
        <TableCell>
          <Badge tone={finding.severity}>{strings.common.severityLabels[finding.severity]}</Badge>
        </TableCell>
        <TableCell>
          {vocabularyLabel(strings.auditDetail.categoryLabels, finding.category, finding.category)}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <button
              id={`finding-toggle-${finding.findingId}`}
              type="button"
              className="rounded p-0.5 text-ink-muted transition-colors hover:text-accent-bright"
              aria-expanded={isExpanded}
              aria-label={strings.auditDetail.findingDetailsToggle}
              onClick={(event) => {
                event.stopPropagation();
                onToggle();
              }}
            >
              <ChevronDown
                className={cn('size-4 transition-transform', isExpanded && 'rotate-180')}
                aria-hidden="true"
              />
            </button>
            <span className="min-w-0">
              <span className="block text-ink">
                {findingDisplayTitle(finding, ruleCopy, language)}
              </span>
              <span className="numeric block font-mono text-xs text-ink-muted">
                {finding.findingId}
                {selector !== undefined ? (
                  <span className="ml-2 max-w-72 truncate align-baseline">{selector}</span>
                ) : null}
              </span>
            </span>
          </div>
        </TableCell>
        <TableCell className="numeric text-right">{countOccurrences(finding)}</TableCell>
        <TableCell className="numeric text-right">{countPages(finding)}</TableCell>
      </TableRow>
      {expansion !== undefined ? (
        <TableRow>
          <TableCell colSpan={5} className="bg-raised">
            {expansion.gloss !== undefined ? (
              <p className="max-w-reading text-sm text-ink-soft">
                <span className="font-medium text-ink">
                  {strings.auditDetail.findingGlossLabel} :
                </span>{' '}
                {expansion.gloss}
              </p>
            ) : null}
            {expansion.remediation !== undefined ? (
              <p className="mt-2 max-w-reading text-sm text-ink-soft">
                <span className="font-medium text-ink">
                  {strings.auditDetail.findingRemediationLabel} :
                </span>{' '}
                {expansion.remediation}
              </p>
            ) : null}
            <p className="mt-3 text-xs font-medium text-ink-muted">
              {strings.auditDetail.pagesColumn}
            </p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {expansion.pages.map((pageUrl) => (
                <li key={pageUrl} className="break-all font-mono text-xs text-ink-muted">
                  {pageUrl}
                </li>
              ))}
            </ul>
            {expansion.hiddenPageCount > 0 ? (
              <p className="numeric mt-1 text-xs text-ink-muted">
                {strings.auditDetail.findingMorePages.replace(
                  '{count}',
                  String(expansion.hiddenPageCount),
                )}
              </p>
            ) : null}
            {expansion.elements.length > 0 ? (
              <>
                <p className="mt-3 text-xs font-medium text-ink-muted">
                  {strings.auditDetail.findingElementsLabel}
                </p>
                <ul className="mt-1 flex flex-col gap-2">
                  {expansion.elements.map((element) => (
                    <li
                      key={`${element.pageUrl} ${element.selector}`}
                      className="rounded-lg border border-line bg-panel p-2"
                    >
                      <p className="break-all font-mono text-xs text-ink">{element.selector}</p>
                      <p className="mt-1 text-xs text-ink-soft">{element.snippet}</p>
                      <p className="mt-1 break-all font-mono text-xs text-ink-muted">
                        {element.pageUrl}
                      </p>
                    </li>
                  ))}
                </ul>
                {expansion.hiddenElementCount > 0 ? (
                  <p className="numeric mt-1 text-xs text-ink-muted">
                    {strings.auditDetail.findingMoreElements.replace(
                      '{count}',
                      String(expansion.hiddenElementCount),
                    )}
                  </p>
                ) : null}
              </>
            ) : null}
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

/** Issue #120: the scanner's serious publisher-identification observation
 * gets an obvious entry point, without duplicating its reviewed remediation
 * or turning limited scan coverage into a conclusion about the business. */
function PublisherIdentificationAlert(props: {
  finding: FindingResponse;
  onRevealFinding: () => void;
}): JSX.Element {
  const { finding, onRevealFinding } = props;
  const { strings } = useI18n();
  return (
    <Card
      title={strings.auditDetail.publisherIdentificationHeading}
      className="border-sev-serious/40"
      actions={
        <Badge tone={finding.severity}>{strings.common.severityLabels[finding.severity]}</Badge>
      }
    >
      <p className="max-w-reading text-sm text-ink-soft">
        {strings.auditDetail.publisherIdentificationObserved}
      </p>
      <p className="mt-2 max-w-reading text-xs text-ink-muted">
        {strings.auditDetail.publisherIdentificationLimit}
      </p>
      <Button variant="secondary" size="sm" className="mt-4" onClick={onRevealFinding}>
        {strings.auditDetail.publisherIdentificationAction}
      </Button>
    </Card>
  );
}

interface TextFieldDef {
  key: TextManualFieldKey;
  label: `${TextManualFieldKey}Label`;
}

const TEXT_FIELDS_TOP: readonly TextFieldDef[] = [
  { key: 'sirenSourceUrl', label: 'sirenSourceUrlLabel' },
  { key: 'raisonSociale', label: 'raisonSocialeLabel' },
  { key: 'nomCommercial', label: 'nomCommercialLabel' },
  { key: 'recipientName', label: 'recipientNameLabel' },
];

const TEXT_FIELDS_BOTTOM: readonly TextFieldDef[] = [
  { key: 'revenueBand', label: 'revenueBandLabel' },
  { key: 'declarationContactEmail', label: 'declarationContactEmailLabel' },
];

type SirenCheckState =
  { kind: 'idle' } | { kind: 'resolved'; denomination: string } | { kind: 'unresolved' };

type TransactionalFlowChoice = '' | 'present' | 'absent';

function transactionalFlowChoice(
  override: ManualFieldsResponse['transactionalFlowOverride'],
): TransactionalFlowChoice {
  if (override === undefined) return '';
  return override.value ? 'present' : 'absent';
}

function EnrichmentCard(props: {
  auditId: string;
  manualFields: ManualFieldsResponse | null;
  detectedTransactionalFlow: boolean | undefined;
  awaitingIdentityFields: AuditFailureResponse['needsInputFields'];
  refresh: () => void;
}): JSX.Element {
  const { auditId, manualFields, detectedTransactionalFlow, awaitingIdentityFields, refresh } =
    props;
  const { strings } = useI18n();
  const baseline = useMemo(() => manualFieldValuesFromResponse(manualFields), [manualFields]);
  const [values, setValues] = useState<ManualFieldValues>(baseline);
  const [editedKeys, setEditedKeys] = useState<ReadonlySet<ManualFieldKey>>(() => new Set());
  const [isDirty, setIsDirty] = useState(false);
  const [sirenInvalid, setSirenInvalid] = useState(false);
  const [sirenCheck, setSirenCheck] = useState<SirenCheckState>({ kind: 'idle' });
  const [isCheckingSiren, setIsCheckingSiren] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [transactionalFlow, setTransactionalFlow] = useState<TransactionalFlowChoice>(() =>
    transactionalFlowChoice(manualFields?.transactionalFlowOverride),
  );
  const [transactionalFlowReason, setTransactionalFlowReason] = useState(
    () => manualFields?.transactionalFlowOverride?.reason ?? '',
  );
  const [transactionalFlowInvalid, setTransactionalFlowInvalid] = useState(false);

  // Re-seed the form whenever a fresh baseline arrives while the form is
  // clean, so a refetch after a save or a regenerate shows server truth
  // (operator provenance, spaces normalized). A dirty form is never
  // clobbered by a refetch.
  useEffect(() => {
    if (!isDirty) {
      setValues(baseline);
      setEditedKeys(new Set());
      setTransactionalFlow(transactionalFlowChoice(manualFields?.transactionalFlowOverride));
      setTransactionalFlowReason(manualFields?.transactionalFlowOverride?.reason ?? '');
      setTransactionalFlowInvalid(false);
    }
  }, [baseline, isDirty, manualFields?.transactionalFlowOverride]);

  const markEdited = (key: ManualFieldKey): void => {
    setIsDirty(true);
    setEditedKeys((current) => new Set(current).add(key));
  };

  const setText = (key: TextManualFieldKey, value: string): void => {
    markEdited(key);
    setValues((current) => {
      const next: ManualFieldValues = { ...current };
      next[key] = value;
      return next;
    });
  };

  const setSector = (value: SectorChoice): void => {
    markEdited('sector');
    setValues((current) => ({ ...current, sector: value }));
  };

  const setTransactionalFlowChoice = (value: TransactionalFlowChoice): void => {
    setIsDirty(true);
    setTransactionalFlowInvalid(false);
    setTransactionalFlow(value);
  };

  const setTransactionalFlowReasonValue = (value: string): void => {
    setIsDirty(true);
    setTransactionalFlowInvalid(false);
    setTransactionalFlowReason(value);
  };

  const handleSirenChange = (value: string): void => {
    setText('siren', value);
    setSirenInvalid(false);
    setSirenCheck({ kind: 'idle' });
  };

  // The 'please confirm' hint only makes sense while the shown value is
  // still exactly what the scanner detected; editing a field hides its
  // hint for good, because the next save stores the value as operator.
  const showDetectedHint = (key: ManualFieldKey): boolean =>
    !editedKeys.has(key) && manualFields?.[key]?.provenance === 'detected';

  const handleCheckSiren = async (): Promise<void> => {
    const cleaned = normalizeSiren(values.siren);
    if (!isValidSiren(cleaned)) {
      setSirenInvalid(true);
      return;
    }
    setSirenInvalid(false);
    setIsCheckingSiren(true);
    try {
      const result = await sendJson<SirenPreviewResponse>(
        `/api/audits/${encodeURIComponent(auditId)}/manual-fields/siren-preview`,
        'POST',
        { siren: cleaned },
      );
      setSirenCheck(
        result.resolved
          ? { kind: 'resolved', denomination: result.denomination ?? '' }
          : { kind: 'unresolved' },
      );
    } catch (error) {
      // The raw error string stays as the secondary detail line; the toast
      // headline is always localized product copy.
      toast.error(strings.auditDetail.actionError, {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsCheckingSiren(false);
    }
  };

  const detectedIdentityPatch = (): ManualFieldsPatch => {
    const patch: ManualFieldsPatch = {};
    for (const awaiting of awaitingIdentityFields ?? []) {
      if (awaiting.field !== 'nomCommercial' && awaiting.field !== 'raisonSociale') continue;
      if (manualFields?.[awaiting.field]?.provenance !== 'detected') continue;
      const value = values[awaiting.field].trim();
      if (value !== '') patch[awaiting.field] = value;
    }
    return patch;
  };

  const handleSave = async (confirmDetected = false): Promise<void> => {
    const patch = buildManualFieldsPatch(values, baseline);
    const siren = patch['siren'];
    if (siren !== undefined && !isValidSiren(siren)) {
      setSirenInvalid(true);
      return;
    }
    const existingOverride = manualFields?.transactionalFlowOverride;
    const normalizedReason = transactionalFlowReason.trim();
    const flowValue = transactionalFlow === 'present';
    if (transactionalFlow !== '' && normalizedReason === '') {
      setTransactionalFlowInvalid(true);
      return;
    }
    const transactionalFlowPatch =
      transactionalFlow !== '' &&
      (existingOverride === undefined ||
        existingOverride.value !== flowValue ||
        existingOverride.reason !== normalizedReason)
        ? { transactionalFlowOverride: { value: flowValue, reason: normalizedReason } }
        : {};
    const requestPatch = {
      ...patch,
      ...(confirmDetected ? detectedIdentityPatch() : {}),
      ...transactionalFlowPatch,
    };
    if (Object.keys(requestPatch).length === 0) {
      // Nothing the server recognizes changed; sending anyway would only
      // earn a 400 for an empty patch. The stored values already match.
      setIsDirty(false);
      toast.success(strings.auditDetail.savedMessage);
      return;
    }
    setIsSaving(true);
    try {
      await sendJson(
        `/api/audits/${encodeURIComponent(auditId)}/manual-fields`,
        'PATCH',
        requestPatch,
      );
      // The refetch below returns operator provenance for every saved
      // field, so the detected hints drop exactly like the old page's
      // reload did.
      setIsDirty(false);
      toast.success(strings.auditDetail.savedMessage);
      refresh();
    } catch (error) {
      toast.error(strings.auditDetail.actionError, {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const renderTextField = (def: TextFieldDef): JSX.Element => (
    <div key={def.key}>
      <Field label={strings.auditDetail[def.label]} htmlFor={`mf-${def.key}`}>
        <Input
          id={`mf-${def.key}`}
          name={def.key}
          value={values[def.key]}
          onChange={(event) => setText(def.key, event.target.value)}
        />
      </Field>
      <DetectedHint
        visible={showDetectedHint(def.key)}
        label={strings.auditDetail.detectedFieldHint}
      />
    </div>
  );

  const sirenFeedback: { text: string; tone: string } | null = isCheckingSiren
    ? { text: strings.auditDetail.sirenCheckingMessage, tone: 'text-ink-muted' }
    : sirenCheck.kind === 'resolved'
      ? {
          text: `${strings.auditDetail.sirenResolvedPrefix} ${sirenCheck.denomination}`,
          tone: 'text-accent-bright',
        }
      : sirenCheck.kind === 'unresolved'
        ? { text: strings.auditDetail.sirenNotResolvedMessage, tone: 'text-ink-muted' }
        : null;

  return (
    <Card
      title={strings.auditDetail.manualFieldsHeading}
      description={strings.auditDetail.manualFieldsHint}
    >
      <div className="grid max-w-reading grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <Field
            label={strings.auditDetail.sirenLabel}
            htmlFor="mf-siren"
            {...(sirenInvalid ? { error: strings.auditDetail.sirenInvalidError } : {})}
          >
            <div className="flex gap-2">
              <Input
                id="mf-siren"
                name="siren"
                value={values.siren}
                onChange={(event) => handleSirenChange(event.target.value)}
                className="max-w-48"
              />
              <Button
                variant="secondary"
                isLoading={isCheckingSiren}
                onClick={() => void handleCheckSiren()}
              >
                {strings.auditDetail.sirenCheckButton}
              </Button>
            </div>
          </Field>
          {sirenFeedback !== null ? (
            <p className={cn('mt-1.5 text-xs', sirenFeedback.tone)}>{sirenFeedback.text}</p>
          ) : null}
          <DetectedHint
            visible={showDetectedHint('siren')}
            label={strings.auditDetail.detectedFieldHint}
          />
        </div>
        {TEXT_FIELDS_TOP.map((def) => renderTextField(def))}
        <div>
          <Field label={strings.auditDetail.sectorLabel} htmlFor="mf-sector">
            <Select
              id="mf-sector"
              name="sector"
              value={values.sector}
              onChange={(event) => {
                const next = event.target.value;
                setSector(next === 'general' || next === 'hospitality' ? next : '');
              }}
            >
              <option value="">{strings.auditDetail.sectorAutoOption}</option>
              <option value="general">{strings.auditDetail.sectorGeneralOption}</option>
              <option value="hospitality">{strings.auditDetail.sectorHospitalityOption}</option>
            </Select>
          </Field>
          <DetectedHint
            visible={showDetectedHint('sector')}
            label={strings.auditDetail.detectedFieldHint}
          />
        </div>
        {TEXT_FIELDS_BOTTOM.map((def) => renderTextField(def))}
        <div className="md:col-span-2">
          <Field label={strings.auditDetail.transactionalFlowLabel} htmlFor="mf-transactional-flow">
            <Select
              id="mf-transactional-flow"
              name="transactionalFlow"
              value={transactionalFlow}
              onChange={(event) => {
                const value = event.target.value;
                setTransactionalFlowChoice(value === 'present' || value === 'absent' ? value : '');
              }}
            >
              {manualFields?.transactionalFlowOverride === undefined ? (
                <option value="">{strings.auditDetail.transactionalFlowUnspecifiedOption}</option>
              ) : null}
              <option value="present">{strings.auditDetail.transactionalFlowYesOption}</option>
              <option value="absent">{strings.auditDetail.transactionalFlowNoOption}</option>
            </Select>
          </Field>
          {detectedTransactionalFlow !== undefined ? (
            <p className="mt-1.5 text-xs text-accent-bright">
              {strings.auditDetail.transactionalFlowDetectedTemplate.replace(
                '{value}',
                detectedTransactionalFlow
                  ? strings.auditDetail.transactionalFlowYesOption
                  : strings.auditDetail.transactionalFlowNoOption,
              )}
            </p>
          ) : null}
          {transactionalFlow !== '' ? (
            <div className="mt-3">
              <Field
                label={strings.auditDetail.transactionalFlowReasonLabel}
                htmlFor="mf-transactional-flow-reason"
                {...(transactionalFlowInvalid
                  ? { error: strings.auditDetail.transactionalFlowReasonRequired }
                  : {})}
              >
                <Input
                  id="mf-transactional-flow-reason"
                  name="transactionalFlowReason"
                  value={transactionalFlowReason}
                  placeholder={strings.auditDetail.transactionalFlowReasonPlaceholder}
                  onChange={(event) => setTransactionalFlowReasonValue(event.target.value)}
                />
              </Field>
            </div>
          ) : null}
          <p className="mt-3 text-xs text-ink-muted">
            {strings.auditDetail.transactionalFlowSavedHint}
          </p>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
        {Object.keys(detectedIdentityPatch()).length > 0 ? (
          <Button variant="secondary" isLoading={isSaving} onClick={() => void handleSave(true)}>
            {strings.auditDetail.confirmDetectedFieldsButton}
          </Button>
        ) : null}
        <Button isLoading={isSaving} onClick={() => void handleSave()}>
          {strings.auditDetail.saveButton}
        </Button>
      </div>
    </Card>
  );
}

/** The severity rollup drawn to scale rather than as four equal tiles.
 *  Four same-sized numbers make a hundred minor issues look like the four
 *  critical ones; the whole point of the mix is its proportion. Every count
 *  is still written out beside its swatch, so nothing depends on the bar. */
function SeverityBar(props: { rollup: SeverityRollup; strings: DashboardStrings }): JSX.Element {
  const { rollup, strings } = props;
  const total = SEVERITIES.reduce((sum, severity) => sum + rollup[severity], 0);
  return (
    <figure className="m-0">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-raised" aria-hidden="true">
        {SEVERITIES.map((severity) =>
          rollup[severity] === 0 ? null : (
            <div
              key={severity}
              className={SEVERITY_FILL[severity]}
              style={{ width: `${(rollup[severity] / total) * 100}%` }}
            />
          ),
        )}
      </div>
      <figcaption className="mt-3">
        <dl className="flex flex-wrap gap-x-6 gap-y-2">
          {SEVERITIES.map((severity) => (
            <div key={severity} className="flex items-baseline gap-2">
              <span
                className={cn('size-2 shrink-0 rounded-sm', SEVERITY_FILL[severity])}
                aria-hidden="true"
              />
              <dt className="text-xs text-ink-muted">{strings.common.severityLabels[severity]}</dt>
              <dd className="numeric text-sm font-medium text-ink">{rollup[severity]}</dd>
            </div>
          ))}
        </dl>
      </figcaption>
    </figure>
  );
}

const SEVERITY_FILL: Record<Severity, string> = {
  critical: 'bg-sev-critical',
  serious: 'bg-sev-serious',
  moderate: 'bg-sev-moderate',
  minor: 'bg-sev-minor',
};

export function AuditDetailPage(): JSX.Element {
  const { auditId } = useParams<{ auditId: string }>();
  const { language, strings } = useI18n();
  const { data, error, refresh, isNotFound } = useAuditDetail(auditId);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [expandedFindingId, setExpandedFindingId] = useState<string | null>(null);

  const handleRegenerate = async (): Promise<void> => {
    if (auditId === undefined) return;
    setIsRegenerating(true);
    toast(strings.auditDetail.regeneratingMessage);
    try {
      await postEmpty(`/api/audits/${encodeURIComponent(auditId)}/regenerate-report`);
      toast.success(strings.auditDetail.regeneratedMessage);
      refresh();
    } catch (error) {
      toast.error(strings.auditDetail.actionError, {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleApprove = async (): Promise<void> => {
    if (auditId === undefined) return;
    try {
      await postEmpty(`/api/audits/${encodeURIComponent(auditId)}/approve-reports`);
      toast.success(strings.auditDetail.reportsApprovedMessage);
      refresh();
    } catch (error) {
      // A 409 means an unmet precondition (no fresh verified pair yet) and
      // its message explains which; it stays as the toast's detail line.
      toast.error(strings.auditDetail.actionError, {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  if (isNotFound) {
    return (
      <article className={PAGE_WIDTH.surface}>
        <EmptyState title={strings.auditDetail.notFound} />
      </article>
    );
  }

  if (error !== undefined && data === undefined) {
    return (
      <article>
        <EmptyState
          title={strings.common.requestFailed}
          description={error}
          action={
            <Button variant="secondary" onClick={refresh}>
              {strings.common.retry}
            </Button>
          }
        />
      </article>
    );
  }

  if (data === undefined) {
    return (
      <article aria-busy="true" aria-label={strings.common.loading}>
        <div className="mb-8">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="mt-2 h-4 w-96 max-w-full" />
        </div>
        <div className="flex flex-col gap-6">
          <Skeleton className="h-36" />
          <Skeleton className="h-80" />
          <Skeleton className="h-72" />
        </div>
      </article>
    );
  }

  const publisherIdentificationFinding = findPublisherIdentificationFinding(data.findings);

  return (
    <article className={PAGE_WIDTH.surface}>
      <PageHeader
        eyebrow={strings.common.typeLabels.fullAudit}
        title={hostnameOf(data.siteUrl)}
        meta={
          <div className="flex flex-col gap-4">
            <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
              <div className="flex items-baseline gap-2">
                <dt className="text-ink-muted">{strings.auditDetail.dateLabel}</dt>
                <dd className="numeric text-ink">{formatDateTime(data.startedAt, language)}</dd>
              </div>
              <div className="flex items-baseline gap-2">
                <dt className="text-ink-muted">{strings.auditDetail.pagesVisitedLabel}</dt>
                <dd className="numeric text-ink">{data.pagesVisited}</dd>
              </div>
            </dl>
            <SeverityBar rollup={data.severityRollup} strings={strings} />
          </div>
        }
        actions={
          <>
            <Badge>
              {strings.auditDetail.lifecycleLabel} : {strings.auditDetail.lifecycle[data.lifecycle]}
            </Badge>
            <Button
              variant="secondary"
              isLoading={isRegenerating}
              onClick={() => void handleRegenerate()}
            >
              {strings.auditDetail.regenerateButton}
            </Button>
            <Button onClick={() => setIsApproveOpen(true)}>
              {strings.auditDetail.approveReportsButton}
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-6">
        {isReportStageFailure({ failure: data.failure, lifecycle: data.lifecycle }) &&
        data.failure !== undefined ? (
          <FailureCard
            failure={data.failure}
            lifecycle={data.lifecycle}
            onRegenerate={() => void handleRegenerate()}
            isRegenerating={isRegenerating}
          />
        ) : null}
        {publisherIdentificationFinding !== undefined ? (
          <PublisherIdentificationAlert
            finding={publisherIdentificationFinding}
            onRevealFinding={() => setExpandedFindingId(publisherIdentificationFinding.findingId)}
          />
        ) : null}
        <ReportsCard
          detail={data}
          onRegenerate={() => void handleRegenerate()}
          isRegenerating={isRegenerating}
        />
        {/* Anchor target of the failure card's "go to Prepare report" action. */}
        <div id="audit-prepare-report">
          <PrepareReportCard auditId={data.auditId} />
        </div>
        {/* Anchor target of the failure card's "go to the fields" action. */}
        <div id="audit-hotel-fields">
          <EnrichmentCard
            auditId={data.auditId}
            manualFields={data.manualFields ?? null}
            detectedTransactionalFlow={data.detectedTransactionalFlow}
            awaitingIdentityFields={data.failure?.needsInputFields}
            refresh={refresh}
          />
        </div>
        <FindingsCard
          findings={data.findings}
          ruleCopy={data.ruleCopy}
          language={language}
          expandedFindingId={expandedFindingId}
          onExpandedFindingChange={setExpandedFindingId}
        />
      </div>
      <ConfirmDialog
        open={isApproveOpen}
        onOpenChange={setIsApproveOpen}
        title={strings.auditDetail.confirmApproveTitle}
        description={strings.auditDetail.confirmApproveBody}
        confirmLabel={strings.auditDetail.approveReportsButton}
        cancelLabel={strings.common.cancel}
        onConfirm={handleApprove}
      />
    </article>
  );
}
