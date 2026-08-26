import { applyStrings } from './i18n-apply.js';
import {
  escapeHtml,
  fetchJson,
  severityBadgesHtml,
  showError,
  type SeverityRollup,
} from './app-shared.js';

const strings = applyStrings();

const POLL_INTERVAL_MS = 1500;

const params = new URLSearchParams(window.location.search);
const jobId = params.get('job');

const twoPhase = document.getElementById('two-phase')!;
const crawlBar = document.getElementById('crawl-bar')!;
const crawlEta = document.getElementById('crawl-eta')!;
const scanBar = document.getElementById('scan-bar')!;
const scanEta = document.getElementById('scan-eta')!;
const phaseStatus = document.getElementById('phase-status')!;
const urlResultsList = document.getElementById('url-results')!;
const resultCard = document.getElementById('result-card')!;
const resultHeading = document.getElementById('result-heading')!;
const resultRollup = document.getElementById('result-rollup')!;
const resultLink = document.getElementById('result-link') as HTMLAnchorElement;

type Phase =
  | 'queued'
  | 'crawl'
  | 'scan'
  | 'normalize'
  | 'analyze-fr'
  | 'analyze-en'
  | 'report-fr'
  | 'report-en'
  | 'scanning'
  | 'complete'
  | 'failed';

interface JobStatusResponse {
  jobId: string;
  type: 'full-audit' | 'prospecting';
  status: 'queued' | 'running' | 'complete' | 'failed';
  phase: Phase;
  auditId?: string;
  urlResults?: { url: string; status: string }[];
  progress: {
    crawl?: { visited: number; target: number; etaMs?: number };
    scan?: { scanned: number; target: number; etaMs?: number };
    message?: string;
  };
  error?: string;
}

const LATER_PHASE_LABEL_KEYS = [
  'normalize',
  'analyze-fr',
  'analyze-en',
  'report-fr',
  'report-en',
] as const;

function formatEtaMs(ms: number | undefined): string {
  if (ms === undefined) return '';
  const minutes = Math.ceil(ms / 60_000);
  return minutes <= 1 ? '< 1 min' : `~${minutes} min`;
}

function renderFullAudit(job: JobStatusResponse): void {
  urlResultsList.hidden = true;
  const isEtaPhase = job.phase === 'queued' || job.phase === 'crawl' || job.phase === 'scan';
  twoPhase.hidden =
    !isEtaPhase &&
    !LATER_PHASE_LABEL_KEYS.includes(job.phase as (typeof LATER_PHASE_LABEL_KEYS)[number]);

  const crawl = job.progress.crawl;
  if (crawl) {
    const pct = crawl.target > 0 ? Math.min(100, (crawl.visited / crawl.target) * 100) : 0;
    crawlBar.style.width = `${pct}%`;
    crawlEta.textContent =
      job.phase === 'crawl' ? `${strings.progress.etaLabel}: ${formatEtaMs(crawl.etaMs)}` : '';
  }

  const scan = job.progress.scan;
  if (scan) {
    const pct = scan.target > 0 ? Math.min(100, (scan.scanned / scan.target) * 100) : 0;
    scanBar.style.width = `${pct}%`;
    scanEta.textContent =
      job.phase === 'scan'
        ? `${strings.progress.etaLabel}: ${formatEtaMs(scan.etaMs)} ${strings.progress.etaRoughSuffix}`
        : '';
  } else if (job.phase !== 'queued' && job.phase !== 'crawl') {
    scanBar.style.width = '100%';
  }

  if (LATER_PHASE_LABEL_KEYS.includes(job.phase as (typeof LATER_PHASE_LABEL_KEYS)[number])) {
    phaseStatus.textContent =
      strings.progress.phaseLabels[job.phase as (typeof LATER_PHASE_LABEL_KEYS)[number]];
  } else {
    phaseStatus.textContent = '';
  }
}

function renderProspecting(job: JobStatusResponse): void {
  twoPhase.hidden = true;
  urlResultsList.hidden = false;
  phaseStatus.textContent = job.progress.message ?? '';
  urlResultsList.innerHTML = (job.urlResults ?? [])
    .map((result) => {
      const badgeClass =
        result.status === 'complete'
          ? 'complete'
          : result.status === 'error'
            ? 'failed'
            : 'running';
      return `<li><span>${escapeHtml(result.url)}</span><span class="badge badge-${badgeClass}">${escapeHtml(result.status)}</span></li>`;
    })
    .join('');
}

async function renderResult(job: JobStatusResponse): Promise<void> {
  resultCard.hidden = false;

  if (job.status === 'failed') {
    resultHeading.textContent = strings.progress.failedHeading;
    resultRollup.textContent = job.error ?? '';
    resultLink.hidden = true;
    return;
  }

  resultHeading.textContent = strings.progress.completeHeading;

  if (job.type === 'full-audit' && job.auditId) {
    try {
      const detail = await fetchJson<{ severityRollup: SeverityRollup }>(
        `/api/audits/${encodeURIComponent(job.auditId)}`,
      );
      resultRollup.innerHTML = severityBadgesHtml(detail.severityRollup, strings);
    } catch {
      resultRollup.textContent = '';
    }
    resultLink.href = `/audit.html?id=${encodeURIComponent(job.auditId)}`;
    resultLink.hidden = false;
  } else {
    resultLink.hidden = true;
  }
}

async function poll(): Promise<void> {
  if (!jobId) {
    showError(strings.common.error);
    return;
  }

  try {
    const job = await fetchJson<JobStatusResponse>(`/api/scans/${encodeURIComponent(jobId)}`);

    if (job.type === 'prospecting') {
      renderProspecting(job);
    } else {
      renderFullAudit(job);
    }

    if (job.status === 'complete' || job.status === 'failed') {
      await renderResult(job);
      return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showError(message);
    return;
  }

  setTimeout(() => void poll(), POLL_INTERVAL_MS);
}

void poll();
