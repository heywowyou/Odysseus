import { describe, expect, it } from 'vitest';
import {
  computeKpis,
  filterSummaries,
  hostnameOf,
  listStatus,
  rowTarget,
  scanQueue,
  searchMatches,
  severityBadges,
  siteLabel,
  sortSummaries,
} from './audits-model';
import { en } from '../i18n/en';
import { fr } from '../i18n/fr';
import type { ScanSummary } from '../lib/api-types';

const siteCountLabels = en.audits;

function makeSummary(overrides: Partial<ScanSummary> = {}): ScanSummary {
  return {
    jobId: 'job-1',
    type: 'full-audit',
    status: 'complete',
    phase: 'done',
    createdAt: '2026-08-29T10:00:00.000Z',
    ...overrides,
  };
}

describe('computeKpis', () => {
  it('counts run statuses', () => {
    const summaries = [
      makeSummary({ jobId: 'a', status: 'queued' }),
      makeSummary({ jobId: 'b', status: 'running' }),
      makeSummary({
        jobId: 'c',
        status: 'complete',
        severityRollup: { critical: 2, serious: 1, moderate: 0, minor: 4 },
      }),
      makeSummary({ jobId: 'd', status: 'complete' }),
      makeSummary({
        jobId: 'e',
        status: 'failed',
        severityRollup: { critical: 3, serious: 0, moderate: 0, minor: 0 },
      }),
    ];
    expect(computeKpis(summaries)).toEqual({ running: 2, needsInput: 0, complete: 2, failed: 1 });
  });

  it('returns zeros for an empty list', () => {
    expect(computeKpis([])).toEqual({ running: 0, needsInput: 0, complete: 0, failed: 0 });
  });

  it('counts the displayed status, so the header matches the rows and filter (issues #380, #382)', () => {
    const summaries = [
      makeSummary({ jobId: 'a', status: 'needs-input', auditId: 'audit-a', awaitsInput: true }),
      makeSummary({ jobId: 'b', status: 'failed', auditId: 'audit-b', awaitsInput: true }),
      makeSummary({ jobId: 'c', status: 'failed', auditId: 'audit-c' }),
      makeSummary({ jobId: 'd', status: 'failed' }),
      makeSummary({ jobId: 'e', status: 'cancelled' }),
    ];
    const kpis = computeKpis(summaries);
    expect(kpis).toEqual({ running: 0, needsInput: 2, complete: 0, failed: 2 });
    expect(filterSummaries(summaries, 'needs-input')).toHaveLength(kpis.needsInput);
    expect(filterSummaries(summaries, 'failed')).toHaveLength(kpis.failed);
  });
});

