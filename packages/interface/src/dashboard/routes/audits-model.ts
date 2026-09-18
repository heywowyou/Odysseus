import type { DashboardStrings } from '../i18n/types';
import type { ScanSummary, SeverityRollup } from '../lib/api-types';
import { displayJobStatus, type DisplayJobStatus } from '../lib/job-outcome';

/** Sort order of the audits list; newest is the default so the operator
 *  sees fresh scans first. */
export type SortOrder = 'newest' | 'oldest';

/** Value of the status filter select; the empty string means every status. */
export type StatusFilter = DisplayJobStatus | '';

/** Header KPIs of the audits page, derived from the polled summaries. */
export interface AuditsKpis {
  running: number;
  needsInput: number;
  complete: number;
  /** Issue #386: scans whose audit was saved but whose report failed. */
  reportIssue: number;
  failed: number;
}

const SEVERITY_ORDER = ['critical', 'serious', 'moderate', 'minor'] as const;

export type SeverityKey = (typeof SEVERITY_ORDER)[number];

export interface SeverityBadge {
  key: SeverityKey;
  count: number;
}

const RUNNING_STATUSES: readonly DisplayJobStatus[] = ['queued', 'running', 'cancel-requested'];

/** Header status KPIs in one pass so a 200-row poll stays trivially cheap.
 *  Issue #380: counted on the displayed status (listStatus), the same
 *  classification the rows and the status filter use, so the header can
 *  never disagree with the table. */
export function computeKpis(summaries: ScanSummary[]): AuditsKpis {
  const kpis: AuditsKpis = { running: 0, needsInput: 0, complete: 0, reportIssue: 0, failed: 0 };
  for (const summary of summaries) {
    const status = listStatus(summary);
    if (RUNNING_STATUSES.includes(status)) {
      kpis.running += 1;
    } else if (status === 'needs-input') {
      kpis.needsInput += 1;
    } else if (status === 'complete') {
      kpis.complete += 1;
    } else if (status === 'report-issue') {
      kpis.reportIssue += 1;
    } else if (status === 'failed') {
      kpis.failed += 1;
    }
  }
  return kpis;
}

/** Rows whose status matches the filter; the empty string keeps every row.
 *  Always returns a new array so callers can sort without touching the
 *  polled data. Filtering runs on the displayed status (listStatus), so a
 *  row never reads one way in the table and another in the filter. */
export function filterSummaries(summaries: ScanSummary[], status: StatusFilter): ScanSummary[] {
  if (status === '') {
    return [...summaries];
  }
  return summaries.filter((summary) => listStatus(summary) === status);
}

/** The status a list row shows. "Needs input" is an instruction: Odysseus
 *  cannot continue until the operator confirms typed fields. Issue #382
 *  removed the issue #90 rule that also showed every failed job with a
 *  persisted audit that way - a render crash or lint refusal is a technical
 *  failure, not missing data. Issue #386: such a row reads "Report issue",
 *  not "Failed", because the scan itself succeeded; it links to its audit
 *  page (rowTarget), where the failure and its regeneration path live.
 *  "Failed" keeps only scans that produced no usable audit. The shared
 *  classifier is lib/job-outcome.ts, also read by the progress page. */
export function listStatus(summary: ScanSummary): DisplayJobStatus {
  return displayJobStatus(summary);
}

/** Hostname of a site URL for display and search. A malformed URL falls back
 *  to the raw string so a hand-entered site never disappears from the list;
 *  operators recognise the hostname, not the scheme or path. */
export function hostnameOf(siteUrl: string): string {
  try {
    return new URL(siteUrl).hostname;
  } catch {
    return siteUrl;
  }
}

/** Site column text: the hostname, or the URL count for a prospecting job
 *  that has no single site. Empty when neither is known, in which case the
 *  page falls back to common.unknownSite. Count-aware and routed through
 *  i18n (audits.siteCountSingular / siteCountPlural) so a one-URL job reads
 *  "1 site" rather than a hardcoded plural, in both French and English. */
export function siteLabel(
  summary: ScanSummary,
  labels: Pick<DashboardStrings['audits'], 'siteCountSingular' | 'siteCountPlural'>,
): string {
  if (summary.siteUrl !== undefined) {
    return hostnameOf(summary.siteUrl);
  }
  const urlCount = summary.urls?.length ?? 0;
  if (urlCount === 0) return '';
  const template = urlCount === 1 ? labels.siteCountSingular : labels.siteCountPlural;
  return template.replace('{count}', String(urlCount));
}

/** Case-insensitive substring match against the site column text, so the
 *  search box finds exactly what the operator can see. An empty or blank
 *  query matches everything so clearing the box restores all rows. */
export function searchMatches(
  summary: ScanSummary,
  query: string,
  labels: Pick<DashboardStrings['audits'], 'siteCountSingular' | 'siteCountPlural'>,
): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return true;
  }
  return siteLabel(summary, labels).toLowerCase().includes(needle);
}

/** Rows ordered by creation time. Copies before sorting so the polled array
 *  is never reordered in place. */
export function sortSummaries(summaries: ScanSummary[], order: SortOrder): ScanSummary[] {
  const sorted = [...summaries];
  sorted.sort((a, b) => {
    const delta = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    return order === 'newest' ? -delta : delta;
  });
  return sorted;
}

/** Severity badges of one row in fixed display order, zero counts omitted so
 *  an all-clear scan renders an empty cell instead of four zeros. */
export function severityBadges(rollup: SeverityRollup | undefined): SeverityBadge[] {
  if (rollup === undefined) {
    return [];
  }
  return SEVERITY_ORDER.map((key) => ({ key, count: rollup[key] })).filter(
    (badge) => badge.count > 0,
  );
}

/** Detail route of a row: the audit report once an auditId exists, the live
 *  scan progress page before that. */
export function rowTarget(summary: ScanSummary): string {
  return summary.auditId !== undefined ? `/audits/${summary.auditId}` : `/scans/${summary.jobId}`;
}

/** Issue #375: the work that will happen, apart from the work that happened.
 *  Running jobs first; waiting jobs oldest first, which is the order the
 *  queue claims them in. */
export function scanQueue(summaries: readonly ScanSummary[]): {
  running: ScanSummary[];
  upNext: ScanSummary[];
} {
  // The poll lists newest first, jobs of one batch sharing a createdAt in
  // reverse queue order. Reversing first lets the stable sort keep those
  // ties in queue order.
  const byCreation = sortSummaries([...summaries].reverse(), 'oldest');
  return {
    running: byCreation.filter(
      (summary) => summary.status === 'running' || summary.status === 'cancel-requested',
    ),
    upNext: byCreation.filter((summary) => summary.status === 'queued'),
  };
}
