import type { JSX } from 'react';
import { Link } from 'react-router';
import { useApi } from '../lib/use-api';
import { Badge } from '../components/ui/badge';
import type { BadgeTone } from '../components/ui/badge';
import { buttonStyles } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { useI18n } from '../i18n/provider';
import { vocabularyLabel } from '../lib/vocabulary';
import { formatDateTime } from '../lib/format';
import type { HubAuditReportState } from './hub-model';
import type { ProspectDetailResponse } from './prospects-model';

type SeverityKey = 'critical' | 'serious' | 'moderate' | 'minor';

const SEVERITY_TONES: Record<SeverityKey, BadgeTone> = {
  critical: 'critical',
  serious: 'serious',
  moderate: 'moderate',
  minor: 'minor',
};

const SEVERITY_KEYS: readonly SeverityKey[] = ['critical', 'serious', 'moderate', 'minor'];

/** The hub's third section: the prospecting audit's severity totals, its
 *  client-report stage, a link to the audit page, and live progress while
 *  a scan runs (approved IA, section 3). The report stage comes from the
 *  audit's own endpoint, fetched only when an audit exists; the page's
 *  conditional poll keeps the running state fresh. */
export function HubAuditSection(props: { detail: ProspectDetailResponse }): JSX.Element {
  const { detail } = props;
  const { strings, language } = useI18n();

  const audit = detail.outreachAudit ?? null;
  const reportState = useApi<HubAuditReportState>(
    audit === null ? null : `/api/audits/${encodeURIComponent(audit.auditId)}`,
  );

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

      {audit !== null ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {SEVERITY_KEYS.map((severity) => (
              <Badge key={severity} tone={SEVERITY_TONES[severity]}>
                {strings.common.severityLabels[severity]} {audit.severityRollup[severity]}
              </Badge>
            ))}
            <span className="text-xs text-ink-muted">
              {formatDateTime(audit.startedAt, language)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {reportState.data !== undefined ? (
              <span className="text-sm text-ink-soft">
                {strings.hub.audit.stageLabel}:{' '}
                {vocabularyLabel(
                  strings.auditDetail.lifecycle,
                  reportState.data.lifecycle,
                  strings.common.vocabularyFallback,
                )}
              </span>
            ) : null}
            <Link
              to={`/audits/${encodeURIComponent(audit.auditId)}`}
              className={buttonStyles('secondary', 'sm')}
            >
              {strings.hub.audit.openAudit}
            </Link>
          </div>
        </div>
      ) : detail.outreachScanJobId == null ? (
        <p className="text-sm text-ink-muted">{strings.hub.audit.empty}</p>
      ) : null}
    </Card>
  );
}
