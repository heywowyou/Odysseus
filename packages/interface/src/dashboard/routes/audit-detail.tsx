import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { useParams } from 'react-router';
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
import type { DashboardStrings } from '../i18n/types';
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
  hasPageCountWarning,
  hostnameOf,
  isSeverity,
  isValidSiren,
  manualFieldValuesFromResponse,
  normalizeSiren,
  sortFindings,
} from './audit-detail-model';
import type {
  ManualFieldKey,
  ManualFieldValues,
  SectorChoice,
  TextManualFieldKey,
} from './audit-detail-model';
import type {
  AuditDetailResponse,
  FindingResponse,
  ManualFieldsResponse,
  ReportFreshness,
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

function ReportsCard({ detail }: { detail: AuditDetailResponse }): JSX.Element {
  const { strings } = useI18n();
  const hasReports = detail.reportLanguages.length > 0 && detail.reports.length > 0;
  const reportBase = `/api/audits/${encodeURIComponent(detail.auditId)}/report`;
  return (
    <Card title={strings.auditDetail.reportsHeading}>
      {!hasReports ? (
        <p className="text-sm text-ink-muted">{strings.auditDetail.noReportsYet}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {detail.reports.map((report) => (
            <li key={report.language} className="flex flex-wrap items-center gap-2">
              <span className="w-14 text-sm font-medium text-ink">
                {strings.auditDetail.languageLabels[report.language]}
              </span>
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
              >
                {strings.auditDetail.previewReport}
              </a>
              <a
                className={buttonStyles('ghost', 'sm')}
                href={`${reportBase}/${report.language}`}
                download
              >
                {detail.lifecycle === 'approved'
                  ? strings.auditDetail.approvedDownload
                  : strings.common.downloadReport}
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function FindingsCard({ findings }: { findings: FindingResponse[] }): JSX.Element {
  const { strings } = useI18n();
  const [filter, setFilter] = useState<SeverityFilter>('');
  const sorted = useMemo(() => sortFindings(findings), [findings]);
  const visible = filter === '' ? sorted : sorted.filter((finding) => finding.severity === filter);
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
            {visible.map((finding) => (
              <TableRow key={finding.findingId}>
                <TableCell>
                  <Badge tone={finding.severity}>
                    {strings.common.severityLabels[finding.severity]}
                  </Badge>
                </TableCell>
                <TableCell>
                  {vocabularyLabel(
                    strings.auditDetail.categoryLabels,
                    finding.category,
                    finding.category,
                  )}
                </TableCell>
                <TableCell className="text-ink">{finding.title}</TableCell>
                <TableCell className="numeric text-right">{countOccurrences(finding)}</TableCell>
                <TableCell className="numeric text-right">{countPages(finding)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
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
  refresh: () => void;
}): JSX.Element {
  const { auditId, manualFields, detectedTransactionalFlow, refresh } = props;
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

  const handleSave = async (): Promise<void> => {
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
    const requestPatch = { ...patch, ...transactionalFlowPatch };
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
      <div className="mt-5 flex justify-end border-t border-line pt-4">
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
        <ReportsCard detail={data} />
        <PrepareReportCard auditId={data.auditId} />
        <EnrichmentCard
          auditId={data.auditId}
          manualFields={data.manualFields ?? null}
          detectedTransactionalFlow={data.detectedTransactionalFlow}
          refresh={refresh}
        />
        <FindingsCard findings={data.findings} />
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
