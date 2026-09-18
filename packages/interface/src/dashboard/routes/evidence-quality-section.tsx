/**
 * The audit detail page's evidence-quality card (plan 059 step 37). Present
 * only for audits with a Plan 059 evidence graph; it renders the verdict,
 * the approval state, the blocking reasons and the contract's stages with
 * counts and states only — never raw evidence. For an audit assessed but
 * not approved, this card is the operator-facing half of the conflict guard:
 * the verdict and blocking codes explain what the client report path will
 * refuse, before any action is attempted.
 */

import type { JSX } from 'react';
import { Badge } from '../components/ui/badge';
import type { BadgeTone } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import { useI18n } from '../i18n/provider';
import {
  evidenceBlockingReasons,
  evidenceStageViews,
  evidenceVerdictTone,
  type EvidenceStageState,
} from './evidence-quality-model';
import type { AuditDetailResponse, EvidenceApprovalStateResponse } from './audit-detail-types';

const STATE_TONES: Record<EvidenceStageState, BadgeTone> = {
  complete: 'minor',
  partial: 'moderate',
  blocked: 'serious',
};

const APPROVAL_TONES: Record<EvidenceApprovalStateResponse, BadgeTone> = {
  approved: 'minor',
  missing: 'serious',
  stale: 'serious',
};

export function EvidenceQualityCard(props: { detail: AuditDetailResponse }): JSX.Element | null {
  const { detail } = props;
  const evidence = detail.evidence;
  const { language, strings } = useI18n();
  const copy = strings.auditDetail.evidenceQuality;
  if (evidence === undefined) return null;

  const stages = evidenceStageViews(
    evidence,
    { pagesVisited: detail.pagesVisited, findingsCount: detail.findings.length },
    language,
  );
  const reasons = evidenceBlockingReasons(evidence, language);

  return (
    <Card title={copy.heading} description={copy.description}>
      <div className="flex flex-col gap-4 text-[13px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ink-muted">{copy.verdictLabel}</span>
          <Badge tone={evidenceVerdictTone(evidence.verdict)}>
            {copy.verdicts[evidence.verdict]}
          </Badge>
          <span className="text-ink-muted">{copy.approvalLabel}</span>
          <Badge tone={APPROVAL_TONES[evidence.approval]}>
            {copy.approvalStates[evidence.approval]}
          </Badge>
        </div>

        <section aria-label={copy.blockingHeading} className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-ink">{copy.blockingHeading}</h3>
          {reasons.length === 0 ? (
            <p className="text-ink-muted">{copy.noBlockingReasons}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {reasons.map((reason) => (
                <li key={reason.code} className="flex flex-wrap items-baseline gap-2">
                  <span>{reason.text}</span>
                  {reason.refCount !== undefined && reason.refCount > 0 ? (
                    <span className="text-xs text-ink-muted">
                      {copy.blockingRefCount.replace('{count}', String(reason.refCount))}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label={copy.stagesHeading} className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-ink">{copy.stagesHeading}</h3>
          <ul className="flex flex-col gap-2">
            {stages.map((stage) => (
              <li key={stage.id} className="flex flex-col gap-0.5">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className={stage.state === 'blocked' ? 'font-medium text-ink' : 'text-ink'}>
                    {stage.label}
                  </span>
                  <Badge tone={STATE_TONES[stage.state]}>{copy.stageStates[stage.state]}</Badge>
                  {stage.count !== undefined ? (
                    <span className="text-xs text-ink-muted">{stage.count}</span>
                  ) : null}
                </div>
                {stage.note !== undefined ? (
                  <p className="text-xs text-ink-soft">{stage.note}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Card>
  );
}
