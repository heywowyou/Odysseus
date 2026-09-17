import type { CoverageSegment } from '../components/ui/coverage-bar';
import type { DashboardStrings } from '../i18n/types';
import type { JobStatus, ScanJobDetail } from '../lib/api-types';
import { reportFailureStage } from '../lib/job-outcome';
import {
  AFTER_CONTENT_PHASES,
  AFTER_LIGHTHOUSE_PHASES,
  PHASE_KEYS,
  type ProgressPhase,
} from '../lib/phase-order.js';

/** Phase values come from the checked-in pipeline order fixture via
 *  lib/phase-order.ts. Unknown values render as their raw value so a new
 *  pipeline phase never becomes a blank line. */
export type { ProgressPhase };

export type ProgressPhaseLabels = DashboardStrings['progress']['phaseLabels'];

export function isKnownPhase(phase: string): phase is ProgressPhase {
  return (PHASE_KEYS as readonly string[]).includes(phase);
}

/** Issue #187: the coverage gate's own failure text
 *  (packages/core/src/crawl-coverage-gate.ts) names the crawl delay and
 *  scan concurrency fields on /scans/new as the remedy, with no link to
 *  them; this detects that specific message by its stable phrasing so the
 *  failure card can add one. Detection only, never a rewrite of the
 *  message itself. */
export function isCoverageGateFailure(error: string | undefined): boolean {
  return error !== undefined && error.includes('crawl delay and scan concurrency');
}

/** Current phase as operator copy; an unknown phase falls back to its raw
 *  value so the status line never goes blank. */
export function currentPhaseLabel(phase: string, labels: ProgressPhaseLabels): string {
  return isKnownPhase(phase) ? labels[phase] : phase;
}

/** The dashboard TypeScript project reads no workspace packages, so
 *  @odysseus/scanner's UNLIMITED_MAX_PAGES sentinel (packages/scanner/
 *  src/config.ts) is duplicated here by value. */
const UNLIMITED_MAX_PAGES = Number.MAX_SAFE_INTEGER;

/** A terminal document can no longer change, so polling stops. Cancelled
 *  counts: the stop takes effect at the end of the page in flight and no
 *  counter moves afterwards. */
export function isTerminal(status: JobStatus | undefined): boolean {
  return (
    status === 'complete' ||
    status === 'failed' ||
    status === 'cancelled' ||
    status === 'needs-input'
  );
}

/** The result card a terminal job shows. Issue #386: a failed job that
 *  stopped in report writing or PDF production is a completed scan with a
 *  report failure, classified by the same rule as the audits list. */
export type TerminalCardKind = 'complete' | 'report-issue' | 'failed' | 'cancelled' | 'needs-input';

