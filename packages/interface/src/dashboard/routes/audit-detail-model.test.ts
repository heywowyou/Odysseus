import { describe, expect, it } from 'vitest';
import {
  buildManualFieldsPatch,
  countOccurrences,
  countPages,
  failureReasonKind,
  hasPageCountWarning,
  hostnameOf,
  isReportStageFailure,
  isSeverity,
  isValidSiren,
  manualFieldValuesFromResponse,
  normalizeSiren,
  REPORT_PAGE_COUNT_WARNING_THRESHOLD,
  sortFindings,
} from './audit-detail-model';
import type { ManualFieldValues } from './audit-detail-model';
import type {
  AuditFailureResponse,
  FindingResponse,
  ManualFieldsResponse,
} from './audit-detail-types';

/** Minimal well-formed finding row; tests override only what they look
 *  at. Field values mirror the locked findings contract. */
function finding(overrides: Partial<FindingResponse>): FindingResponse {
  return {
    findingId: 'finding-1',
    auditId: 'audit-1',
    schemaVersion: 1,
    source: 'axe',
    ruleId: 'color-contrast',
    category: 'accessibility',
    severity: 'moderate',
    wcagCriteria: ['1.4.3'],
    title: 'Low contrast text',
    description: 'Foreground and background colors are too close.',
    pageUrls: ['https://example.fr/'],
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    dedupeKey: 'dedupe-1',
    firstSeenAt: '2026-08-30T10:00:00.000Z',
    lastSeenAt: '2026-08-30T10:00:00.000Z',
    ...overrides,
  };
}

describe('hostnameOf', () => {
  it('returns the bare hostname of a stored site URL', () => {
    expect(hostnameOf('https://lamaisonsaintjean.fr/reservation')).toBe('lamaisonsaintjean.fr');
    expect(hostnameOf('http://www.example.fr/path?query=1')).toBe('www.example.fr');
  });

  it('falls back to the raw string when the URL cannot be parsed', () => {
    expect(hostnameOf('pas une url')).toBe('pas une url');
  });
});

describe('isSeverity', () => {
  it('accepts the four contract values only', () => {
    expect(isSeverity('critical')).toBe(true);
    expect(isSeverity('minor')).toBe(true);
    expect(isSeverity('')).toBe(false);
    expect(isSeverity('major')).toBe(false);
  });
});

describe('sortFindings', () => {
  it('orders critical, serious, moderate, minor', () => {
    const rows = [
      finding({ findingId: 'moderate-1', severity: 'moderate' }),
      finding({ findingId: 'critical-1', severity: 'critical' }),
      finding({ findingId: 'minor-1', severity: 'minor' }),
      finding({ findingId: 'critical-2', severity: 'critical' }),
      finding({ findingId: 'serious-1', severity: 'serious' }),
    ];
    expect(sortFindings(rows).map((row) => row.findingId)).toEqual([
      'critical-1',
      'critical-2',
      'serious-1',
      'moderate-1',
      'minor-1',
    ]);
  });

  it('keeps same-severity rows in server order and does not mutate the input', () => {
    const rows = [
      finding({ findingId: 'first', severity: 'minor' }),
      finding({ findingId: 'second', severity: 'minor' }),
    ];
    const sorted = sortFindings(rows);
    expect(sorted.map((row) => row.findingId)).toEqual(['first', 'second']);
    expect(sorted).not.toBe(rows);
  });
});

describe('hasPageCountWarning', () => {
  it('stays silent at or below the 60 page threshold', () => {
    expect(hasPageCountWarning(REPORT_PAGE_COUNT_WARNING_THRESHOLD)).toBe(false);
    expect(hasPageCountWarning(1)).toBe(false);
  });

  it('warns above the threshold', () => {
    expect(hasPageCountWarning(REPORT_PAGE_COUNT_WARNING_THRESHOLD + 1)).toBe(true);
    expect(hasPageCountWarning(120)).toBe(true);
  });

  it('never warns for a legacy row without a measured page count', () => {
    expect(hasPageCountWarning(undefined)).toBe(false);
  });
});

describe('finding counts', () => {
  it('reads the precomputed occurrence total', () => {
    expect(countOccurrences(finding({ occurrences: 14 }))).toBe(14);
  });

  it('counts unique page URLs only', () => {
    expect(
      countPages(
        finding({
          pageUrls: ['https://example.fr/', 'https://example.fr/', 'https://example.fr/menu'],
        }),
      ),
    ).toBe(2);
  });
});

describe('normalizeSiren and isValidSiren', () => {
  it('strips every whitespace character', () => {
    expect(normalizeSiren('552 100\t554')).toBe('552100554');
  });

  it('accepts a SIREN passing the INSEE checksum, spaces included', () => {
    expect(isValidSiren('552100554')).toBe(true);
    expect(isValidSiren('552 100 554')).toBe(true);
  });

  it('rejects a wrong checksum, a wrong length, or non digits', () => {
    expect(isValidSiren('123456789')).toBe(false);
    expect(isValidSiren('55210055')).toBe(false);
    expect(isValidSiren('5521005540')).toBe(false);
    expect(isValidSiren('552 100 55X')).toBe(false);
    expect(isValidSiren('')).toBe(false);
  });
});

