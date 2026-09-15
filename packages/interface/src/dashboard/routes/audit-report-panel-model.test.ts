import { describe, expect, it } from 'vitest';
import {
  auditReportPanelRows,
  describeProduceFailure,
  findPanelRow,
  produceButtonState,
} from './audit-report-panel-model';

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

  it('uses the layout wording for other renderer refusals and a generic one otherwise', () => {
    expect(
      describeProduceFailure('Report generation aborted: stranded heading.', 'en').explanation,
    ).toBe('The report layout failed the print safety check. No PDF was delivered.');
    const generic = describeProduceFailure(undefined, 'en');
    expect(generic.explanation).toBe('Producing the PDFs was refused. No PDF was delivered.');
    expect(generic.technicalDetail).toBeUndefined();
  });
});
