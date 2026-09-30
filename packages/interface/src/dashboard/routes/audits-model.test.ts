import { describe, expect, it } from 'vitest';
import {
  groupByDay,
  pageOf,
  computeKpis,
  contactedStatus,
  filterByContact,
  filterSummaries,
  hostnameOf,
  listStatus,
  rowTarget,
  runningScans,
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
    // Plan 060 §5.3: the classification is server-declared, so fixtures pin
    // the code the server would send for the case they model.
    outcomeCode: 'complete',
    phase: 'done',
    createdAt: '2026-08-29T10:00:00.000Z',
    capabilities: {
      cancel: { state: 'blocked', stateToken: 't-cancel', reasonCode: 'already-terminal' },
      delete: { state: 'available', stateToken: 't-delete' },
    },
    ...overrides,
  };
}

describe('computeKpis', () => {
  it('counts run statuses', () => {
    const summaries = [
      makeSummary({ jobId: 'a', status: 'queued', outcomeCode: 'queued' }),
      makeSummary({ jobId: 'b', status: 'running', outcomeCode: 'running' }),
      makeSummary({
        jobId: 'stopping',
        status: 'cancel-requested',
        outcomeCode: 'cancel-requested',
      }),
      makeSummary({
        jobId: 'c',
        status: 'complete',
        severityRollup: { critical: 2, serious: 1, moderate: 0, minor: 4 },
      }),
      makeSummary({ jobId: 'd', status: 'complete' }),
      makeSummary({
        jobId: 'e',
        status: 'failed',
        outcomeCode: 'failed',
        severityRollup: { critical: 3, serious: 0, moderate: 0, minor: 0 },
      }),
    ];
    expect(computeKpis(summaries)).toEqual({
      running: 3,
      needsInput: 0,
      complete: 2,
      reportIssue: 0,
      failed: 1,
    });
  });

  it('returns zeros for an empty list', () => {
    expect(computeKpis([])).toEqual({
      running: 0,
      needsInput: 0,
      complete: 0,
      reportIssue: 0,
      failed: 0,
    });
  });

  it('counts the displayed status, so the header matches the rows and filter (issues #380, #382, #386)', () => {
    const summaries = [
      makeSummary({ jobId: 'a', status: 'needs-input', outcomeCode: 'needs-input' }),
      makeSummary({ jobId: 'b', status: 'failed', outcomeCode: 'needs-input' }),
      makeSummary({ jobId: 'c', status: 'failed', outcomeCode: 'report-issue' }),
      makeSummary({ jobId: 'd', status: 'failed', outcomeCode: 'failed' }),
      makeSummary({ jobId: 'e', status: 'cancelled', outcomeCode: 'cancelled' }),
      makeSummary({ jobId: 'f', status: 'failed', outcomeCode: 'report-issue' }),
      makeSummary({ jobId: 'g', status: 'failed', outcomeCode: 'failed' }),
    ];
    const kpis = computeKpis(summaries);
    expect(kpis).toEqual({ running: 0, needsInput: 2, complete: 0, reportIssue: 2, failed: 2 });
    expect(filterSummaries(summaries, 'needs-input')).toHaveLength(kpis.needsInput);
    expect(filterSummaries(summaries, 'report-issue')).toHaveLength(kpis.reportIssue);
    expect(filterSummaries(summaries, 'failed')).toHaveLength(kpis.failed);
  });
});

describe('contactedStatus', () => {
  it('returns a Results status and nothing for new, audited or unlinked scans', () => {
    expect(contactedStatus(makeSummary({ prospectStatus: 'contacted' }))).toBe('contacted');
    expect(contactedStatus(makeSummary({ prospectStatus: 'opted-out' }))).toBe('opted-out');
    expect(contactedStatus(makeSummary({ prospectStatus: 'audited' }))).toBeUndefined();
    expect(contactedStatus(makeSummary({ prospectStatus: 'new' }))).toBeUndefined();
    expect(contactedStatus(makeSummary())).toBeUndefined();
  });
});

describe('filterByContact', () => {
  const summaries = [
    makeSummary({ jobId: 'contacted', prospectId: 'p1', prospectStatus: 'follow-up' }),
    makeSummary({ jobId: 'audited', prospectId: 'p2', prospectStatus: 'audited' }),
    makeSummary({ jobId: 'unlinked' }),
  ];
  const ids = (rows: { jobId: string }[]): string[] => rows.map((row) => row.jobId);

  it('keeps every scan when the filter is empty', () => {
    expect(ids(filterByContact(summaries, ''))).toEqual(['contacted', 'audited', 'unlinked']);
  });

  it('keeps only scans of contacted prospects', () => {
    expect(ids(filterByContact(summaries, 'contacted'))).toEqual(['contacted']);
  });

  it('keeps prospect-linked scans not yet contacted and drops unlinked scans', () => {
    expect(ids(filterByContact(summaries, 'not-contacted'))).toEqual(['audited']);
  });
});

