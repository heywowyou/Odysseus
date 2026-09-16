import { describe, expect, it } from 'vitest';
import {
  ADVANCED_SCAN_FIELDS,
  BATCH_SCAN_FIELDS,
  buildBatchScanRequest,
  buildScanRequest,
  moveBatchRow,
  planBatchScan,
  createEmptyFormValues,
  isValidAbsoluteHttpUrl,
  initialScanTypeFromQuery,
  isValidSiren,
  NEW_SCAN_TYPES,
  parseDelaySecondsToMs,
  prefillUrlFromQuery,
  validateSiren,
} from './new-scan-model';
import type { NewScanFormValues } from './new-scan-model';

const INVALID_SIREN_COPY = 'SIREN invalide';

/** Pure fixture factory: the empty form overridden per test, so each case
 *  names only the fields it cares about. */
function formValues(overrides: Partial<NewScanFormValues> = {}): NewScanFormValues {
  return { ...createEmptyFormValues(), type: 'full-audit', ...overrides };
}

describe('isValidAbsoluteHttpUrl', () => {
  it('accepts absolute http and https URLs', () => {
    expect(isValidAbsoluteHttpUrl('https://exemple.fr')).toBe(true);
    expect(isValidAbsoluteHttpUrl('http://exemple.fr/a/b?x=1')).toBe(true);
  });

  it('rejects non http(s) schemes', () => {
    expect(isValidAbsoluteHttpUrl('ftp://exemple.fr')).toBe(false);
    expect(isValidAbsoluteHttpUrl('file:///etc/hosts')).toBe(false);
  });

  it('rejects relative URLs', () => {
    expect(isValidAbsoluteHttpUrl('/blog')).toBe(false);
    expect(isValidAbsoluteHttpUrl('exemple.fr/page')).toBe(false);
  });

  it('rejects URLs with embedded credentials', () => {
    expect(isValidAbsoluteHttpUrl('https://user:pass@exemple.fr')).toBe(false);
    expect(isValidAbsoluteHttpUrl('https://user@exemple.fr')).toBe(false);
  });
});

describe('prefillUrlFromQuery', () => {
  it('returns the trimmed value when the query is a valid absolute https URL', () => {
    expect(prefillUrlFromQuery(' https://exemple.fr ')).toBe('https://exemple.fr');
    expect(prefillUrlFromQuery('https://exemple.fr/hebergement?a=1')).toBe(
      'https://exemple.fr/hebergement?a=1',
    );
  });

  it('returns the empty string for a null query', () => {
    expect(prefillUrlFromQuery(null)).toBe('');
  });

  it('returns the empty string for an empty or blank query', () => {
    expect(prefillUrlFromQuery('')).toBe('');
    expect(prefillUrlFromQuery('   ')).toBe('');
  });

  it('returns the empty string for garbage input', () => {
    expect(prefillUrlFromQuery('https://user:pass@exemple.fr')).toBe('');
    expect(prefillUrlFromQuery('::')).toBe('');
  });

  it('returns the empty string for a relative URL', () => {
    expect(prefillUrlFromQuery('/blog')).toBe('');
    expect(prefillUrlFromQuery('exemple.fr/page')).toBe('');
  });
});

describe('SIREN validation', () => {
  it('accepts a checksum valid SIREN, including one written with spaces', () => {
    expect(isValidSiren('552100554')).toBe(true);
    expect(isValidSiren('552 100 554')).toBe(true);
  });

  it('rejects 123456789: right shape, failing INSEE checksum', () => {
    expect(isValidSiren('123456789')).toBe(false);
  });

  it('rejects values that are not exactly 9 digits', () => {
    expect(isValidSiren('12345')).toBe(false);
    expect(isValidSiren('12345678')).toBe(false);
    expect(isValidSiren('12345678a')).toBe(false);
    expect(isValidSiren('')).toBe(false);
  });

  it('validateSiren returns null for empty, blank, or valid values', () => {
    expect(validateSiren('', INVALID_SIREN_COPY)).toBeNull();
    expect(validateSiren('   ', INVALID_SIREN_COPY)).toBeNull();
    expect(validateSiren('552100554', INVALID_SIREN_COPY)).toBeNull();
  });

  it('validateSiren returns the localized copy only when non-empty and invalid', () => {
    expect(validateSiren('123456789', INVALID_SIREN_COPY)).toBe(INVALID_SIREN_COPY);
    expect(validateSiren('552 100 554', INVALID_SIREN_COPY)).toBeNull();
  });
});