const BASELINE: ManualFieldValues = {
  siren: '552100554',
  sirenSourceUrl: 'https://example.fr/mentions-legales',
  raisonSociale: 'Exemple SARL',
  nomCommercial: '',
  sector: 'hospitality',
  revenueBand: '',
  declarationContactEmail: 'contact@example.fr',
  recipientName: '',
};

describe('buildManualFieldsPatch', () => {
  it('sends nothing when nothing changed', () => {
    expect(buildManualFieldsPatch(BASELINE, BASELINE)).toEqual({});
  });

  it('sends only changed, non-empty keys', () => {
    const values = { ...BASELINE, raisonSociale: 'Nouvelle raison', recipientName: 'Jeanne' };
    expect(buildManualFieldsPatch(values, BASELINE)).toEqual({
      raisonSociale: 'Nouvelle raison',
      recipientName: 'Jeanne',
    });
  });

  it('never sends a field the operator cleared', () => {
    const values = { ...BASELINE, raisonSociale: '   ' };
    expect(buildManualFieldsPatch(values, BASELINE)).toEqual({});
  });

  it('clean spaces out of the siren and skips a merely reformatted one', () => {
    expect(buildManualFieldsPatch({ ...BASELINE, siren: '552 100 554' }, BASELINE)).toEqual({});
    const emptySirenBaseline = { ...BASELINE, siren: '' };
    const values = { ...BASELINE, siren: ' 552100554 ' };
    expect(buildManualFieldsPatch(values, emptySirenBaseline)).toEqual({ siren: '552100554' });
  });

  it('trims changed text values like the server stores them', () => {
    const values = { ...BASELINE, nomCommercial: '  Maison Saint Jean  ' };
    expect(buildManualFieldsPatch(values, BASELINE)).toEqual({
      nomCommercial: 'Maison Saint Jean',
    });
  });

  it('sends sector only as general or hospitality', () => {
    expect(buildManualFieldsPatch({ ...BASELINE, sector: 'general' }, BASELINE)).toEqual({
      sector: 'general',
    });
    expect(buildManualFieldsPatch({ ...BASELINE, sector: '' }, BASELINE)).toEqual({});
  });
});

describe('manualFieldValuesFromResponse', () => {
  it('reads provenanced values and defaults absent fields to empty', () => {
    const manualFields: ManualFieldsResponse = {
      siren: { value: '552100554', provenance: 'detected' },
      sector: { value: 'hospitality', provenance: 'operator' },
      updatedAt: '2026-08-30T00:00:00.000Z',
    };
    expect(manualFieldValuesFromResponse(manualFields)).toEqual({
      siren: '552100554',
      sirenSourceUrl: '',
      raisonSociale: '',
      nomCommercial: '',
      sector: 'hospitality',
      revenueBand: '',
      declarationContactEmail: '',
      recipientName: '',
    });
  });

  it('returns an all-empty form without manual fields', () => {
    expect(manualFieldValuesFromResponse(null)).toEqual({
      siren: '',
      sirenSourceUrl: '',
      raisonSociale: '',
      nomCommercial: '',
      sector: '',
      revenueBand: '',
      declarationContactEmail: '',
      recipientName: '',
    });
  });
});

describe('failureReasonKind and isReportStageFailure (issue 90)', () => {
  const identityFailure: AuditFailureResponse = {
    jobId: 'job-1',
    status: 'needs-input',
    error: 'Report generation aborted: the client identity on the cover is still a detected guess.',
    needsInputFields: [
      { field: 'nomCommercial', value: 'Site Officiel' },
      { field: 'raisonSociale', value: "L'ESPRIT DU SUD" },
    ],
  };
  const plainFailure: AuditFailureResponse = {
    jobId: 'job-2',
    status: 'failed',
    error: 'Report generation aborted: rendered HTML contains 1 render-lint violation(s).',
  };

  it('keys the identity-confirmation case on the typed fields', () => {
    expect(failureReasonKind(identityFailure)).toBe('identity-confirmation');
    expect(failureReasonKind(plainFailure)).toBe('report-stage');
  });

  it('treats an empty typed-field list as the generic case', () => {
    expect(failureReasonKind({ ...identityFailure, needsInputFields: [] })).toBe('report-stage');
  });

  it('shows the failure card only while the reports are not usable', () => {
    expect(isReportStageFailure({ failure: identityFailure, lifecycle: 'analysed' })).toBe(true);
    expect(isReportStageFailure({ failure: plainFailure, lifecycle: 'scanned' })).toBe(true);
    expect(isReportStageFailure({ failure: identityFailure, lifecycle: 'rendered' })).toBe(false);
    expect(isReportStageFailure({ failure: plainFailure, lifecycle: 'approved' })).toBe(false);
    expect(isReportStageFailure({ failure: undefined, lifecycle: 'analysed' })).toBe(false);
  });
});
