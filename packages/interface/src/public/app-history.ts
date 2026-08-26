import { applyStrings } from './i18n-apply.js';
import {
  escapeHtml,
  fetchJson,
  formatDate,
  severityBadgesHtml,
  showError,
  statusBadgeHtml,
  type JobStatus,
  type SeverityRollup,
} from './app-shared.js';

const strings = applyStrings();

const POLL_INTERVAL_MS = 5000;

const rowsBody = document.getElementById('history-rows')!;
const emptyState = document.getElementById('empty-state')!;

interface JobSummary {
  jobId: string;
  type: 'full-audit' | 'prospecting';
  status: JobStatus;
  phase: string;
  siteUrl?: string;
  urls?: string[];
  createdAt: string;
  auditId?: string;
  severityRollup?: SeverityRollup;
}

function siteLabel(job: JobSummary): string {
  if (job.siteUrl) return job.siteUrl;
  if (job.urls && job.urls.length > 0) return `${job.urls.length} URLs`;
  return '';
}

function detailLink(job: JobSummary): string {
  if (job.status === 'complete' && job.auditId) {
    return `/audit.html?id=${encodeURIComponent(job.auditId)}`;
  }
  return `/progress.html?job=${encodeURIComponent(job.jobId)}`;
}

function renderRows(jobs: JobSummary[]): void {
  emptyState.hidden = jobs.length > 0;
  rowsBody.innerHTML = jobs
    .map((job) => {
      const typeLabel =
        job.type === 'full-audit'
          ? strings.common.typeLabels.fullAudit
          : strings.common.typeLabels.prospecting;
      const rollup =
        job.status === 'complete' ? severityBadgesHtml(job.severityRollup, strings) : '';
      return `
        <tr>
          <td>${escapeHtml(formatDate(job.createdAt))}</td>
          <td><a href="${detailLink(job)}">${escapeHtml(siteLabel(job))}</a></td>
          <td>${escapeHtml(typeLabel)}</td>
          <td>${statusBadgeHtml(job.status, strings)}</td>
          <td>${rollup}</td>
        </tr>
      `;
    })
    .join('');
}

async function load(): Promise<void> {
  try {
    const jobs = await fetchJson<JobSummary[]>('/api/scans?limit=200');
    renderRows(jobs);

    const hasInFlight = jobs.some((job) => job.status === 'queued' || job.status === 'running');
    if (hasInFlight) setTimeout(() => void load(), POLL_INTERVAL_MS);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showError(message);
  }
}

void load();