export function terminalCardKind(job: ScanJobDetail): TerminalCardKind {
  if (job.status === 'failed') {
    return reportFailureStage(job) !== null ? 'report-issue' : 'failed';
  }
  if (job.status === 'cancelled' || job.status === 'needs-input') return job.status;
  return 'complete';
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * What this run has actually covered so far.
 *
 * The coverage terms nest - every performance-measured page is also
 * content-checked, every content-checked page is also inventoried - so the
 * bar segments cannot be drawn on top of each other without double-counting:
 * each segment's `value` is the difference against the stronger band, which
 * is what keeps the strip widths honest. But the charter's coverage
 * vocabulary (measured/checked/inventoried, CLAUDE.md's "coverage
 * vocabulary, plan 021") names absolute counts, not residuals, so the label
 * text uses `displayValue` to print the real total for each band (e.g.
 * "Contenu vérifié 28", not the 0 left over once the 28 measured pages are
 * subtracted out). Omitted URLs stay out of the inventory entirely: the
 * continuation guard left them undiscovered, and folding them in would be
 * exactly the overstatement the guard is disclosed to prevent.
 */
export function coverageSegments(
  job: ScanJobDetail,
  labels: DashboardStrings['common']['coverage'],
): CoverageSegment[] {
  const visited = job.progress.crawl?.visited ?? 0;
  const checked = job.progress.contentScan?.completed ?? job.progress.scan?.scanned ?? 0;
  const measured = job.progress.lighthouse?.completed ?? 0;
  const omitted = job.progress.continuationGuard?.omittedUrlCount ?? 0;
  return [
    { kind: 'measured', label: labels.measured, value: measured, displayValue: measured },
    {
      kind: 'checked',
      label: labels.checked,
      value: Math.max(0, checked - measured),
      displayValue: checked,
    },
    {
      kind: 'reached',
      label: labels.reached,
      value: Math.max(0, visited - checked),
      displayValue: visited,
    },
    { kind: 'omitted', label: labels.omitted, value: omitted, displayValue: omitted },
  ];
}

const EMPTY_COVERAGE_LABELS: DashboardStrings['common']['coverage'] = {
  caption: '',
  measured: '',
  checked: '',
  reached: '',
  failed: '',
  omitted: '',
};

/** True once any counter has moved. Before that the strip would be a full-width
 *  band of nothing, which reads as a finished scan rather than a starting one. */
export function hasCoverage(job: ScanJobDetail): boolean {
  return coverageSegments(job, EMPTY_COVERAGE_LABELS).some((segment) => segment.value > 0);
}

/** Crawl bar percentage, ported from app-progress.ts renderFullAudit:
 *  visited over target capped at 100. A missing or non-positive target is
 *  0 rather than Infinity, matching the old page's target > 0 guard. An
 *  uncapped crawl reports null (the bar renders indeterminate) while the
 *  job is queued or crawling: the sentinel target is not a real page
 *  count, so any determinate width would be a lie (GitHub issue 18). Once
 *  the job moves past the crawl it pins to 100, mirroring the scan bar's
 *  pin convention. */
export function crawlProgress(job: ScanJobDetail): number | null {
  const crawl = job.progress.crawl;
  if (crawl === undefined || crawl.target <= 0) return 0;
  if (crawl.target >= UNLIMITED_MAX_PAGES) {
    return job.phase === 'queued' || job.phase === 'crawl' ? null : 100;
  }
  return clampPercent((crawl.visited / crawl.target) * 100);
}

/** Scan bar percentage, ported from app-progress.ts renderFullAudit. The
 *  old page pins the scan bar to 100 once the job leaves the crawl phase
 *  before scan counters exist, so the bar never sits empty through the
 *  normalize and report phases. */
export function scanProgress(job: ScanJobDetail): number {
  const scan = job.progress.scan;
  if (scan !== undefined) {
    return scan.target > 0 ? clampPercent((scan.scanned / scan.target) * 100) : 0;
  }
  return job.phase === 'queued' || job.phase === 'crawl' ? 0 : 100;
}

function stagedProgress(
  bucket: { completed: number; target: number } | undefined,
  phaseIsPast: boolean,
): number {
  if (bucket === undefined) return phaseIsPast ? 100 : 0;
  if (bucket.target <= 0) return phaseIsPast ? 100 : 0;
  return clampPercent((bucket.completed / bucket.target) * 100);
}

export function contentScanProgress(job: ScanJobDetail): number {
  return stagedProgress(job.progress.contentScan, AFTER_CONTENT_PHASES.has(job.phase));
}

export function lighthouseProgress(job: ScanJobDetail): number {
  return stagedProgress(job.progress.lighthouse, AFTER_LIGHTHOUSE_PHASES.has(job.phase));
}

export function hasStagedAnalysisProgress(job: ScanJobDetail): boolean {
  return (
    job.progress.contentScan !== undefined ||
    job.progress.lighthouse !== undefined ||
    job.phase === 'content-scan' ||
    job.phase === 'select-performance' ||
    job.phase === 'lighthouse'
  );
}

/** Remaining-time text, ported from app-progress.ts formatEtaMs (whole
 *  minutes via Math.ceil). Sub-minute estimates render as whole seconds so
 *  the tail of a phase counts down instead of reading as stuck. */
export function formatEta(etaMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(etaMs / 1000));
  if (totalSeconds < 60) return `${totalSeconds} s`;
  return `${Math.ceil(etaMs / 60_000)} min`;
}

/** Issue #223: the server only recomputes etaMs when a progress event
 *  fires, but the dashboard polls on its own cadence - without this, the
 *  displayed countdown would freeze at the same value for the whole poll
 *  interval instead of ticking down live. Ages a server-computed etaMs
 *  down by the wall time elapsed since etaCalculatedAt, clamped at 0.
 *  Returns the raw etaMs unchanged when etaCalculatedAt is absent or
 *  unparseable, so an older/degraded response still renders something. */
export function agedEtaMs(
  etaMs: number,
  etaCalculatedAt: string | undefined,
  nowMs: number,
): number {
  if (etaCalculatedAt === undefined) return etaMs;
  const calculatedAtMs = new Date(etaCalculatedAt).getTime();
  if (!Number.isFinite(calculatedAtMs)) return etaMs;
  return Math.max(etaMs - (nowMs - calculatedAtMs), 0);
}

/** Badge state of one prospecting URL row, ported from app-progress.ts
 *  renderProspecting: complete is success, error is failure, every other
 *  status (pending, scanning, skipped-non-html) is still in flight. */
export type UrlResultState = 'complete' | 'failed' | 'running';

export function urlResultState(status: string): UrlResultState {
  if (status === 'complete') return 'complete';
  if (status === 'error') return 'failed';
  return 'running';
}
