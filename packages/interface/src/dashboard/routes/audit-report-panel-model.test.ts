import { describe, expect, it } from 'vitest';
import {
  reportProductionView,
  auditReportPanelRows,
  canApproveReportPair,
  describeProduceFailure,
  describeWritingGuardRejections,
  findPanelRow,
  produceButtonState,
} from './audit-report-panel-model';
import type { WritingCandidateResponse } from './prepare-report-types';

const baseInput = {
  findingsStale: false,
  hasUnconfirmedIdentityFields: false,
  analysisPair: 'none' as const,
  lifecycle: 'scanned' as const,
};

describe('auditReportPanelRows', () => {
  it('marks every row done/ready on a fully healthy, delivered audit', () => {
    const rows = auditReportPanelRows(
      { ...baseInput, analysisPair: 'selected', lifecycle: 'approved' },
      'fr',
    );
    expect(rows).toEqual([
      { key: 'findings', status: 'done' },
      { key: 'identity', status: 'done' },
      { key: 'writing', status: 'ready' },
      { key: 'produce', status: 'ready' },
      { key: 'delivery', status: 'ready' },
    ]);
  });

  it('blocks findings and identity independently of one another', () => {
    const rows = auditReportPanelRows(
      { ...baseInput, findingsStale: true, hasUnconfirmedIdentityFields: true },
      'fr',
    );
    expect(findPanelRow(rows, 'findings').status).toBe('blocked');
    expect(findPanelRow(rows, 'identity').status).toBe('blocked');
  });

  it('never blocks writing: no ceremony gates it any more (plan 045 2.1/2.2)', () => {
    const rows = auditReportPanelRows(
      { ...baseInput, findingsStale: true, hasUnconfirmedIdentityFields: true },
      'fr',
    );
    expect(findPanelRow(rows, 'writing').status).toBe('ready');
  });

  it('blocks produce with a reason when no bilingual pair resolves', () => {
    const rows = auditReportPanelRows(baseInput, 'fr');
    const produce = findPanelRow(rows, 'produce');
    expect(produce.status).toBe('blocked');
    expect(produce.disabledReason).toBe(
      'Aucune rédaction bilingue n’est encore disponible : rédigez le rapport ci-dessus avant de produire les PDF.',
    );
  });

  it('blocks delivery with a reason until the pair is fresh', () => {
    const rows = auditReportPanelRows(
      { ...baseInput, analysisPair: 'selected', lifecycle: 'analysed' },
      'en',
    );
    const delivery = findPanelRow(rows, 'delivery');
    expect(delivery.status).toBe('blocked');
    expect(delivery.disabledReason).toBe(
      'No fresh report is available yet for approval and download.',
    );
  });

  it('treats a legacy-latest pair the same as a selected one for produce', () => {
    const rows = auditReportPanelRows({ ...baseInput, analysisPair: 'legacy-latest' }, 'fr');
    expect(findPanelRow(rows, 'produce').status).toBe('ready');
  });
});

describe('produceButtonState', () => {
  it('disables the button and surfaces the row reason when blocked', () => {
    const rows = auditReportPanelRows(baseInput, 'fr');
    const state = produceButtonState(findPanelRow(rows, 'produce'), false, 'fr');
    expect(state.enabled).toBe(false);
    expect(state.label).toBe('Régénérer les PDF');
    expect(state.hint).toBeUndefined();
  });

  it('labels the refresh-first variant and carries its hint when findings are stale', () => {
    const rows = auditReportPanelRows({ ...baseInput, analysisPair: 'selected' }, 'fr');
    const state = produceButtonState(findPanelRow(rows, 'produce'), true, 'fr');
    expect(state.enabled).toBe(true);
    expect(state.label).toBe('Actualiser les constats puis régénérer les PDF');
    expect(state.hint).toBe(
      'Les constats de cet audit ne sont plus à jour ; ils seront actualisés avant que les PDF ne soient produits.',
    );
  });
});

