/** Every action: scans, outreach steps, outcome, status correction and
 *  permanent deletion (issue #532). */

import type { JSX } from 'react';
import { Trash2 } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Card } from '../../components/ui/card';
import { Select } from '../../components/ui/select';
import { Button } from '../../components/ui/button';
import { label, STATUSES, OUTCOMES } from './types';
import type { ProspectDetailShared } from './shared';
import type { OutreachActions } from './use-outreach-actions';
import type { ScanLauncher } from './use-scan-launcher';
import type { LifecycleActions } from './use-lifecycle-actions';

export function ActionsPanel(props: {
  shared: ProspectDetailShared;
  outreach: OutreachActions;
  scan: ScanLauncher;
  lifecycle: LifecycleActions;
}): JSX.Element {
  const {
    prospect,
    copy,
    outreachBusy,
    gateFor,
    gateReason,
    primaryWebsite,
    livePreview,
    recommendation,
  } = props.shared;
  const {
    publishPreview,
    runFirstEmail,
    runFollowUp,
    requestOutcome,
    requestStatusChange,
    revokePreview,
  } = props.outreach;
  const { launchScan, renderScanNotice } = props.scan;
  const { lifecycleBusy, requestPermanentDelete } = props.lifecycle;
  return (
    <Card id="actions">
      <details
        open={
          recommendation?.action === 'review-prospect' ||
          recommendation?.action === 'record-outcome'
        }
      >
        <summary className="cursor-pointer text-sm font-semibold text-ink">
          {copy.allActions}
        </summary>
        <div className="mt-4 grid gap-5">
          <div>
            <p className="text-sm font-medium text-ink">{copy.actions}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!primaryWebsite || outreachBusy !== null}
                isLoading={outreachBusy === 'scan-quick-check'}
                onClick={() => void launchScan('quick-check', 'actions')}
              >
                {copy.quick}
              </Button>
              <Button
                size="sm"
                disabled={!primaryWebsite || outreachBusy !== null}
                isLoading={outreachBusy === 'scan-full-audit'}
                onClick={() => void launchScan('full-audit', 'actions')}
              >
                {copy.fullAudit}
              </Button>
            </div>
            {renderScanNotice('actions')}
          </div>
          <div className="border-t border-line pt-4">
            <p className="text-sm font-medium text-ink">{copy.outreach}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {(
                [
                  ['preview', copy.preview],
                  ['first-email', copy.firstEmail],
                  ['follow-up', copy.followUp],
                ] as const
              ).map(([key, title]) => {
                const action = gateFor(key);
                const available = action?.state === 'available';
                return (
                  <div key={key} className="rounded-lg border border-line px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span>{title}</span>
                      <Badge tone={available ? 'accent' : 'neutral'}>
                        {available ? copy.ready : copy.blocked}
                      </Badge>
                    </div>
                    {!available ? (
                      <p className="mt-1 text-xs text-ink-muted">{gateReason(key)}</p>
                    ) : null}
                    {key === 'preview' && livePreview !== undefined ? (
                      <Button
                        className="mt-2 mr-2"
                        size="sm"
                        variant="ghost"
                        disabled={outreachBusy !== null}
                        isLoading={outreachBusy === `revoke-${livePreview.previewId}`}
                        onClick={() => void revokePreview(livePreview.previewId)}
                      >
                        {copy.revokePreview}
                      </Button>
                    ) : null}
                    <Button
                      className="mt-2"
                      size="sm"
                      variant="secondary"
                      disabled={!available || outreachBusy !== null}
                      isLoading={outreachBusy === key}
                      onClick={() =>
                        void (key === 'preview'
                          ? publishPreview()
                          : key === 'first-email'
                            ? runFirstEmail()
                            : runFollowUp())
                      }
                    >
                      {key === 'preview' ? copy.publishPreview : title}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
          <div id="outcome" className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <Select
              value=""
              disabled={outreachBusy !== null}
              onChange={(event) => {
                if (event.target.value) requestOutcome(event.target.value);
              }}
              aria-label={copy.outcome}
            >
              <option value="">{copy.outcome}</option>
              {OUTCOMES.map((outcome) => (
                <option key={outcome} value={outcome}>
                  {label(outcome, copy.outcomeLabels)}
                </option>
              ))}
            </Select>
          </div>
          <details className="border-t border-line pt-4">
            <summary className="cursor-pointer text-sm font-medium text-ink">
              {copy.statusCorrection}
            </summary>
            <p className="mt-2 text-xs text-ink-muted">{copy.statusCorrectionHint}</p>
            <div className="mt-2 max-w-xs">
              <Select
                value={prospect.status}
                disabled={outreachBusy !== null}
                onChange={(event) => requestStatusChange(event.target.value)}
                aria-label={copy.statusAria}
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {label(status, copy.statusLabels)}
                  </option>
                ))}
              </Select>
            </div>
          </details>
          <details className="border-t border-line pt-4">
            <summary className="cursor-pointer text-sm font-medium text-danger">
              {copy.dangerZone}
            </summary>
            <p className="mt-2 text-xs text-ink-muted">{copy.deletePermanentlyHint}</p>
            <Button
              className="mt-2"
              variant="danger"
              isLoading={lifecycleBusy}
              onClick={() => void requestPermanentDelete()}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              {copy.deletePermanently}
            </Button>
          </details>
        </div>
      </details>
    </Card>
  );
}
