import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { toast } from 'sonner';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { useI18n } from '../i18n/provider';
import { ApiError, fetchJsonValidated, sendJson } from '../lib/api';
import { reportQualitySchema } from '../lib/api-schemas';
import type { ReportQualityResponse } from '../lib/api-types';

type ReportQualityRunState = NonNullable<ReportQualityResponse['run']>['state'];
const REPORT_QUALITY_TIMEOUT_MS = 20 * 60 * 1000;

function isDecisionState(
  state: ReportQualityRunState | undefined,
): state is 'needs-operator-review' | 'failed' {
  return state === 'needs-operator-review' || state === 'failed';
}

function pdfHref(auditId: string, bundleDigest: string, language: 'fr' | 'en'): string {
  return `/api/audits/${encodeURIComponent(auditId)}/report-quality/${encodeURIComponent(bundleDigest)}/${language}`;
}

export function ReportQualityReviewCard(props: {
  auditId: string;
  onBusy: (active: boolean) => void;
  refresh: () => void;
}): JSX.Element | null {
  const { auditId, onBusy, refresh } = props;
  const { strings } = useI18n();
  const copy = strings.auditDetail.reportQuality;
  const [quality, setQuality] = useState<ReportQualityResponse | undefined>();
  const [isBusy, setIsBusy] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      try {
        const response = await fetchJsonValidated(
          `/api/audits/${encodeURIComponent(auditId)}/report-quality`,
          reportQualitySchema,
          signal === undefined ? {} : { signal },
        );
        setQuality(response);
      } catch (error) {
        // The audit detail remains useful when this additive review endpoint is
        // unavailable (for example for a legacy audit). The API's attention row
        // still points to the audit, and a later refresh can retry this read.
        if (error instanceof ApiError && error.status === 404) return;
      }
    },
    [auditId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const run = quality?.run ?? null;
  const candidate = quality?.candidate ?? null;
  const needsReview = isDecisionState(run?.state);
  const awaitingApproval = candidate?.state === 'awaiting-operator-approval';
  const alreadyApproved = candidate?.state === 'operator-approved';
  if (!needsReview && !awaitingApproval && !alreadyApproved) return null;

  const status = needsReview ? run?.state : candidate?.state;
  const statusLabel =
    status === 'needs-operator-review' ||
    status === 'failed' ||
    status === 'awaiting-operator-approval' ||
    status === 'operator-approved' ||
    status === 'promoted'
      ? copy.statuses[status]
      : '';
  const issues = run?.issues ?? [];

  const runAgain = async (): Promise<void> => {
    setIsBusy(true);
    onBusy(true);
    try {
      await sendJson(
        `/api/audits/${encodeURIComponent(auditId)}/report-quality`,
        'POST',
        {},
        { timeoutMs: REPORT_QUALITY_TIMEOUT_MS },
      );
      toast.success(copy.rerunSuccess);
      await load();
      refresh();
    } catch (error) {
      toast.error(copy.actionError, {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsBusy(false);
      onBusy(false);
    }
  };

  const approve = async (): Promise<void> => {
    if (candidate === null) return;
    setIsBusy(true);
    onBusy(true);
    try {
      await sendJson(`/api/audits/${encodeURIComponent(auditId)}/report-quality/approve`, 'POST', {
        qualityRunId: candidate.qualityRunId,
        epoch: candidate.epoch,
        bundleDigest: candidate.bundleDigest,
      });
      toast.success(copy.approveSuccess);
      await load();
      refresh();
    } catch (error) {
      toast.error(copy.actionError, {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsBusy(false);
      onBusy(false);
    }
  };

  return (
    <Card title={copy.heading} description={copy.description}>
      <div className="flex flex-col gap-4 text-[13px]">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={needsReview ? 'serious' : 'accent'}>{statusLabel}</Badge>
          {run?.errorCode !== undefined ? (
            <code className="text-xs text-ink-muted">{run.errorCode}</code>
          ) : null}
        </div>

        {needsReview ? (
          <section aria-label={copy.issuesHeading} className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-ink">{copy.issuesHeading}</h3>
            {issues.length === 0 ? (
              <p className="text-ink-muted">{copy.noIssues}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {issues.map((issue) => (
                  <li key={issue.issueId} className="rounded-lg border border-line bg-raised p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={issue.severity === 'blocking' ? 'critical' : 'serious'}>
                        {issue.severity}
                      </Badge>
                      <span className="font-medium text-ink">{issue.target}</span>
                    </div>
                    <p className="mt-1 text-ink-muted">
                      {copy.reasonLabel} : {issue.reason}
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {copy.repairLabel} : <code>{issue.repairRoute}</code>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {candidate !== null && (awaitingApproval || alreadyApproved) ? (
          <section className="flex flex-col gap-2 rounded-lg border border-line bg-raised p-3">
            <h3 className="text-sm font-semibold text-ink">{copy.candidateHeading}</h3>
            <p className="break-all text-xs text-ink-muted">
              {copy.candidateDigestLabel} : <code>{candidate.bundleDigest}</code>
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                className="text-sm text-accent-bright underline-offset-2 hover:underline"
                href={pdfHref(auditId, candidate.bundleDigest, 'fr')}
                target="_blank"
                rel="noreferrer"
              >
                {copy.frenchPdf}
              </a>
              <a
                className="text-sm text-accent-bright underline-offset-2 hover:underline"
                href={pdfHref(auditId, candidate.bundleDigest, 'en')}
                target="_blank"
                rel="noreferrer"
              >
                {copy.englishPdf}
              </a>
            </div>
            {alreadyApproved ? <p className="text-ink-muted">{copy.approvedNotice}</p> : null}
          </section>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {needsReview ? (
            <Button size="sm" isLoading={isBusy} onClick={() => void runAgain()}>
              {copy.rerunButton}
            </Button>
          ) : null}
          {awaitingApproval ? (
            <Button size="sm" isLoading={isBusy} onClick={() => void approve()}>
              {copy.approveButton}
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
