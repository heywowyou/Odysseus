import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import type { ScanJobDetail, ScanUrlResult } from '../lib/api-types';
import {
  crawlProgress,
  currentPhaseLabel,
  formatEta,
  isKnownPhase,
  isTerminal,
  scanProgress,
  urlResultState,
} from './scan-progress-model';

/** Fixture shaped like the GET /api/scans/:jobId document (store Job).
 *  Optional fields are spread in rather than set to undefined so the
 *  fixture matches the exactOptionalPropertyTypes contract of the wire
 *  shape, where an absent field is simply absent. */
function job(
  fields: {
    type?: ScanJobDetail['type'];
    status?: ScanJobDetail['status'];
    phase?: ScanJobDetail['phase'];
    progress?: ScanJobDetail['progress'];
    auditId?: string;
    urlResults?: ScanUrlResult[];
    error?: string;
  } = {},
): ScanJobDetail {
  return {
    jobId: 'job-1',
    type: fields.type ?? 'full-audit',
    status: fields.status ?? 'running',
    phase: fields.phase ?? 'queued',
    progress: fields.progress ?? {},
    ...(fields.auditId !== undefined ? { auditId: fields.auditId } : {}),
    ...(fields.urlResults !== undefined ? { urlResults: fields.urlResults } : {}),
    ...(fields.error !== undefined ? { error: fields.error } : {}),
  };
}

describe('isTerminal', () => {
  it('is false while the job can still change', () => {
    expect(isTerminal(undefined)).toBe(false);
    expect(isTerminal('queued')).toBe(false);
    expect(isTerminal('running')).toBe(false);
  });

  it('is true once the job reached complete, failed, or cancelled', () => {
    expect(isTerminal('complete')).toBe(true);
    expect(isTerminal('failed')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
  });
});

describe('crawlProgress', () => {
  it('is 0 for a queued job without crawl counters', () => {
    expect(crawlProgress(job({ status: 'queued', phase: 'queued' }))).toBe(0);
  });

  it('is 0 when the target is missing or not positive', () => {
    expect(
      crawlProgress(job({ phase: 'crawl', progress: { crawl: { visited: 12, target: 0 } } })),
    ).toBe(0);
    expect(
      crawlProgress(job({ phase: 'crawl', progress: { crawl: { visited: 12, target: -5 } } })),
    ).toBe(0);
  });

  it('tracks visited over target mid crawl', () => {
    expect(
      crawlProgress(job({ phase: 'crawl', progress: { crawl: { visited: 5, target: 10 } } })),
    ).toBe(50);
  });

  it('reads 100 when the crawl finished and clamps outliers', () => {
    expect(
      crawlProgress(job({ phase: 'scan', progress: { crawl: { visited: 10, target: 10 } } })),
    ).toBe(100);
    expect(
      crawlProgress(job({ phase: 'scan', progress: { crawl: { visited: 15, target: 10 } } })),
    ).toBe(100);
    expect(
      crawlProgress(job({ phase: 'scan', progress: { crawl: { visited: -3, target: 10 } } })),
    ).toBe(0);
  });

  it('is null while an uncapped crawl is queued or crawling', () => {
    // Sentinel target of an uncapped crawl, the same value the scanner
    // stores when no page limit was set.
    const uncapped = Number.MAX_SAFE_INTEGER;
    expect(
      crawlProgress(
        job({ phase: 'queued', progress: { crawl: { visited: 0, target: uncapped } } }),
      ),
    ).toBe(null);
    expect(
      crawlProgress(
        job({ phase: 'crawl', progress: { crawl: { visited: 120, target: uncapped } } }),
      ),
    ).toBe(null);
  });

  it('pins an uncapped crawl to 100 once the job moved past it', () => {
    const uncapped = Number.MAX_SAFE_INTEGER;
    expect(
      crawlProgress(
        job({ phase: 'scan', progress: { crawl: { visited: 120, target: uncapped } } }),
      ),
    ).toBe(100);
    expect(
      crawlProgress(
        job({ phase: 'report-en', progress: { crawl: { visited: 120, target: uncapped } } }),
      ),
    ).toBe(100);
  });
});

describe('scanProgress', () => {
  it('is 0 before the scan starts', () => {
    expect(scanProgress(job({ status: 'queued', phase: 'queued' }))).toBe(0);
    expect(scanProgress(job({ phase: 'crawl' }))).toBe(0);
  });

  it('reads 100 past the crawl phase even without scan counters', () => {
    expect(scanProgress(job({ phase: 'normalize' }))).toBe(100);
    expect(scanProgress(job({ phase: 'report-en' }))).toBe(100);
  });

  it('tracks scanned over target and clamps outliers', () => {
    expect(
      scanProgress(job({ phase: 'scan', progress: { scan: { scanned: 5, target: 10 } } })),
    ).toBe(50);
    expect(
      scanProgress(job({ phase: 'scan', progress: { scan: { scanned: 10, target: 10 } } })),
    ).toBe(100);
    expect(
      scanProgress(job({ phase: 'scan', progress: { scan: { scanned: 40, target: 10 } } })),
    ).toBe(100);
    expect(
      scanProgress(job({ phase: 'scan', progress: { scan: { scanned: 3, target: 0 } } })),
    ).toBe(0);
  });
});

describe('formatEta', () => {
  it('renders sub-minute estimates as whole seconds', () => {
    expect(formatEta(45_000)).toBe('45 s');
    expect(formatEta(500)).toBe('1 s');
    expect(formatEta(0)).toBe('0 s');
    expect(formatEta(-1_000)).toBe('0 s');
  });

  it('rounds up to whole minutes like the old page', () => {
    expect(formatEta(60_000)).toBe('1 min');
    expect(formatEta(61_000)).toBe('2 min');
    expect(formatEta(120_000)).toBe('2 min');
  });
});

describe('phase label mapping', () => {
  const labels = en.progress.phaseLabels;

  it('maps every copy-table phase', () => {
    expect(currentPhaseLabel('queued', labels)).toBe(labels.queued);
    expect(currentPhaseLabel('report-fr', labels)).toBe(labels['report-fr']);
    expect(currentPhaseLabel('complete', labels)).toBe(labels.complete);
  });

  it('falls back to the raw phase outside the copy table', () => {
    expect(currentPhaseLabel('afnic-scan', labels)).toBe('afnic-scan');
    expect(currentPhaseLabel('mystery-phase', labels)).toBe('mystery-phase');
    expect(isKnownPhase('scanning')).toBe(true);
    expect(isKnownPhase('afnic-scan')).toBe(false);
  });
});

describe('urlResultState', () => {
  it('keeps the old badge semantics', () => {
    expect(urlResultState('complete')).toBe('complete');
    expect(urlResultState('error')).toBe('failed');
    expect(urlResultState('pending')).toBe('running');
    expect(urlResultState('scanning')).toBe('running');
    expect(urlResultState('skipped-non-html')).toBe('running');
  });
});
