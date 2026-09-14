import { useState } from 'react';
import type { JSX } from 'react';
import { Link } from 'react-router';
import { useApi } from '../lib/use-api';
import { Badge } from '../components/ui/badge';
import type { BadgeTone } from '../components/ui/badge';
import { Button, buttonStyles } from '../components/ui/button';
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
import { auditChoices, type HubAuditChoice } from './hub-model';
import type { ProspectDetailResponse } from './prospects-model';

type SeverityKey = 'critical' | 'serious' | 'moderate' | 'minor';

const SEVERITY_TONES: Record<SeverityKey, BadgeTone> = {
  critical: 'critical',
  serious: 'serious',
  moderate: 'moderate',
  minor: 'minor',
};

const SEVERITY_KEYS: readonly SeverityKey[] = ['critical', 'serious', 'moderate', 'minor'];

// Issue #216: the four audit-producing job types are distinct pipelines
// with distinct semantics (a Light audit is not hotel-prescan evidence,
// full-audit is not outreach evidence) and must read as distinct labels
// here, the same four the Audits list page's own typeBadge already
// distinguishes - a picker entry naming only two of the four silently
// hid which pipeline actually produced the rest.
function jobTypeLabel(
  jobType: string | null,
  strings: ReturnType<typeof useI18n>['strings'],
): string | null {
  if (jobType === 'full-audit') return strings.common.typeLabels.fullAudit;
  if (jobType === 'outreach-full-scan') return strings.common.typeLabels.outreachFullScan;
  if (jobType === 'hotel-prescan') return strings.common.typeLabels.hotelPrescan;
  if (jobType === 'prospecting') return strings.common.typeLabels.prospecting;
  return null;
}

/** The hub's third section (plan 042 slice 2): the audit itself, not a
 *  link to it. The chosen audit renders the same findings the audit page
 *  renders - the very components (FindingsCard, the publisher alert, the
 *  report-stage failure card), fed from the audit's own endpoint - under
 *  the severity badges and stage line the section always showed. A picker
 *  appears once the hotel has more than one audit, newest first; which
 *  audit is open lives in the page so the Rapport client tab shows the
 *  same one. Until the hotel is sold, a one-line link reveals the paid
 *  chain's tab anyway (plan 042 slice 3) - view state only, nothing
 *  stored. */
export function HubAuditSection(props: {
  detail: ProspectDetailResponse;
  /** The audit this tab renders, chosen in the page. */
  auditId: string | null;
  onPickAudit: (auditId: string) => void;
  /** Plan 044: the paid deliverable scan's launch, owned by the page
   *  (it navigates to the new job on success). */
  onLaunchFullAudit?: () => void;
}): JSX.Element {
  const { detail, auditId, onPickAudit, onLaunchFullAudit } = props;
  const { strings, language } = useI18n();

  const choices = auditChoices(detail);
  const selected = choices.find((choice) => choice.auditId === auditId) ?? choices[0] ?? null;

  // Issue #182: the same refusal the confirm dialog would surface only
  // after the operator clicks through, shown as page text beforehand.
  const fullAuditRefusal =
    detail.fullAudit !== undefined && !detail.fullAudit.canStart && detail.fullAudit.refusal
      ? (strings.hub.audit.launchRefusals[
          detail.fullAudit.refusal as keyof typeof strings.hub.audit.launchRefusals
        ] ?? strings.hub.scanRefusedLabel)
      : undefined;
  // Plan 045 section 2.5: the in-flight refusal is actionable, so it links
  // to the running job instead of only naming the reason.
  const fullAuditInFlightJobId =
    detail.fullAudit !== undefined &&
    !detail.fullAudit.canStart &&
    detail.fullAudit.refusal === 'already-in-flight'
      ? detail.fullAudit.jobId
      : undefined;

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
            onPickAudit(event.target.value);
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
            onValueChange={onPickAudit}
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
            {onLaunchFullAudit !== undefined ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={onLaunchFullAudit}
                disabled={fullAuditRefusal !== undefined}
              >
                {strings.hub.audit.launchFullAudit}
              </Button>
            ) : null}
            <span className="text-xs text-ink-muted">{strings.hub.audit.standaloneHint}</span>
          </div>
          {fullAuditRefusal !== undefined ? (
            <p className="flex flex-wrap items-center gap-2 text-sm text-ink-soft" role="note">
              {fullAuditRefusal}
              {fullAuditInFlightJobId !== undefined ? (
                <Link
                  to={`/scans/${encodeURIComponent(fullAuditInFlightJobId)}`}
                  className={buttonStyles('secondary', 'sm')}
                >
                  {strings.hub.primary.seeProgress}
                </Link>
              ) : null}
            </p>
          ) : null}

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
