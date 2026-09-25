/** Launching a scan from the recommended or actions panel, and the refusal
 *  notice shown beside the button that asked (issues #390, #532). */

import { useState } from 'react';
import type { JSX } from 'react';
import { Link } from 'react-router';
import { sendJson } from '../../lib/api';
import { scanRefusalNotice } from '../prospect-hub-detail-model';
import type { ProspectDetailShared } from './shared';

export function useScanLauncher(shared: ProspectDetailShared) {
  const { prospect, copy, strings, navigate, setOutreachBusy, primaryWebsite } = shared;
  // Issue #390: a scan refusal shows next to the scan buttons, with the job
  // that holds the site when the server names it.
  const [scanNotice, setScanNotice] = useState<{
    message: string;
    jobId?: string;
    from: 'recommended' | 'actions';
  } | null>(null);

  const launchScan = async (
    type: 'quick-check' | 'full-audit',
    from: 'recommended' | 'actions',
  ): Promise<void> => {
    if (!primaryWebsite) return;
    setOutreachBusy(`scan-${type}`);
    setScanNotice(null);
    try {
      const result = await sendJson<{
        started?: boolean;
        jobId?: string;
        refusal?: string;
        conflictingJobId?: string;
      }>('/api/scans', 'POST', {
        type,
        url: primaryWebsite.url,
        options: { prospectId: prospect.prospectId },
      });
      if (result.jobId) {
        void navigate(`/scans/${result.jobId}`);
      } else {
        setScanNotice({
          from,
          message: scanRefusalNotice(copy, strings.common.vocabularyFallback, result.refusal),
          ...(result.conflictingJobId === undefined ? {} : { jobId: result.conflictingJobId }),
        });
      }
    } catch {
      setScanNotice({ from, message: copy.actionFailed });
    } finally {
      setOutreachBusy(null);
    }
  };

  const renderScanNotice = (from: 'recommended' | 'actions'): JSX.Element | null =>
    scanNotice === null || scanNotice.from !== from ? null : (
      <p className="mt-2 text-sm text-ink-muted" role="status">
        {scanNotice.message}
        {scanNotice.jobId === undefined ? null : (
          <>
            {' '}
            <Link
              className="font-medium text-ink underline"
              to={`/scans/${encodeURIComponent(scanNotice.jobId)}`}
            >
              {copy.viewRunningScan}
            </Link>
          </>
        )}
      </p>
    );

  return { launchScan, renderScanNotice };
}

export type ScanLauncher = ReturnType<typeof useScanLauncher>;