describe('filterSummaries', () => {
  const summaries = [
    makeSummary({ jobId: 'a', status: 'queued' }),
    makeSummary({ jobId: 'b', status: 'running' }),
    makeSummary({ jobId: 'c', status: 'complete' }),
  ];

  it('keeps every row when the filter is the empty string', () => {
    expect(filterSummaries(summaries, '')).toHaveLength(3);
  });

  it('keeps only rows of the chosen status', () => {
    expect(filterSummaries(summaries, 'running').map((summary) => summary.jobId)).toEqual(['b']);
  });

  it('does not mutate the polled array', () => {
    filterSummaries(summaries, 'failed');
    expect(summaries).toHaveLength(3);
  });

  it('files only a typed input request under the needs-input filter (issue #382)', () => {
    const summaries = [
      makeSummary({ jobId: 'a', status: 'failed', auditId: 'audit-a' }),
      makeSummary({ jobId: 'b', status: 'failed' }),
      makeSummary({ jobId: 'c', status: 'needs-input', auditId: 'audit-c', awaitsInput: true }),
    ];
    expect(filterSummaries(summaries, 'needs-input').map((summary) => summary.jobId)).toEqual([
      'c',
    ]);
    expect(filterSummaries(summaries, 'failed').map((summary) => summary.jobId)).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('listStatus', () => {
  it('shows a job stopped on the identity gate as needing input', () => {
    expect(
      listStatus(makeSummary({ status: 'needs-input', auditId: 'audit-1', awaitsInput: true })),
    ).toBe('needs-input');
  });

  it('keeps a technical failure with a persisted audit as failed, still linking to the audit (issue #382)', () => {
    // The render-lint refusal of issue #377 is a failed job with an auditId.
    const summary = makeSummary({ status: 'failed', auditId: 'audit-1' });
    expect(listStatus(summary)).toBe('failed');
    expect(rowTarget(summary)).toBe('/audits/audit-1');
  });

  it('shows a legacy failed row carrying typed input fields as needing input', () => {
    expect(
      listStatus(makeSummary({ status: 'failed', auditId: 'audit-1', awaitsInput: true })),
    ).toBe('needs-input');
  });

  it('leaves a failed job without an audit as failed', () => {
    expect(listStatus(makeSummary({ status: 'failed' }))).toBe('failed');
  });

  it('leaves every other status untouched', () => {
    expect(listStatus(makeSummary({ status: 'needs-input', auditId: 'audit-1' }))).toBe(
      'needs-input',
    );
    expect(listStatus(makeSummary({ status: 'complete', auditId: 'audit-1' }))).toBe('complete');
    expect(listStatus(makeSummary({ status: 'queued' }))).toBe('queued');
  });
});

describe('hostname and site label', () => {
  it('extracts the hostname of a valid URL', () => {
    expect(hostnameOf('https://www.example.fr/cgv?page=2')).toBe('www.example.fr');
  });

  it('falls back to the raw string for an invalid URL', () => {
    expect(hostnameOf('not a url')).toBe('not a url');
  });

  it('labels a row by its hostname', () => {
    expect(siteLabel(makeSummary({ siteUrl: 'http://hotel-exemple.fr' }), siteCountLabels)).toBe(
      'hotel-exemple.fr',
    );
  });

  it('labels a prospecting row by its URL count when there is no site', () => {
    const summary = makeSummary({
      type: 'prospecting',
      urls: ['https://a.example.fr', 'https://b.example.fr', 'https://c.example.fr'],
    });
    expect(siteLabel(summary, siteCountLabels)).toBe('3 sites');
  });

  it('uses the singular form for exactly one URL (issue #34)', () => {
    const summary = makeSummary({ type: 'prospecting', urls: ['https://a.example.fr'] });
    expect(siteLabel(summary, siteCountLabels)).toBe('1 site');
    expect(siteLabel(summary, fr.audits)).toBe('1 site');
  });

  it('labels a row with nothing known as empty', () => {
    expect(siteLabel(makeSummary({ type: 'prospecting' }), siteCountLabels)).toBe('');
  });
});

describe('searchMatches', () => {
  const summary = makeSummary({ siteUrl: 'https://Hotel-Exemple.fr/page' });

  it('matches the hostname case-insensitively', () => {
    expect(searchMatches(summary, 'exemple', siteCountLabels)).toBe(true);
    expect(searchMatches(summary, 'EXEMPLE.FR', siteCountLabels)).toBe(true);
  });

  it('rejects a substring that is not in the hostname', () => {
    expect(searchMatches(summary, 'nomatch', siteCountLabels)).toBe(false);
  });

  it('matches everything on an empty or blank query', () => {
    expect(searchMatches(summary, '', siteCountLabels)).toBe(true);
    expect(searchMatches(summary, '   ', siteCountLabels)).toBe(true);
  });
});

describe('sortSummaries', () => {
  const oldest = makeSummary({ jobId: 'a', createdAt: '2026-08-28T09:00:00.000Z' });
  const newest = makeSummary({ jobId: 'b', createdAt: '2026-08-29T15:00:00.000Z' });
  const middle = makeSummary({ jobId: 'c', createdAt: '2026-08-29T08:00:00.000Z' });

  it('sorts newest first', () => {
    expect(sortSummaries([oldest, newest, middle], 'newest').map((s) => s.jobId)).toEqual([
      'b',
      'c',
      'a',
    ]);
  });

  it('sorts oldest first on request', () => {
    expect(sortSummaries([oldest, newest, middle], 'oldest').map((s) => s.jobId)).toEqual([
      'a',
      'c',
      'b',
    ]);
  });

  it('copies instead of reordering the polled array', () => {
    const input = [oldest, newest, middle];
    sortSummaries(input, 'oldest');
    expect(input.map((s) => s.jobId)).toEqual(['a', 'b', 'c']);
  });
});

describe('severityBadges', () => {
  it('returns no badge without a rollup', () => {
    expect(severityBadges(undefined)).toEqual([]);
  });

  it('keeps the fixed order and drops zero counts', () => {
    expect(severityBadges({ critical: 1, serious: 0, moderate: 2, minor: 0 })).toEqual([
      { key: 'critical', count: 1 },
      { key: 'moderate', count: 2 },
    ]);
  });
});

describe('rowTarget', () => {
  it('links a finished audit to its report', () => {
    expect(rowTarget(makeSummary({ auditId: 'au-1' }))).toBe('/audits/au-1');
  });

  it('links a running job to the scan progress page', () => {
    expect(rowTarget(makeSummary({ status: 'running' }))).toBe('/scans/job-1');
  });
});

describe('scanQueue', () => {
  it('separates running work from waiting work and ignores history', () => {
    const queue = scanQueue([
      makeSummary({ jobId: 'done', status: 'complete' }),
      makeSummary({ jobId: 'failed', status: 'failed' }),
      makeSummary({ jobId: 'input', status: 'needs-input' }),
      makeSummary({ jobId: 'next', status: 'queued' }),
      makeSummary({ jobId: 'now', status: 'running' }),
    ]);
    expect(queue.running.map((row) => row.jobId)).toEqual(['now']);
    expect(queue.upNext.map((row) => row.jobId)).toEqual(['next']);
  });

  it('lists waiting jobs in the order the queue will claim them', () => {
    // The poll's own order: newest first, and a batch's jobs share one
    // createdAt, listed in reverse queue order.
    const batchInstant = '2026-09-16T22:00:00.000Z';
    const queue = scanQueue([
      makeSummary({ jobId: 'later', status: 'queued', createdAt: '2026-09-16T22:05:00.000Z' }),
      makeSummary({ jobId: 'batch-3', status: 'queued', createdAt: batchInstant }),
      makeSummary({ jobId: 'batch-2', status: 'queued', createdAt: batchInstant }),
      makeSummary({ jobId: 'batch-1', status: 'queued', createdAt: batchInstant }),
      makeSummary({ jobId: 'earlier', status: 'queued', createdAt: '2026-09-16T21:00:00.000Z' }),
    ]);
    expect(queue.upNext.map((row) => row.jobId)).toEqual([
      'earlier',
      'batch-1',
      'batch-2',
      'batch-3',
      'later',
    ]);
  });
});
