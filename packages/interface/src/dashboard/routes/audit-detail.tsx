import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { useParams } from 'react-router';
import { toast } from 'sonner';
import { PageHeader } from '../components/page-header';
import { Badge } from '../components/ui/badge';
import type { BadgeTone } from '../components/ui/badge';
import { Button, buttonStyles } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { ConfirmDialog } from '../components/ui/dialog';
import { EmptyState } from '../components/ui/empty-state';
import { Field } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { KpiTile } from '../components/ui/kpi';
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
import { ApiError, fetchJson, postEmpty, sendJson } from '../lib/api';
import { cn } from '../lib/cn';
import { formatDateTime } from '../lib/format';
import { usePolling } from '../lib/use-polling';
import {
  SEVERITIES,
  buildManualFieldsPatch,
  countOccurrences,
  countPages,
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
                <TableCell>{finding.category}</TableCell>
                <TableCell className="text-ink">{finding.title}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {countOccurrences(finding)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{countPages(finding)}</TableCell>
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

function EnrichmentCard(props: {
  auditId: string;
  manualFields: ManualFieldsResponse | null;
  refresh: () => void;
}): JSX.Element {
  const { auditId, manualFields, refresh } = props;
  const { strings } = useI18n();
  const baseline = useMemo(() => manualFieldValuesFromResponse(manualFields), [manualFields]);
  const [values, setValues] = useState<ManualFieldValues>(baseline);
  const [editedKeys, setEditedKeys] = useState<ReadonlySet<ManualFieldKey>>(() => new Set());
  const [isDirty, setIsDirty] = useState(false);
  const [sirenInvalid, setSirenInvalid] = useState(false);
  const [sirenCheck, setSirenCheck] = useState<SirenCheckState>({ kind: 'idle' });
  const [isCheckingSiren, setIsCheckingSiren] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Re-seed the form whenever a fresh baseline arrives while the form is
  // clean, so a refetch after a save or a regenerate shows server truth
  // (operator provenance, spaces normalized). A dirty form is never
  // clobbered by a refetch.
  useEffect(() => {
    if (!isDirty) {
      setValues(baseline);
      setEditedKeys(new Set());
    }
  }, [baseline, isDirty]);

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
      toast.error(error instanceof ApiError ? error.message : strings.auditDetail.actionError);
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
    if (Object.keys(patch).length === 0) {
      // Nothing the server recognizes changed; sending anyway would only
      // earn a 400 for an empty patch. The stored values already match.
      setIsDirty(false);
      toast.success(strings.auditDetail.savedMessage);
      return;
    }
    setIsSaving(true);
    try {
      await sendJson(`/api/audits/${encodeURIComponent(auditId)}/manual-fields`, 'PATCH', patch);
      // The refetch below returns operator provenance for every saved
      // field, so the detected hints drop exactly like the old page's
      // reload did.
      setIsDirty(false);
      toast.success(strings.auditDetail.savedMessage);
      refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : strings.auditDetail.actionError);
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
      <div className="grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2">
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
      </div>
      <div className="mt-5 flex justify-end border-t border-line pt-4">
        <Button isLoading={isSaving} onClick={() => void handleSave()}>
          {strings.auditDetail.saveButton}
        </Button>
      </div>
    </Card>
  );
}

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
      toast.error(error instanceof ApiError ? error.message : strings.auditDetail.actionError);
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
      // its message explains which; anything else is a plain failure.
      if (error instanceof ApiError && error.status === 409) {
        toast.error(error.message);
      } else {
        toast.error(strings.auditDetail.actionError);
      }
    }
  };

  if (isNotFound) {
    return (
      <article>
        <EmptyState title={strings.auditDetail.notFound} />
      </article>
    );
  }

  if (error !== undefined && data === undefined) {
    return (
      <article>
        <EmptyState
          title={strings.common.error}
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
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {SEVERITIES.map((severity) => (
            <Skeleton key={severity} className="h-20" />
          ))}
        </div>
        <div className="mt-6 flex flex-col gap-6">
          <Skeleton className="h-36" />
          <Skeleton className="h-80" />
          <Skeleton className="h-72" />
        </div>
      </article>
    );
  }

  const headerDescription = `${strings.auditDetail.dateLabel} ${formatDateTime(
    data.startedAt,
    language,
  )} · ${strings.auditDetail.pagesVisitedLabel} ${data.pagesVisited}`;

  return (
    <article>
      <PageHeader
        title={hostnameOf(data.siteUrl)}
        description={headerDescription}
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
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {SEVERITIES.map((severity, slot) => (
          <div
            key={severity}
            style={{ animationDelay: `${slot * 50}ms` }}
            className="animate-page-in"
          >
            <KpiTile
              label={strings.common.severityLabels[severity]}
              value={data.severityRollup[severity]}
              tone={
                severity === 'critical' && data.severityRollup.critical > 0 ? 'critical' : 'default'
              }
            />
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-col gap-6">
        <ReportsCard detail={data} />
        <EnrichmentCard
          auditId={data.auditId}
          manualFields={data.manualFields ?? null}
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
