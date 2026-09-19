import type { JSX } from 'react';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import { useI18n } from '../i18n/provider';
import {
  evidenceLimitationViews,
  evidenceOperationalWarningViews,
  evidenceStatusTone,
} from './evidence-quality-model';
import type { AuditDetailResponse } from './audit-detail-types';

export function EvidenceQualityCard(props: { detail: AuditDetailResponse }): JSX.Element | null {
  const evidence = props.detail.evidence;
  const { language, strings } = useI18n();
  const copy = strings.auditDetail.evidenceQuality;
  if (evidence === undefined) return null;

  const limitations = evidenceLimitationViews(evidence, language);
  const warnings = evidenceOperationalWarningViews(evidence, language);

  return (
    <Card title={copy.heading} description={copy.description}>
      <div className="flex flex-col gap-4 text-[13px]">
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
