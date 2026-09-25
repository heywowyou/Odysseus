/** The one recommended next step (issue #532). */

import type { JSX } from 'react';
import { Link } from 'react-router';
import { Card } from '../../components/ui/card';
import { Button, buttonStyles } from '../../components/ui/button';
import type { ProspectDetailShared } from './shared';
import type { OutreachActions } from './use-outreach-actions';
import type { ScanLauncher } from './use-scan-launcher';

export function RecommendedPanel(props: {
  shared: ProspectDetailShared;
  outreach: OutreachActions;
  scan: ScanLauncher;
}): JSX.Element {
  const {
    copy,
    strings,
    outreachBusy,
    gateFor,
    gateReason,
    primaryWebsite,
    recommendation,
    activeScan,
    terminal,
    archived,
    recommendationReason,
  } = props.shared;
  const { runFirstEmail, runFollowUp } = props.outreach;
  const { launchScan, renderScanNotice } = props.scan;

  const renderRecommendationAction = (): JSX.Element | null => {
    if (recommendation === undefined) return null;
    const actionLabel =
      copy.recommendationActions[recommendation.action] ?? strings.common.vocabularyFallback;
    const recommendationGate =
      recommendation.action === 'create-first-email'
        ? gateFor('first-email')
        : recommendation.action === 'create-follow-up'
          ? gateFor('follow-up')
          : undefined;
    const disabled =
      outreachBusy !== null ||
      (recommendation.action === 'prepare-audit' && primaryWebsite === undefined) ||
      (recommendationGate !== undefined && recommendationGate.state !== 'available');
    if (
      recommendation.action === 'prepare-audit' ||
      recommendation.action === 'create-first-email' ||
      recommendation.action === 'create-follow-up'
    ) {
      const onClick =
        recommendation.action === 'prepare-audit'
          ? () => void launchScan('full-audit', 'recommended')
          : recommendation.action === 'create-first-email'
            ? () => void runFirstEmail()
            : () => void runFollowUp();
      return (
        <Button
          onClick={onClick}
          disabled={disabled}
          isLoading={
            outreachBusy ===
            (recommendation.action === 'prepare-audit' ? 'scan-full-audit' : recommendation.action)
          }
        >
          {actionLabel}
        </Button>
      );
    }
    return (
      <Link className={buttonStyles('primary')} to={recommendation.href}>
        {actionLabel}
      </Link>
    );
  };

  return (
    <Card id="recommended" title={copy.recommended}>
      {recommendation !== undefined ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm font-medium text-ink">
            {copy.recommendationActions[recommendation.action] ?? strings.common.vocabularyFallback}
          </p>
          {recommendationReason ? (
            <p className="text-sm text-ink-muted">{recommendationReason}</p>
          ) : null}
          {recommendation.action === 'prepare-audit' && primaryWebsite === undefined ? (
            <p className="text-sm text-ink-muted">{copy.noSite}</p>
          ) : null}
          {recommendation.action === 'create-first-email' &&
          gateFor('first-email')?.state !== 'available' ? (
            <p className="text-sm text-ink-muted">{gateReason('first-email')}</p>
          ) : null}
          {recommendation.action === 'create-follow-up' &&
          gateFor('follow-up')?.state !== 'available' ? (
            <p className="text-sm text-ink-muted">{gateReason('follow-up')}</p>
          ) : null}
          {renderRecommendationAction()}
          {renderScanNotice('recommended')}
        </div>
      ) : activeScan !== undefined ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm font-medium text-ink">
            {(activeScan.status === 'queued'
              ? copy.activeScanQueued
              : copy.activeScanRunning
            ).replace(
              '{scan}',
              activeScan.scanIntent === 'quick-check' ? copy.quick : copy.fullAudit,
            )}
          </p>
          <Link
            className={buttonStyles('secondary')}
            to={`/scans/${encodeURIComponent(activeScan.jobId)}`}
          >
            {copy.viewRunningScan}
          </Link>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          {archived
            ? copy.archivedNoRecommendation
            : terminal
              ? copy.completed
              : copy.noRecommendation}
        </p>
      )}
    </Card>
  );
}
