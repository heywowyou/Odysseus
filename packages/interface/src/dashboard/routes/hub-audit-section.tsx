import { useState } from 'react';
import type { JSX } from 'react';
import { Link } from 'react-router';
import { useApi } from '../lib/use-api';
import { Badge } from '../components/ui/badge';
import type { BadgeTone } from '../components/ui/badge';
import { buttonStyles } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { SegmentedControl } from '../components/ui/segmented';
import { Select } from '../components/ui/select';
import { useI18n } from '../i18n/provider';
import { vocabularyLabel } from '../lib/vocabulary';
import { formatDateTime } from '../lib/format';
import { findPublisherIdentificationFinding, isReportStageFailure } from './audit-detail-model';
import { FailureCard } from './audit-reports-section';
import { FindingsCard, PublisherIdentificationAlert } from './audit-findings-section';
import type { AuditDetailResponse } from './audit-detail-types';
import type { ProspectDetailResponse } from './prospects-model';

type SeverityKey = 'critical' | 'serious' | 'moderate' | 'minor';

const SEVERITY_TONES: Record<SeverityKey, BadgeTone> = {
  critical: 'critical',
  serious: 'serious',
  moderate: 'moderate',
  minor: 'minor',
};

const SEVERITY_KEYS: readonly SeverityKey[] = ['critical', 'serious', 'moderate', 'minor'];

/** One picker entry: an audit identity plus the creating job's type, or
 *  the tolerance fallback derived from the singular detail field. */
interface HubAuditChoice {
  auditId: string;
  startedAt: string;
  jobType: string | null;
}

function auditChoices(detail: ProspectDetailResponse): HubAuditChoice[] {
  if (detail.outreachAudits !== undefined) return detail.outreachAudits;
  // A cached or fixture payload may predate the list field.
  const newest = detail.outreachAudit;
  return newest == null
    ? []
    : [{ auditId: newest.auditId, startedAt: newest.startedAt, jobType: null }];
}

function jobTypeLabel(
  jobType: string | null,
  strings: ReturnType<typeof useI18n>['strings'],
): string | null {
  if (jobType === 'full-audit') return strings.common.typeLabels.fullAudit;
  if (jobType === 'outreach-full-scan') return strings.common.typeLabels.outreachFullScan;
  return null;
}

/** The hub's third section (plan 042 slice 2): the audit itself, not a
 *  link to it. The chosen audit renders the same findings the audit page
 *  renders - the very components (FindingsCard, the publisher alert, the
 *  report-stage failure card), fed from the audit's own endpoint - under
 *  the severity badges and stage line the section always showed. A picker
 *  appears once the hotel has more than one audit, newest first. */
export function HubAuditSection(props: { detail: ProspectDetailResponse }): JSX.Element {
  const { detail } = props;
  const { strings, language } = useI18n();

  const choices = auditChoices(detail);
  // Default to the newest audit; the selection is view state only.
  const [pickedAuditId, setPickedAuditId] = useState<string | null>(null);
  const selected = choices.find((choice) => choice.auditId === pickedAuditId) ?? choices[0] ?? null;

  const auditState = useApi<AuditDetailResponse>(
    selected === null ? null : `/api/audits/${encodeURIComponent(selected.auditId)}`,
  );
  const [expandedFindingId, setExpandedFindingId] = useState<string | null>(null);

  const auditData = auditState.data;
  const publisherIdentificationFinding =
    auditData !== undefined ? findPublisherIdentificationFinding(auditData.findings) : undefined;
  // The rollup rides on the detail payload; until it loads, the newest
  // audit's totals from the prospect detail are the same numbers.
  const severityRollup =
    auditData?.severityRollup ??
    (selected !== null && selected.auditId === detail.outreachAudit?.auditId
      ? detail.outreachAudit?.severityRollup
      : undefined);

  const pickerLabel = (choice: HubAuditChoice): string => {
    const kind = jobTypeLabel(choice.jobType, strings);
    const date = formatDateTime(choice.startedAt, language);
    return kind === null ? date : `${date} · ${kind}`;
  };

  return (
    <Card title={strings.hub.steps.audit}>
      {detail.outreachScanJobId != null ? (
        <div className="mb-4 flex flex-wrap items-center gap-3" role="status">
          <span className="text-sm font-medium text-ink">{strings.hub.audit.running}</span>
          <Link
            to={`/scans/${encodeURIComponent(detail.outreachScanJobId)}`}
            className={buttonStyles('secondary', 'sm')}
          >
            {strings.hub.primary.seeProgress}
          </Link>
        </div>
      ) : null}

      {choices.length > 3 ? (
        <Select
          className="mb-4 max-w-md"
          aria-label={strings.hub.audit.pickerLabel}
          value={selected?.auditId ?? ''}
          onChange={(event) => {
            setPickedAuditId(event.target.value);
          }}
        >
          {choices.map((choice) => (
            <option key={choice.auditId} value={choice.auditId}>
              {pickerLabel(choice)}
            </option>
          ))}
        </Select>
      ) : choices.length > 1 ? (
        <div className="mb-4">
          <SegmentedControl
            ariaLabel={strings.hub.audit.pickerLabel}
            value={selected?.auditId ?? ''}
            onValueChange={setPickedAuditId}
            options={choices.map((choice) => ({
              value: choice.auditId,
              label: pickerLabel(choice),
            }))}
          />
        </div>
      ) : null}

      {selected !== null ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {severityRollup !== undefined
              ? SEVERITY_KEYS.map((severity) => (
                  <Badge key={severity} tone={SEVERITY_TONES[severity]}>
                    {strings.common.severityLabels[severity]} {severityRollup[severity]}
                  </Badge>
                ))
              : null}
            <span className="text-xs text-ink-muted">
              {formatDateTime(selected.startedAt, language)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {auditData !== undefined ? (
              <span className="text-sm text-ink-soft">
                {strings.hub.audit.stageLabel}:{' '}
                {vocabularyLabel(
                  strings.auditDetail.lifecycle,
                  auditData.lifecycle,
                  strings.common.vocabularyFallback,
                )}
              </span>
            ) : null}
            <Link
              to={`/audits/${encodeURIComponent(selected.auditId)}`}
              className={buttonStyles('secondary', 'sm')}
            >
              {strings.hub.audit.openAudit}
            </Link>
            <span className="text-xs text-ink-muted">{strings.hub.audit.standaloneHint}</span>
          </div>

          {auditState.error !== undefined && auditData === undefined ? (
            <p className="text-sm text-ink-soft">{strings.common.requestFailed}</p>
          ) : auditData === undefined ? (
            <p className="text-sm text-ink-muted">{strings.common.loading}</p>
          ) : (
            <>
              {isReportStageFailure({
                failure: auditData.failure,
                lifecycle: auditData.lifecycle,
              }) && auditData.failure !== undefined ? (
                <FailureCard failure={auditData.failure} lifecycle={auditData.lifecycle} />
              ) : null}
              {publisherIdentificationFinding !== undefined ? (
                <PublisherIdentificationAlert
                  finding={publisherIdentificationFinding}
                  onRevealFinding={() =>
                    setExpandedFindingId(publisherIdentificationFinding.findingId)
                  }
                />
              ) : null}
              <FindingsCard
                findings={auditData.findings}
                ruleCopy={auditData.ruleCopy}
                language={language}
                expandedFindingId={expandedFindingId}
                onExpandedFindingChange={setExpandedFindingId}
              />
            </>
          )}
        </div>
      ) : detail.outreachScanJobId == null ? (
        <p className="text-sm text-ink-muted">{strings.hub.audit.empty}</p>
      ) : null}
    </Card>
  );
}
