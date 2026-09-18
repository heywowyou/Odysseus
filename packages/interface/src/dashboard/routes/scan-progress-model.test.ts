import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import type { ScanJobDetail, ScanUrlResult } from '../lib/api-types';
import {
  terminalCardKind,
  agedEtaMs,
  crawlProgress,
  contentScanProgress,
  coverageSegments,
  currentPhaseLabel,
  formatEta,
  isKnownPhase,
  isTerminal,
  hasStagedAnalysisProgress,
  lighthouseProgress,
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
    failedPhase?: string;
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
    ...(fields.failedPhase !== undefined ? { failedPhase: fields.failedPhase } : {}),
  };
}

describe('coverageSegments', () => {
  // Issue #393: atlantichotel.fr showed Inventoried 378 against a content
  // target of 341 with nothing explaining the 37 other URLs.
  it('gives navigated-but-unchecked URLs their own band so the counts reconcile', () => {
    const segments = coverageSegments(
      job({
        progress: {
          crawl: { visited: 378, target: 378 },
          contentScan: { completed: 341, target: 341, etaMs: 0 },
          crawlExclusions: {
            discoveryOnly: 0,
            externalRedirect: 9,
            nonHtml: 20,
            httpError: 7,
            error: 1,
          },
        },
      }),
      en.common.coverage,
    );
    const byKind = Object.fromEntries(segments.map((segment) => [segment.kind, segment]));
    expect(byKind['checked']).toMatchObject({ displayValue: 341 });
    expect(byKind['excluded']).toMatchObject({ value: 37, displayValue: 37 });
    expect(byKind['reached']).toMatchObject({ value: 0, displayValue: 378 });
  });

  // Captured job record from GitHub issue #33 (www.villasfoch.fr, job
  // 3ec80395-1070-4d55-8ea7-7c7701ba3d31, 2026-09-03): 32 URLs visited, 28
  // content-checked, 28 performance-measured, none omitted. The strip used
  // to print "Contenu vérifié 0" here even though 28 pages were checked.
  it('labels each band with its absolute charter count, not the residual used for width', () => {
    const segments = coverageSegments(
      job({
        progress: {
          crawl: { visited: 32, target: 32 },
          contentScan: { completed: 28, target: 32, etaMs: 0 },
          lighthouse: { completed: 28, target: 28, etaMs: 0 },
        },
      }),
      en.common.coverage,
    );

    const byKind = Object.fromEntries(segments.map((segment) => [segment.kind, segment]));
    expect(byKind['measured']).toMatchObject({ value: 28, displayValue: 28 });
    // Residual width is 0 (checked === measured here), but the label still
    // reads the true content-checked count.
    expect(byKind['checked']).toMatchObject({ value: 0, displayValue: 28 });
    expect(byKind['reached']).toMatchObject({ value: 4, displayValue: 32 });
    expect(byKind['omitted']).toMatchObject({ value: 0, displayValue: 0 });
  });
});

describe('terminalCardKind', () => {
  // Issue #386: Cap d'Antibes saved its audit, then the PDF gate refused the
  // French render; the progress page must not call that a failed scan.
  it('shows a completed scan with a report failure for a report-stage failure', () => {
    for (const failedPhase of ['analyze-fr', 'analyze-en', 'report-fr', 'report-en']) {
      expect(
        terminalCardKind(
          job({ status: 'failed', phase: 'failed', auditId: 'audit-1', failedPhase }),
        ),
      ).toBe('report-issue');
    }
    expect(terminalCardKind(job({ status: 'failed', phase: 'failed', auditId: 'audit-1' }))).toBe(
      'report-issue',
    );
  });

  it('keeps crawl, coverage-gate and audit-stage failures as a failed scan', () => {
    expect(terminalCardKind(job({ status: 'failed', phase: 'failed', failedPhase: 'crawl' }))).toBe(
      'failed',
    );
    expect(
      terminalCardKind(
        job({
          status: 'failed',
          phase: 'failed',
          failedPhase: 'scan',
          error: 'crawl delay and scan concurrency',
        }),
      ),
    ).toBe('failed');
    expect(terminalCardKind(job({ status: 'failed', phase: 'failed' }))).toBe('failed');
  });

  it('leaves cancelled, needs-input and complete jobs unchanged', () => {
    expect(terminalCardKind(job({ status: 'cancelled', auditId: 'audit-1' }))).toBe('cancelled');
    expect(terminalCardKind(job({ status: 'needs-input', auditId: 'audit-1' }))).toBe(
      'needs-input',
    );
    expect(terminalCardKind(job({ status: 'complete', auditId: 'audit-1' }))).toBe('complete');
  });
});

describe('isTerminal', () => {
  it('is false while the job can still change', () => {
    expect(isTerminal(undefined)).toBe(false);
    expect(isTerminal('queued')).toBe(false);
    expect(isTerminal('running')).toBe(false);
    expect(isTerminal('cancel-requested')).toBe(false);
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

describe('staged analysis progress', () => {
  it('tracks content and Lighthouse independently and handles a zero-page audit', () => {
    expect(
      contentScanProgress(
        job({ phase: 'content-scan', progress: { contentScan: { completed: 2, target: 4 } } }),
      ),
    ).toBe(50);
    expect(
      lighthouseProgress(
        job({ phase: 'lighthouse', progress: { lighthouse: { completed: 1, target: 4 } } }),
      ),
    ).toBe(25);
    expect(
      contentScanProgress(
        job({ phase: 'normalize', progress: { contentScan: { completed: 0, target: 0 } } }),
      ),
    ).toBe(100);
    expect(
      lighthouseProgress(
        job({ phase: 'normalize', progress: { lighthouse: { completed: 0, target: 0 } } }),
      ),
    ).toBe(100);
  });

  it('keeps legacy scan counters on the legacy model path', () => {
    const legacy = job({ phase: 'scan', progress: { scan: { scanned: 3, target: 6 } } });
    expect(hasStagedAnalysisProgress(legacy)).toBe(false);
    expect(scanProgress(legacy)).toBe(50);
    expect(
      hasStagedAnalysisProgress(
        job({
          phase: 'select-performance',
          progress: { contentScan: { completed: 6, target: 6 } },
        }),
      ),
    ).toBe(true);
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

describe('agedEtaMs', () => {
  it('returns the raw etaMs unchanged when etaCalculatedAt is absent', () => {
    expect(agedEtaMs(10_000, undefined, Date.now())).toBe(10_000);
  });

  it('returns the raw etaMs unchanged when etaCalculatedAt cannot be parsed', () => {
    expect(agedEtaMs(10_000, 'not-a-date', Date.now())).toBe(10_000);
  });

  it('subtracts the elapsed wall time since etaCalculatedAt', () => {
    const calculatedAt = new Date('2026-01-01T00:00:00.000Z');
    const now = calculatedAt.getTime() + 4000;
    expect(agedEtaMs(10_000, calculatedAt.toISOString(), now)).toBe(6000);
  });

  it('never goes negative once the aged estimate has fully elapsed', () => {
    const calculatedAt = new Date('2026-01-01T00:00:00.000Z');
    const now = calculatedAt.getTime() + 30_000;
    expect(agedEtaMs(10_000, calculatedAt.toISOString(), now)).toBe(0);
  });
});

describe('phase label mapping', () => {
  const labels = en.progress.phaseLabels;

  it('maps every copy-table phase', () => {
    expect(currentPhaseLabel('queued', labels)).toBe(labels.queued);
    expect(currentPhaseLabel('report-fr', labels)).toBe(labels['report-fr']);
    expect(currentPhaseLabel('select-performance', labels)).toBe(labels['select-performance']);
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