describe('buildScanRequest', () => {
  it('defaults the generic entry point to Full scan', () => {
    expect(createEmptyFormValues().type).toBe('full-audit');
    expect(initialScanTypeFromQuery(null)).toBe('full-audit');
    expect(initialScanTypeFromQuery('unknown')).toBe('full-audit');
    expect(initialScanTypeFromQuery('quick-check')).toBe('quick-check');
  });

  it('opens an old Prepare outreach link on the Full scan', () => {
    expect(initialScanTypeFromQuery('prospecting-audit')).toBe('full-audit');
  });

  it('keeps the new-scan form to Quick check and Full scan', () => {
    expect(NEW_SCAN_TYPES).toEqual(['full-audit', 'quick-check']);
  });

  it('builds a full-audit body with every option set, trimming and cleaning values', () => {
    const request = buildScanRequest(
      formValues({
        url: ' https://exemple.fr ',
        siren: '552 100 554',
        transactionalFlow: 'true',
        transactionalFlowReason: '  Moteur de reservation dedie  ',
        maxPages: '50',
        maxDepth: '3',
        delaySeconds: '0,7',
        scanConcurrency: '2',
        seeds: ' https://exemple.fr/a \n\n https://exemple.fr/b ',
        exclusions: 'https://exemple.fr/blog/*',
        bookingEngineUrl: ' https://booking.example.fr/x ',
      }),
    );
    expect(request).toEqual({
      type: 'full-audit',
      url: 'https://exemple.fr',
      options: {
        maxPages: 50,
        maxDepth: 3,
        delayMs: 700,
        scanConcurrency: 2,
        siren: '552100554',
        transactionalFlow: true,
        transactionalFlowReason: 'Moteur de reservation dedie',
        seeds: ['https://exemple.fr/a', 'https://exemple.fr/b'],
        exclusions: ['https://exemple.fr/blog/*'],
        bookingEngineUrl: 'https://booking.example.fr/x',
      },
    });
  });

  it('omits every empty option key on a minimal full-audit body', () => {
    const request = buildScanRequest(formValues({ url: 'https://exemple.fr' }));
    expect(request).toEqual({ type: 'full-audit', url: 'https://exemple.fr', options: {} });
    if (request.type !== 'full-audit') {
      throw new Error('expected a full-audit request');
    }
    expect(Object.keys(request.options)).toEqual([]);
  });

  it('sends transactionalFlow false when the operator picked no', () => {
    const request = buildScanRequest(
      formValues({ url: 'https://exemple.fr', transactionalFlow: 'false' }),
    );
    if (request.type !== 'full-audit') {
      throw new Error('expected a full-audit request');
    }
    expect(request.options).toEqual({ transactionalFlow: false });
  });

  it('drops the transactional flow reason when no yes or no choice was made', () => {
    const request = buildScanRequest(
      formValues({ url: 'https://exemple.fr', transactionalFlowReason: 'ignored' }),
    );
    if (request.type !== 'full-audit') {
      throw new Error('expected a full-audit request');
    }
    expect(request.options).toEqual({});
  });

  it('keeps only positive whole numbers for the numeric crawl options', () => {
    const request = buildScanRequest(
      formValues({
        url: 'https://exemple.fr',
        maxPages: '25',
        maxDepth: '0',
        delaySeconds: 'not-a-number',
        scanConcurrency: 'nope',
      }),
    );
    if (request.type !== 'full-audit') {
      throw new Error('expected a full-audit request');
    }
    expect(request.options).toEqual({ maxPages: 25 });
  });

  it('drops a scanConcurrency that is zero or negative, like the other numeric options', () => {
    for (const raw of ['0', '-3']) {
      const request = buildScanRequest(
        formValues({ url: 'https://exemple.fr', scanConcurrency: raw }),
      );
      if (request.type !== 'full-audit') {
        throw new Error('expected a full-audit request');
      }
      expect(request.options).toEqual({});
    }
  });

  it('builds a prospect-linked Full scan request with every crawl option', () => {
    expect(
      buildScanRequest(
        formValues({
          url: 'https://hotel.example.fr',
          prospectId: 'prospect-1',
          maxPages: '40',
          maxDepth: '2',
          delaySeconds: '60',
          scanConcurrency: '1',
          seeds: 'https://hotel.example.fr/a',
          exclusions: 'https://hotel.example.fr/blog/*',
          bookingEngineUrl: 'https://booking.example.fr/x',
        }),
      ),
    ).toEqual({
      type: 'full-audit',
      url: 'https://hotel.example.fr',
      prospectId: 'prospect-1',
      options: {
        maxPages: 40,
        maxDepth: 2,
        delayMs: 60_000,
        scanConcurrency: 1,
        seeds: ['https://hotel.example.fr/a'],
        exclusions: ['https://hotel.example.fr/blog/*'],
        bookingEngineUrl: 'https://booking.example.fr/x',
      },
    });
  });

  it('sends only the pacing options for a one-page Quick Check', () => {
    const request = buildScanRequest(
      formValues({
        type: 'quick-check',
        url: 'https://hotel.example.fr',
        maxPages: '40',
        maxDepth: '2',
        delaySeconds: '5',
        scanConcurrency: '1',
        seeds: 'https://hotel.example.fr/a',
      }),
    );
    expect(request).toEqual({
      type: 'quick-check',
      url: 'https://hotel.example.fr',
      options: { delayMs: 5000, scanConcurrency: 1 },
    });
  });
});

