import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { useI18n } from '../i18n/provider';
import { fetchJson } from '../lib/api';
import { usePolling } from '../lib/use-polling';
import { AuditReportStepper } from './audit-report-stepper';
import type { AuditDetailResponse } from './audit-detail-types';

/** The hub's Rapport client tab (plan 042 slice 3): the five-step paid
 *  report chain, relocated from the audit page and shown only once the
 *  hotel is sold (or the operator reveals it manually). This is a pure
 *  relocation of the stepper the audit page renders: same component, same
 *  onBusy/refresh wiring - the page polls the audit detail every five
 *  seconds only while one of the stepper's writes is in flight, and
 *  refetches after each action. */
export function HubReportSection(props: { auditId: string | null }): JSX.Element {
  const { auditId } = props;
  const { strings } = useI18n();
  const [isBusy, setIsBusy] = useState(false);

  const path = auditId === null ? null : `/api/audits/${encodeURIComponent(auditId)}`;
  const fetcher = useCallback(async (): Promise<AuditDetailResponse> => {
    return fetchJson<AuditDetailResponse>(path ?? '');
  }, [path]);
  const { data, error, refresh } = usePolling<AuditDetailResponse>(fetcher, isBusy ? 5_000 : 0, {
    enabled: path !== null,
    key: path ?? 'none',
  });

  // Switching audits (or leaving the tab) must not leave a busy flag the
  // new audit never set - the same rule as the audit detail page.
  useEffect(() => {
    setIsBusy(false);
  }, [auditId]);

  return (
    <Card title={strings.hub.steps.report} description={strings.hub.report.description}>
      {auditId === null ? null : error !== undefined && data === undefined ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-soft">{strings.common.requestFailed}</p>
          <Button variant="secondary" size="sm" onClick={refresh} className="self-start">
            {strings.common.retry}
          </Button>
        </div>
      ) : data === undefined ? (
        <p className="text-sm text-ink-muted">{strings.common.loading}</p>
      ) : (
        <AuditReportStepper
          auditId={data.auditId}
          detail={data}
          onBusy={setIsBusy}
          refresh={refresh}
        />
      )}
    </Card>
  );
}
