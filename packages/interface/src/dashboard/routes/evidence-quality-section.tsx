import { useState } from 'react';
import type { JSX } from 'react';
import { toast } from 'sonner';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { useI18n } from '../i18n/provider';
import { sendDelete, sendJson } from '../lib/api';
import { formatDateTime } from '../lib/format';
import {
  evidenceLimitationViews,
  evidenceOperationalWarningViews,
  evidenceStatusTone,
} from './evidence-quality-model';
import type { AuditDetailResponse } from './audit-detail-types';

/** The failure card scrolls here to reach the blocked-pages acceptance. */
export const EVIDENCE_QUALITY_ANCHOR = 'audit-evidence-quality';

export function EvidenceQualityCard(props: {
  detail: AuditDetailResponse;
  onBusy: (active: boolean) => void;
  refresh: () => void;
}): JSX.Element | null {
  const { detail, onBusy, refresh } = props;
  const evidence = detail.evidence;
  const { language, strings } = useI18n();
  const copy = strings.auditDetail.evidenceQuality;
  const [isSaving, setIsSaving] = useState(false);
  if (evidence === undefined) return null;

  const blockedPageUrls = evidence.blockedPageUrls ?? [];
  const canAccept =
    evidence.reportBlocked === true && evidence.blockedPagesAcknowledgeable === true;
  const acceptedAt = evidence.blockedPagesAcknowledgedAt;
  const endpoint = `/api/audits/${encodeURIComponent(detail.auditId)}/blocked-pages-acknowledgment`;

  const run = async (
    action: () => Promise<unknown>,
    success: string,
    failure: string,
  ): Promise<void> => {
    setIsSaving(true);
    onBusy(true);
    try {
      await action();
      toast.success(success);
      refresh();
    } catch (error) {
      toast.error(failure, { description: error instanceof Error ? error.message : undefined });
    } finally {
      setIsSaving(false);
      onBusy(false);
    }
  };

  const limitations = evidenceLimitationViews(evidence, language);
  const warnings = evidenceOperationalWarningViews(evidence, language);

  return (
    <Card id={EVIDENCE_QUALITY_ANCHOR} title={copy.heading} description={copy.description}>
      <div className="flex flex-col gap-4 text-[13px]">
        {evidence.reportBlocked === true ? (
          <p className="rounded-md border border-severity-critical/30 bg-severity-critical/5 p-3 font-medium text-severity-critical">
            {copy.reportBlocked}
          </p>
        ) : null}
        {(canAccept || acceptedAt !== undefined) && blockedPageUrls.length > 0 ? (
          <section aria-label={copy.blockedPagesHeading} className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-ink">{copy.blockedPagesHeading}</h3>
            <ul className="flex flex-col gap-0.5 font-mono text-xs text-ink-soft">
              {blockedPageUrls.map((url) => (
                <li key={url} className="break-all">
                  {url}
                </li>
              ))}
            </ul>
            {canAccept ? (
              <>
                <p className="text-ink-soft">{copy.blockedPagesAcceptHint}</p>
                <div>
                  <Button
                    size="sm"
                    isLoading={isSaving}
                    onClick={() =>
                      void run(
                        () => sendJson(endpoint, 'PUT', { blockedPageUrls }),
                        copy.blockedPagesAcceptSuccess,
                        copy.blockedPagesAcceptError,
                      )
                    }
                  >
                    {copy.blockedPagesAcceptButton}
                  </Button>
                </div>
              </>
            ) : acceptedAt !== undefined ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-ink-soft">
                  {copy.blockedPagesAcceptedNote.replace(
                    '{date}',
                    formatDateTime(acceptedAt, language),
                  )}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  isLoading={isSaving}
                  onClick={() =>
                    void run(
                      () => sendDelete(endpoint),
                      copy.blockedPagesWithdrawSuccess,
                      copy.blockedPagesWithdrawError,
                    )
                  }
                >
                  {copy.blockedPagesWithdrawButton}
                </Button>
              </div>
            ) : null}
          </section>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ink-muted">{copy.statusLabel}</span>
          <Badge tone={evidenceStatusTone(evidence.status)}>{copy.statuses[evidence.status]}</Badge>
        </div>

        <section aria-label={copy.limitationsHeading} className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-ink">{copy.limitationsHeading}</h3>
          {limitations.length === 0 ? (
            <p className="text-ink-muted">
              {evidence.status === 'unavailable' ? copy.unavailableLimitations : copy.noLimitations}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {limitations.map((limitation) => (
                <li key={limitation.code} className="flex flex-col gap-0.5">
                  <span>{limitation.text}</span>
                  {limitation.refCount > 0 ? (
                    <span className="text-xs text-ink-muted">
                      {copy.referenceCount.replace('{count}', String(limitation.refCount))}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {warnings.length > 0 ? (
          <section aria-label={copy.operationalHeading} className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-ink">{copy.operationalHeading}</h3>
            <ul className="flex flex-col gap-2">
              {warnings.map((warning) => (
                <li key={warning.code} className="flex flex-col gap-0.5">
                  <span>{warning.text}</span>
                  {warning.refCount > 0 ? (
                    <span className="text-xs text-ink-muted">
                      {copy.referenceCount.replace('{count}', String(warning.refCount))}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Card>
  );
}
