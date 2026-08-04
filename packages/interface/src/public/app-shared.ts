import type { DashboardStrings } from './strings/i18n.js';

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => ({}));
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `Request to ${url} failed (${response.status})`;
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function showError(message: string): void {
  const banner = document.getElementById('error-banner');
  if (!banner) return;
  banner.textContent = message;
  banner.classList.add('visible');
}

export interface SeverityRollup {
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
}

const SEVERITIES = ['critical', 'serious', 'moderate', 'minor'] as const;

export function severityBadgesHtml(rollup: SeverityRollup | undefined, strings: DashboardStrings): string {
  if (!rollup) return '';
  return SEVERITIES.filter((severity) => rollup[severity] > 0)
    .map(
      (severity) =>
        `<span class="badge badge-${severity}">${escapeHtml(strings.common.severityLabels[severity])}: ${rollup[severity]}</span>`,
    )
    .join(' ');
}

export type JobStatus = 'queued' | 'running' | 'complete' | 'failed';

export function statusBadgeHtml(status: JobStatus, strings: DashboardStrings): string {
  return `<span class="badge badge-${status}">${escapeHtml(strings.common.statusLabels[status])}</span>`;
}

export function formatDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleString();
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes any value interpolated into innerHTML that ultimately comes
 *  from a scanned site (URLs, finding titles) or from the operator's own
 *  form input, rather than trusting it not to contain markup. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}
