import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { fr } from '../i18n/fr';
import {
  buildManualFieldsPatch,
  canCreateOutreachDraft,
  canRevokeOutreachPreview,
  countOccurrences,
  countPages,
  failureReasonKind,
  fallbackNoticeText,
  findingDisplayTitle,
  findingExpansionView,
  findingRemediation,
  findPublisherIdentificationFinding,
  hasPageCountWarning,
  hostnameOf,
  isPreviewUnavailableDraftRefusal,
  isReportStageFailure,
  isSeverity,
  isValidSiren,
  manualFieldValuesFromResponse,
  normalizeSiren,
  outreachRefusalCopy,
  outreachRefusalSentence,
  reportStepperSteps,
  REPORT_PAGE_COUNT_WARNING_THRESHOLD,
  sortFindings,
  tokenFromPublishedUrl,
} from './audit-detail-model';
import type { ManualFieldValues, ReportStepperInput, RuleCopyMap } from './audit-detail-model';
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

describe('findPublisherIdentificationFinding', () => {
  it('returns only the persisted publisher-identification finding', () => {
    const publisherIdentification = finding({
      findingId: 'lcen-1',
      ruleId: 'lcen-mentions-legales-missing',
      severity: 'serious',
    });

    expect(
      findPublisherIdentificationFinding([
        finding({ findingId: 'contrast-1', ruleId: 'color-contrast' }),
        publisherIdentification,
      ]),
    ).toBe(publisherIdentification);
  });

  it('stays absent without the dedicated scanner rule', () => {
    expect(
      findPublisherIdentificationFinding([finding({ ruleId: 'color-contrast' })]),
    ).toBeUndefined();
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

describe('fallbackNoticeText (issue #162)', () => {
  it('is undefined for a model-generated analysis pair', () => {
    expect(fallbackNoticeText(false, 'fr')).toBeUndefined();
    expect(fallbackNoticeText(false, 'en')).toBeUndefined();
  });

  it('returns the bilingual notice for a static fallback pair', () => {
    expect(fallbackNoticeText(true, 'fr')).toBe(fr.auditDetail.analysisStaticFallbackNotice);
    expect(fallbackNoticeText(true, 'en')).toBe(en.auditDetail.analysisStaticFallbackNotice);
    expect(fr.auditDetail.analysisStaticFallbackNotice).not.toBe(
      en.auditDetail.analysisStaticFallbackNotice,
    );
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

describe('finding display copy (issue 93)', () => {
  const ruleCopy: RuleCopyMap = {
    'button-name': {
      titleFr: 'Les boutons doivent avoir un texte explicite',
      glossFr: 'Un bouton sans texte lisible ne dit pas à quoi il sert.',
      remediationFr: 'Ajoutez un texte visible dans chaque bouton.',
      remediationEn: 'Add visible text inside every button.',
    },
  };

  const buttonFinding = finding({ ruleId: 'button-name' });
  const unknownFinding = finding({ ruleId: 'never-observed-rule', title: 'Raw detector' });

  it('replaces the raw detector title with the reviewed French title', () => {
    expect(findingDisplayTitle(buttonFinding, ruleCopy, 'fr')).toBe(
      'Les boutons doivent avoir un texte explicite',
    );
  });

  it('keeps the finding title in English and falls back to the raw title', () => {
    expect(findingDisplayTitle(buttonFinding, ruleCopy, 'en')).toBe(buttonFinding.title);
    expect(findingDisplayTitle(unknownFinding, ruleCopy, 'fr')).toBe('Raw detector');
    expect(findingDisplayTitle(unknownFinding, ruleCopy, 'en')).toBe('Raw detector');
  });

  it('resolves remediation per language and shows nothing without reviewed copy', () => {
    expect(findingRemediation(buttonFinding, ruleCopy, 'fr')).toBe(
      'Ajoutez un texte visible dans chaque bouton.',
    );
    expect(findingRemediation(buttonFinding, ruleCopy, 'en')).toBe(
      'Add visible text inside every button.',
    );
    expect(findingRemediation(unknownFinding, ruleCopy, 'fr')).toBeUndefined();
    expect(findingRemediation(unknownFinding, undefined, 'en')).toBeUndefined();
  });

  it('expands pages and elements with the hidden counts beyond the preview', () => {
    const manyPages = finding({
      ruleId: 'button-name',
      pageUrls: Array.from({ length: 12 }, (_, index) => `https://exemple.fr/page-${index}`),
    });
    const view = findingExpansionView(manyPages, ruleCopy, 'fr');
    expect(view.pages).toHaveLength(8);
    expect(view.hiddenPageCount).toBe(4);
    expect(view.remediation).toBe('Ajoutez un texte visible dans chaque bouton.');
    expect(view.gloss).toBe('Un bouton sans texte lisible ne dit pas à quoi il sert.');
    expect(view.elements).toEqual([]);
    expect(view.hiddenElementCount).toBe(0);
  });

  it('deduplicates pageUrls in the expansion', () => {
    const duplicated = finding({
      pageUrls: ['https://exemple.fr/', 'https://exemple.fr/', 'https://exemple.fr/contact'],
    });
    const view = findingExpansionView(duplicated, undefined, 'en');
    expect(view.pages).toEqual(['https://exemple.fr/', 'https://exemple.fr/contact']);
    expect(view.remediation).toBeUndefined();
    expect(view.gloss).toBeUndefined();
  });
});

describe('outreach preview card model (plan 037 slice 5)', () => {
  it('reads the one-time token from the last segment of the published url', () => {
    expect(tokenFromPublishedUrl('https://www.odysseusaudit.com/apercu/abc123')).toBe('abc123');
    expect(tokenFromPublishedUrl('https://www.odysseusaudit.com/apercu/abc123/')).toBe('');
  });

  it('gates the first draft on a session token or a live server preview', () => {
    expect(canCreateOutreachDraft(null, false)).toBe(false);
    expect(canCreateOutreachDraft('tok', false)).toBe(true);
    expect(canCreateOutreachDraft(null, true)).toBe(true);
    expect(canCreateOutreachDraft('tok', true)).toBe(true);
  });

  it('gates revocation on a live server preview or a publish in this session', () => {
    expect(canRevokeOutreachPreview(false, false)).toBe(false);
    expect(canRevokeOutreachPreview(true, false)).toBe(true);
    expect(canRevokeOutreachPreview(false, true)).toBe(true);
  });

  it('sends the reissue hint for every draft refusal that means an unusable link', () => {
    expect(isPreviewUnavailableDraftRefusal('preview-not-published')).toBe(true);
    expect(isPreviewUnavailableDraftRefusal('preview-revoked')).toBe(true);
    expect(isPreviewUnavailableDraftRefusal('preview-expired')).toBe(true);
    expect(isPreviewUnavailableDraftRefusal('preview-wrong-audit')).toBe(true);
    expect(isPreviewUnavailableDraftRefusal('suppressed')).toBe(false);
    expect(isPreviewUnavailableDraftRefusal('address-suppressed')).toBe(false);
    expect(isPreviewUnavailableDraftRefusal('')).toBe(false);
  });

  it('maps each known refusal code to one sentence per language', () => {
    expect(outreachRefusalCopy('suppressed', 'fr')).toBe(
      fr.auditDetail.outreachPreview.refusalReasons['suppressed'],
    );
    expect(outreachRefusalCopy('suppressed', 'en')).toBe(
      en.auditDetail.outreachPreview.refusalReasons['suppressed'],
    );
    expect(outreachRefusalCopy('coverage-incomplete', 'fr')).not.toBe(
      outreachRefusalCopy('coverage-incomplete', 'en'),
    );
    expect(outreachRefusalCopy('a-future-code', 'fr')).toBeUndefined();
    expect(outreachRefusalCopy('a-future-code', 'en')).toBeUndefined();
  });

  it('always turns a render or publish refusal into a sentence', () => {
    expect(outreachRefusalSentence('audit-in-flight', 'fr')).toBe(
      fr.auditDetail.outreachPreview.refusalReasons['audit-in-flight'],
    );
    expect(outreachRefusalSentence('audit-in-flight', 'en')).toBe(
      en.auditDetail.outreachPreview.refusalReasons['audit-in-flight'],
    );
    // An unknown code falls back to the unavailable notice carrying the
    // raw stable string, deliberately untranslated.
    expect(outreachRefusalSentence('a-future-code', 'fr')).toBe(
      'Aperçu indisponible (a-future-code).',
    );
    expect(outreachRefusalSentence('a-future-code', 'en')).toBe(
      'Preview unavailable (a-future-code).',
    );
  });
});

describe('reportStepperSteps', () => {
  // A touched audit: warnings acknowledged, no writing yet, nothing
  // stored. Each test pushes one step forward.
  const baseInput: ReportStepperInput = {
    acknowledgementCurrent: true,
    warningCount: 0,
    candidateStatus: undefined,
    isWritingSelected: false,
    lifecycle: 'scanned',
    hasStoredReportPair: false,
    hasFreshReportPair: false,
  };

  const statesOf = (input: ReportStepperInput): string[] =>
    reportStepperSteps(input).map((step) => step.state);

  it('walks the ladder from a fresh audit: prepare done, writing active', () => {
    expect(reportStepperSteps(baseInput)).toEqual([
      { key: 'prepare', state: 'done', enabled: true },
      { key: 'redact', state: 'active', enabled: true },
      { key: 'choose', state: 'todo', enabled: false },
      { key: 'produce', state: 'todo', enabled: false },
      { key: 'approve', state: 'todo', enabled: false },
    ]);
  });

  it('keeps every later step locked while warnings await acknowledgement', () => {
    const states = statesOf({ ...baseInput, acknowledgementCurrent: false, warningCount: 2 });
    expect(states).toEqual(['active', 'todo', 'todo', 'todo', 'todo']);
  });

  it('considers preparation done when no warnings exist at all', () => {
    // acknowledgementCurrent is false because the view was never created
    // (the endpoint answered 404); with zero known warnings there is
    // nothing to acknowledge, so the writing step is still reachable.
    const states = statesOf({ ...baseInput, acknowledgementCurrent: false, warningCount: 0 });
    expect(states).toEqual(['done', 'active', 'todo', 'todo', 'todo']);
  });

  it('marks the writing step done for a ready candidate and unlocks the choice', () => {
    const states = statesOf({ ...baseInput, candidateStatus: 'ready' });
    expect(states).toEqual(['done', 'done', 'active', 'todo', 'todo']);
  });

  it('sends a failed candidate back to the writing step', () => {
    const states = statesOf({ ...baseInput, candidateStatus: 'failed' });
    expect(states).toEqual(['done', 'active', 'todo', 'todo', 'todo']);
  });

  it('marks the choice done for a selected writing and unlocks production', () => {
    const states = statesOf({
      ...baseInput,
      candidateStatus: 'selected',
      isWritingSelected: true,
      lifecycle: 'analysed',
      hasStoredReportPair: true,
    });
    expect(states).toEqual(['done', 'done', 'done', 'active', 'todo']);
  });

  it('unlocks production from a stored pair alone when no writing was selected', () => {
    // The static fallback gate stores an analysis pair without operator
    // writing, so a report-stage failure must still be redoable at the
    // production step.
    const states = statesOf({ ...baseInput, hasStoredReportPair: true });
    expect(states).toEqual(['done', 'active', 'todo', 'active', 'todo']);
  });

  it('keeps production locked while no pair exists', () => {
    const steps = reportStepperSteps(baseInput);
    expect(steps.find((step) => step.key === 'produce')?.enabled).toBe(false);
  });

  it('marks production done and approval active once the pair is fresh', () => {
    const states = statesOf({
      ...baseInput,
      candidateStatus: 'selected',
      isWritingSelected: true,
      lifecycle: 'rendered',
      hasStoredReportPair: true,
      hasFreshReportPair: true,
    });
    expect(states).toEqual(['done', 'done', 'done', 'done', 'active']);
  });

  it('finishes on an approved audit with the delivery step done', () => {
    const states = statesOf({
      ...baseInput,
      candidateStatus: 'selected',
      isWritingSelected: true,
      lifecycle: 'approved',
      hasStoredReportPair: true,
      hasFreshReportPair: true,
    });
    expect(states).toEqual(['done', 'done', 'done', 'done', 'done']);
  });
});