describe('filterSummaries', () => {
  const summaries = [
    makeSummary({ jobId: 'a', status: 'queued', outcomeCode: 'queued' }),
    makeSummary({ jobId: 'b', status: 'running', outcomeCode: 'running' }),
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
      makeSummary({ jobId: 'a', status: 'failed', outcomeCode: 'report-issue' }),
      makeSummary({ jobId: 'b', status: 'failed', outcomeCode: 'failed' }),
      makeSummary({ jobId: 'c', status: 'needs-input', outcomeCode: 'needs-input' }),
    ];
    expect(filterSummaries(summaries, 'needs-input').map((summary) => summary.jobId)).toEqual([
      'c',
    ]);
    // Issue #386: the failed row with a saved audit is a report issue.
    expect(filterSummaries(summaries, 'report-issue').map((summary) => summary.jobId)).toEqual([
      'a',
    ]);
    expect(filterSummaries(summaries, 'failed').map((summary) => summary.jobId)).toEqual(['b']);
  });
});

describe('listStatus', () => {
  // Plan 060 §5.3: the display status is the server's outcomeCode,
  // verbatim - the cases that produce each code are pinned server-side in
  // routes/scans-contract.test.ts.
  it('passes the server-declared outcome code through without local flips', () => {
    for (const outcomeCode of [
      'queued',
      'running',
      'cancel-requested',
      'complete',
      'failed',
      'cancelled',
      'needs-input',
      'report-issue',
    ] as const) {
      expect(listStatus(makeSummary({ status: 'failed', outcomeCode }))).toBe(outcomeCode);
    }
  });

  it('shows a completed scan whose reports are no longer ready as a report issue (issue #389)', () => {
    const summaries = [
      makeSummary({
        jobId: 'a',
        status: 'complete',
        outcomeCode: 'report-issue',
        auditId: 'audit-1',
      }),
      makeSummary({ jobId: 'b', status: 'complete' }),
    ];
    expect(summaries.map(listStatus)).toEqual(['report-issue', 'complete']);
    expect(computeKpis(summaries)).toMatchObject({ complete: 1, reportIssue: 1 });
    // The row's own link opens the audit, where the failure and its
    // regeneration path live.
    expect(rowTarget(summaries[0]!)).toBe('/audits/audit-1');
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
    expect(rowTarget(makeSummary({ status: 'running', outcomeCode: 'running' }))).toBe(
      '/scans/job-1',
    );
  });
});

describe('runningScans', () => {
  it('keeps running and stopping work, oldest first, and ignores waiting work and history', () => {
    const running = runningScans([
      makeSummary({ jobId: 'done' }),
      makeSummary({ jobId: 'failed', status: 'failed', outcomeCode: 'failed' }),
      makeSummary({ jobId: 'input', status: 'needs-input', outcomeCode: 'needs-input' }),
      makeSummary({ jobId: 'next', status: 'queued', outcomeCode: 'queued' }),
      makeSummary({
        jobId: 'now',
        status: 'running',
        outcomeCode: 'running',
        createdAt: '2026-09-16T22:05:00.000Z',
      }),
      makeSummary({
        jobId: 'stopping',
        status: 'cancel-requested',
        outcomeCode: 'cancel-requested',
        createdAt: '2026-09-16T21:00:00.000Z',
      }),
    ]);
    expect(running.map((row) => row.jobId)).toEqual(['stopping', 'now']);
  });

  it('classifies on the server-declared outcome code, never the raw status', () => {
    const running = runningScans([
      makeSummary({ jobId: 'coded-running', status: 'failed', outcomeCode: 'running' }),
      makeSummary({ jobId: 'raw-running', status: 'running', outcomeCode: 'failed' }),
    ]);
    expect(running.map((row) => row.jobId)).toEqual(['coded-running']);
  });
});

describe('audit list paging and day groups', () => {
  const at = (createdAt: string) => ({ createdAt });

  it('splits a list into pages of twenty and clamps the page into range', () => {
    const items = Array.from({ length: 45 }, (_, index) => index);
    expect(pageOf(items, 1).items).toEqual(items.slice(0, 20));
    expect(pageOf(items, 3)).toEqual({ items: items.slice(40), page: 3, pageCount: 3 });
    expect(pageOf(items, 9).page).toBe(3);
    expect(pageOf([], 1)).toEqual({ items: [], page: 1, pageCount: 1 });
  });

  it('groups consecutive audits of the same local day in list order', () => {
    const groups = groupByDay([
      at('2026-09-23T15:00:00'),
      at('2026-09-23T08:00:00'),
      at('2026-09-22T20:00:00'),
    ]);
    expect(groups.map((group) => [group.day, group.items.length])).toEqual([
      ['2026-09-23', 2],
      ['2026-09-22', 1],
    ]);
  });
});
