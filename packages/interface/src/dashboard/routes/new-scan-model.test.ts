import { describe, expect, it } from 'vitest';
import {
  buildScanRequest,
  createEmptyFormValues,
  isValidAbsoluteHttpUrl,
  isValidSiren,
  validateSiren,
} from './new-scan-model';
import type { NewScanFormValues } from './new-scan-model';

const INVALID_SIREN_COPY = 'SIREN invalide';

/** Pure fixture factory: the empty form overridden per test, so each case
 *  names only the fields it cares about. */
function formValues(overrides: Partial<NewScanFormValues> = {}): NewScanFormValues {
  return { ...createEmptyFormValues(), ...overrides };
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
  it('builds a full-audit body with every option set, trimming and cleaning values', () => {
    const request = buildScanRequest(
      formValues({
        url: ' https://exemple.fr ',
        siren: '552 100 554',
        transactionalFlow: 'true',
        transactionalFlowReason: '  Moteur de reservation dedie  ',
        maxPages: '50',
        maxDepth: '3',
        delayMs: '700',
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
        delayMs: 'not-a-number',
      }),
    );
    if (request.type !== 'full-audit') {
      throw new Error('expected a full-audit request');
    }
    expect(request.options).toEqual({ maxPages: 25 });
  });

  it('builds a prospecting body by splitting lines, trimming, and dropping empties', () => {
    const request = buildScanRequest(
      formValues({
        type: 'prospecting',
        urls: ' https://a.fr \n\nhttps://b.fr\n   \n',
      }),
    );
    expect(request).toEqual({ type: 'prospecting', urls: ['https://a.fr', 'https://b.fr'] });
  });

  it('builds a prospecting body with an empty urls array when every line is blank', () => {
    const request = buildScanRequest(formValues({ type: 'prospecting', urls: ' \n  \n' }));
    expect(request).toEqual({ type: 'prospecting', urls: [] });
  });
});