describe('describeProduceFailure', () => {
  const overflow =
    'Report generation aborted: Painted content <div> extends past the printable content rectangle on physical page 2 at right by 1793.7px. Never shipped to a client.';

  it('explains a print overflow in French with its page and amount, keeping the raw detail', () => {
    const result = describeProduceFailure(overflow, 'fr');
    expect(result.heading).toBe('Les PDF n’ont pas pu être produits');
    expect(result.explanation).toContain('page 2');
    expect(result.explanation).toContain('1794 px');
    expect(result.technicalDetail).toBe(overflow);
  });

  it('names the finding involved when the renderer reports one', () => {
    const result = describeProduceFailure(
      'Report generation aborted: Painted content <div> extends past the printable content rectangle on physical page 32 at right by 1793.7px in finding f052. Never shipped to a client.',
      'fr',
    );
    expect(result.explanation).toContain('page 32');
    expect(result.explanation).toContain('Constat en cause : f052.');
  });

  it('names the report section involved when the renderer reports one', () => {
    const result = describeProduceFailure(
      'Report generation aborted: Painted content <div> extends past the printable content rectangle on physical page 18 at right by 1793.7px in section "Autres constats". Never shipped to a client.',
      'fr',
    );
    expect(result.explanation).toContain('page 18');
    expect(result.explanation).toContain('Section en cause : « Autres constats ».');
    expect(result.explanation).not.toContain('Constat en cause');
  });

  it('names the passage when the overflow sits outside any titled section (issue #276)', () => {
    const result = describeProduceFailure(
      'Report generation aborted: Painted content <div> extends past the printable content rectangle on physical page 11 at right by 1793.7px, block starting "Sur la page Devis, un menu…".',
      'fr',
    );
    expect(result.explanation).toContain('page 11');
    expect(result.explanation).toContain('Passage en cause : « Sur la page Devis, un menu… ».');
  });

  it('explains a stale-data refusal as a format change, not a layout failure', () => {
    const stale =
      'Report generation aborted: stale analysis uses normalization fingerprint 5d6066235a290ca9; current findings use d3e7566e15352410. Run normalize and regenerate the analyses.';
    const result = describeProduceFailure(stale, 'en');
    expect(result.explanation).toContain('changed format');
    expect(result.technicalDetail).toBe(stale);
    expect(
      describeProduceFailure(
        'Report generation aborted: legacy report has no findings provenance. Run normalize.',
        'fr',
      ).explanation,
    ).toContain('format des données');
  });

  it('explains an unconfirmed cover identity separately', () => {
    expect(
      describeProduceFailure(
        'Report generation aborted: the client identity on the cover is still a detected guess.',
        'en',
      ).explanation,
    ).toContain('Confirm it above');
  });

  it('uses the layout wording for other renderer refusals and a generic one otherwise', () => {
    expect(
      describeProduceFailure('Report generation aborted: stranded heading.', 'en').explanation,
    ).toBe('The report layout failed the print safety check. No PDF was delivered.');
    const generic = describeProduceFailure(undefined, 'en');
    expect(generic.explanation).toBe('Producing the PDFs was refused. No PDF was delivered.');
    expect(generic.technicalDetail).toBeUndefined();
  });
});