describe('parseDelaySecondsToMs', () => {
  it('reads the operator value as seconds, so 60 is a one-minute pause', () => {
    expect(parseDelaySecondsToMs('1')).toBe(1000);
    expect(parseDelaySecondsToMs('60')).toBe(60_000);
    expect(parseDelaySecondsToMs(' 1.5 ')).toBe(1500);
    expect(parseDelaySecondsToMs('2,5')).toBe(2500);
  });

  it('omits empty, zero, negative, sub-millisecond and non-numeric values', () => {
    for (const raw of ['', '   ', '0', '-3', '0.0001', 'soon']) {
      expect(parseDelaySecondsToMs(raw)).toBeUndefined();
    }
  });
});

describe('batch scan submission', () => {
  const prospect = (
    name: string,
    websites: { url: string; primary: boolean }[] = [{ url: `https://${name}.fr/`, primary: true }],
  ) => ({ prospectId: `p-${name}`, name, websites });

  it('offers every single-site option except the ones that name pages of one site', () => {
    for (const type of NEW_SCAN_TYPES) {
      expect(BATCH_SCAN_FIELDS[type]).toEqual(
        ADVANCED_SCAN_FIELDS[type].filter(
          (field) => field !== 'seeds' && field !== 'bookingEngineUrl',
        ),
      );
    }
  });

  it('resolves each prospect to its primary website, keeping selection order', () => {
    const plan = planBatchScan([
      prospect('b'),
      prospect('a', [
        { url: 'https://old-a.fr/', primary: false },
        { url: 'https://a.fr/', primary: true },
      ]),
      prospect('c', [{ url: 'https://c.fr/', primary: false }]),
    ]);
    expect(plan.rows).toEqual([
      { prospectId: 'p-b', name: 'b', url: 'https://b.fr/' },
      { prospectId: 'p-a', name: 'a', url: 'https://a.fr/' },
      { prospectId: 'p-c', name: 'c', url: 'https://c.fr/' },
    ]);
    expect(plan.withoutWebsite).toEqual([]);
  });

  it('sets aside prospects with no usable website', () => {
    const plan = planBatchScan([
      prospect('none', []),
      prospect('broken', [{ url: 'pending', primary: true }]),
      prospect('ok'),
    ]);
    expect(plan.rows.map((row) => row.name)).toEqual(['ok']);
    expect(plan.withoutWebsite).toEqual(['none', 'broken']);
  });

  it('moves a row within bounds only', () => {
    expect(moveBatchRow(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveBatchRow(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveBatchRow(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveBatchRow(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });

  it('builds the batch body from the rows and only the shared options', () => {
    const request = buildBatchScanRequest(
      formValues({
        type: 'full-audit',
        url: 'https://ignored.fr/',
        siren: '732829320',
        maxPages: '150',
        delaySeconds: '2',
        exclusions: '/blog/*\n',
        seeds: 'https://a.fr/chambres',
        bookingEngineUrl: 'https://booking.example/',
      }),
      [
        { prospectId: 'p-b', name: 'b', url: 'https://b.fr/' },
        { prospectId: 'p-a', name: 'a', url: 'https://a.fr/' },
      ],
    );
    expect(request).toEqual({
      type: 'full-audit',
      items: [
        { prospectId: 'p-b', url: 'https://b.fr/' },
        { prospectId: 'p-a', url: 'https://a.fr/' },
      ],
      options: { maxPages: 150, delayMs: 2000, exclusions: ['/blog/*'] },
    });
  });

  it('keeps a Quick check batch to its pacing options', () => {
    const request = buildBatchScanRequest(
      formValues({ type: 'quick-check', maxPages: '150', scanConcurrency: '2' }),
      [{ prospectId: 'p-a', name: 'a', url: 'https://a.fr/' }],
    );
    expect(request.options).toEqual({ scanConcurrency: 2 });
  });
});
