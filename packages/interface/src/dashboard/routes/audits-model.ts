import type { JobStatus, ScanSummary, SeverityRollup } from '../lib/api-types';

/** Sort order of the audits list; newest is the default so the operator
 *  sees fresh scans first. */
export type SortOrder = 'newest' | 'oldest';

/** Value of the status filter select; the empty string means every status. */
export type StatusFilter = JobStatus | '';

/** Header KPIs of the audits page, derived from the polled summaries. */
export interface AuditsKpis {
  running: number;
  complete: number;
  failed: number;
  critical: number;
}

export const SEVERITY_ORDER = ['critical', 'serious', 'moderate', 'minor'] as const;

export type SeverityKey = (typeof SEVERITY_ORDER)[number];

export interface SeverityBadge {
  key: SeverityKey;
  count: number;
}

const RUNNING_STATUSES: readonly JobStatus[] = ['queued', 'running'];

/** Header KPIs in one pass so a 200-row poll stays trivially cheap. Critical
 *  sums every rollup present, whatever the row status, because the API only
 *  fills the rollup once findings exist. */
export function computeKpis(summaries: ScanSummary[]): AuditsKpis {
  let running = 0;
  let complete = 0;
  let failed = 0;
  let critical = 0;
  for (const summary of summaries) {
    if (RUNNING_STATUSES.includes(summary.status)) {
      running += 1;
    } else if (summary.status === 'complete') {
      complete += 1;
    } else if (summary.status === 'failed') {
      failed += 1;
    }
    critical += summary.severityRollup?.critical ?? 0;
  }
  return { running, complete, failed, critical };
}

/** Rows whose status matches the filter; the empty string keeps every row.
 *  Always returns a new array so callers can sort without touching the
 *  polled data. */
export function filterSummaries(summaries: ScanSummary[], status: StatusFilter): ScanSummary[] {
  if (status === '') {
    return [...summaries];
  }
  return summaries.filter((summary) => summary.status === status);
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
 *  page falls back to common.unknownSite. */
export function siteLabel(summary: ScanSummary): string {
  if (summary.siteUrl !== undefined) {
    return hostnameOf(summary.siteUrl);
  }
  const urlCount = summary.urls?.length ?? 0;
  return urlCount > 0 ? `${urlCount} sites` : '';
}

/** Case-insensitive substring match against the site column text, so the
 *  search box finds exactly what the operator can see. An empty or blank
 *  query matches everything so clearing the box restores all rows. */
export function searchMatches(summary: ScanSummary, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return true;
  }
  return siteLabel(summary).toLowerCase().includes(needle);
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