describe('reportProductionView (issue #376)', () => {
  const at = '2026-09-17T10:00:00.000Z';

  it('shows nothing and leaves every action available when idle', () => {
    for (const state of [undefined, { status: 'idle' as const }]) {
      const view = reportProductionView(state, 'en');
      expect(view.banner).toBeNull();
      expect(view.busy).toBe(false);
      expect(view.busyLabel).toBeUndefined();
    }
  });

  it('marks writing current and replaces the actions with a writing label', () => {
    const view = reportProductionView({ status: 'writing', startedAt: at, updatedAt: at }, 'en');
    expect(view.busy).toBe(true);
    expect(view.busyLabel).toBe('Writing report…');
    expect(view.banner).toMatchObject({ tone: 'active', title: 'Writing report…' });
    expect(view.steps.map((step) => step.state)).toEqual(['done', 'current', 'pending', 'pending']);
  });

  it('marks PDF generation current and keeps Regenerate PDFs unavailable', () => {
    const view = reportProductionView(
      { status: 'pdf-generation', startedAt: at, updatedAt: at },
      'fr',
    );
    expect(view.busy).toBe(true);
    expect(view.busyLabel).toBe('Génération des PDF…');
    expect(view.steps.map((step) => step.state)).toEqual(['done', 'done', 'current', 'pending']);
  });

  it('shows ready and frees the actions once completed', () => {
    const view = reportProductionView({ status: 'completed', finishedAt: at }, 'en');
    expect(view.busy).toBe(false);
    expect(view.banner).toMatchObject({ tone: 'ready', title: 'Report ready' });
    expect(view.steps.every((step) => step.state === 'done')).toBe(true);
  });

  it('names the failed stage, keeps the message, and allows a retry', () => {
    const writing = reportProductionView(
      { status: 'failed', stage: 'writing', message: 'quota', finishedAt: at },
      'en',
    );
    expect(writing.busy).toBe(false);
    expect(writing.banner).toMatchObject({ tone: 'failed', technicalDetail: 'quota' });
    expect(writing.steps.map((step) => step.state)).toEqual([
      'done',
      'failed',
      'pending',
      'pending',
    ]);

    const pdf = reportProductionView(
      { status: 'failed', stage: 'pdf-generation', message: 'overflow', finishedAt: at },
      'fr',
    );
    expect(pdf.banner?.description).toContain('génération des PDF');
    expect(pdf.steps.map((step) => step.state)).toEqual(['done', 'done', 'failed', 'pending']);
  });
});

describe('canApproveReportPair', () => {
  const fresh = (language: 'fr' | 'en') => ({
    language,
    status: 'fresh' as const,
    pdfAvailable: true,
  });

  it('allows approval only when both languages have a fresh, verified PDF', () => {
    expect(canApproveReportPair([fresh('fr'), fresh('en')])).toBe(true);
    expect(
      canApproveReportPair([
        fresh('fr'),
        { language: 'en', status: 'unverified', pdfAvailable: false },
      ]),
    ).toBe(false);
    expect(canApproveReportPair([fresh('fr'), { ...fresh('en'), status: 'stale' }])).toBe(false);
    expect(canApproveReportPair([fresh('fr')])).toBe(false);
  });
});

// Issue #409: an exhausted writing run used to show one message - the last
// attempt's - so three attempts lost to three different guards looked like a
// single failure, and the two earlier reasons existed only in the server's
// logs.
describe('describeWritingGuardRejections', () => {
  const failed = (
    guardRejections?: { attempt: number; totalAttempts: number; guards: string[] }[],
  ): WritingCandidateResponse => ({
    status: 'failed',
    reason: 'exhausted 3 attempts',
    createdAt: '2026-09-17T10:00:00.000Z',
    ...(guardRejections ? { guardRejections } : {}),
  });

  it('names every attempt and the guards that rejected it', () => {
    expect(
      describeWritingGuardRejections(
        failed([
          { attempt: 1, totalAttempts: 3, guards: ['severity-vocabulary'] },
          { attempt: 2, totalAttempts: 3, guards: ['prose-register'] },
          { attempt: 3, totalAttempts: 3, guards: ['provider-placement', 'prose-register'] },
        ]),
        'fr',
      ),
    ).toEqual([
      'Tentative 1 sur 3 refusée par : severity-vocabulary',
      'Tentative 2 sur 3 refusée par : prose-register',
      'Tentative 3 sur 3 refusée par : provider-placement, prose-register',
    ]);
  });

  it('renders in English too', () => {
    expect(
      describeWritingGuardRejections(
        failed([{ attempt: 2, totalAttempts: 3, guards: ['wcag-citation'] }]),
        'en',
      ),
    ).toEqual(['Attempt 2 of 3 rejected by: wcag-citation']);
  });

  it('says nothing for a failure with no guard record, such as a provider outage', () => {
    expect(describeWritingGuardRejections(failed(), 'fr')).toEqual([]);
  });

  it('says nothing for a candidate that did not fail', () => {
    expect(
      describeWritingGuardRejections(
        {
          status: 'ready',
          pair: { frAnalysisId: 'a', enAnalysisId: 'b' },
          createdAt: '2026-09-17T10:00:00.000Z',
        },
        'fr',
      ),
    ).toEqual([]);
  });
});
