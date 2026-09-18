import { describe, expect, it } from 'vitest';
import type { CoverageLedger, PatternEvidence, ReportOnlyInputs } from '@odysseus/core';
import {
  assertCoverageLedgerComplete,
  assertMandatoryDisclosures,
  buildInitialCoverageLedger,
  buildReportEvidenceDossier,
  buildReportFactRegistry,
  reconcileCoverageLedger,
} from './dossier.js';
import { reportQualityDigest } from './digest.js';
import {
  buildFinding,
  buildLimitation,
  buildPayload,
  buildPlan,
  buildProject,
  buildSnapshot,
  ledgerSnapshotOf,
} from './test-fixtures.js';

const payload = buildPayload([
  buildFinding({ findingId: 'f-contrast', category: 'accessibility', severity: 'serious' }),
  buildFinding({
    findingId: 'f-lcp',
    category: 'performance',
    severity: 'moderate',
    pageUrls: ['https://site.test/'],
  }),
  buildFinding({ findingId: 'f-meta', category: 'seo', severity: 'minor' }),
]);
const snapshot = buildSnapshot(payload);
const inputs: ReportOnlyInputs = {
  preparation: {
    fr: {
      language: 'fr',
      coverQuestion: { value: 'Question de test', source: 'fallback' },
      hook: { family: 'accessibility', value: 'Accroche de test', evidenceUnavailable: false },
    },
    en: {
      language: 'en',
      coverQuestion: { value: 'Test question', source: 'fallback' },
      hook: { family: 'accessibility', value: 'Test hook', evidenceUnavailable: false },
    },
  },
};

describe('buildReportFactRegistry binds exact scalar facts to the approved evidence only', () => {
  it('binds the site URL, visited-page count and finding count as scalar facts sourced from the approval digest', () => {
    const registry = buildReportFactRegistry(payload, snapshot, inputs);
    expect(registry.registryVersion).toBe('058-v1');
    expect(registry.inputSnapshotDigest).toBe(snapshot.approvedEvidenceDigest);

    const siteUrl = registry.facts.find((fact) => fact.factId === 'audit.siteUrl');
    expect(siteUrl).toMatchObject({
      kind: 'url',
      value: 'https://site.test',
      display: { fr: 'https://site.test', en: 'https://site.test' },
    });
    const pages = registry.facts.find((fact) => fact.factId === 'audit.pagesVisited');
    expect(pages).toMatchObject({ kind: 'number', value: 12 });
    const findingCount = registry.facts.find((fact) => fact.factId === 'audit.findingCount');
    expect(findingCount).toMatchObject({ kind: 'number', value: 3 });
    for (const fact of [siteUrl, pages, findingCount])
      expect(fact?.sourceRefs).toEqual([payload.approval.auditEvidenceSnapshotDigest]);
  });

  it('derives the finding count from the supplied payload, never from anything else', () => {
    const bigger = buildPayload([
      ...payload.findings,
      buildFinding({ findingId: 'f-extra', category: 'seo', severity: 'minor' }),
    ]);
    const registry = buildReportFactRegistry(bigger, buildSnapshot(bigger), inputs);
    expect(registry.facts.find((fact) => fact.factId === 'audit.findingCount')?.value).toBe(4);
  });

  it('binds the identity fact only when an approved manual SIREN is supplied, sourced from the report-only inputs digest', () => {
    const withoutSiren = buildReportFactRegistry(payload, snapshot, inputs);
    expect(withoutSiren.facts.some((fact) => fact.factId === 'identity.siren')).toBe(false);

    const withSiren = buildReportFactRegistry(payload, snapshot, {
      ...inputs,
      manualFields: {
        siren: { value: '123456789', provenance: 'operator' },
        updatedAt: new Date(0),
      },
    });
    const siren = withSiren.facts.find((fact) => fact.factId === 'identity.siren');
    expect(siren).toMatchObject({
      kind: 'identifier',
      value: '123456789',
      display: { fr: '123456789', en: '123456789' },
    });
    expect(siren?.sourceRefs).toEqual([snapshot.reportOnlyInputsDigest]);
  });
});

describe('buildInitialCoverageLedger accounts for every finding in the payload', () => {
  it('gives every non-minor finding an eligible, unassigned entry', () => {
    const ledger = buildInitialCoverageLedger(payload, snapshot);
    expect(ledger.inputSnapshotDigest).toBe(snapshot.approvedEvidenceDigest);
    expect(ledger.entries.map((entry) => entry.findingId)).toEqual([
      'f-contrast',
      'f-lcp',
      'f-meta',
    ]);
    expect(ledger.entries.find((entry) => entry.findingId === 'f-contrast')).toMatchObject({
      severity: 'serious',
      eligible: true,
      disposition: 'unassigned',
    });
    expect(ledger.entries.find((entry) => entry.findingId === 'f-lcp')).toMatchObject({
      eligible: true,
      disposition: 'unassigned',
    });
  });

  it('marks minor findings ineligible and appendix-only', () => {
    const ledger = buildInitialCoverageLedger(payload, snapshot);
    expect(ledger.entries.find((entry) => entry.findingId === 'f-meta')).toEqual({
      findingId: 'f-meta',
      severity: 'minor',
      eligible: false,
      disposition: 'appendix-only',
    });
  });
});

describe('buildReportEvidenceDossier derives packets and patterns from the payload without inventing findings', () => {
  it('groups findings into one packet per category with the payload finding ids verbatim', () => {
    const dossier = buildReportEvidenceDossier(payload, snapshot);
    expect(dossier.inputSnapshotDigest).toBe(snapshot.approvedEvidenceDigest);
    expect(dossier.packets.map((packet) => packet.packetId)).toEqual([
      'packet:accessibility',
      'packet:performance',
      'packet:seo',
    ]);
    const accessibility = dossier.packets[0];
    expect(accessibility?.category).toBe('accessibility');
    expect(accessibility?.findingIds).toEqual(['f-contrast']);
  });

  it('caps representative evidence refs at 20 and only uses page URLs from the payload', () => {
    const many = buildPayload([
      buildFinding({
        findingId: 'f-wide',
        category: 'rendering',
        severity: 'moderate',
        pageUrls: Array.from({ length: 25 }, (_, i) => `https://site.test/page-${i}`),
      }),
    ]);
    const dossier = buildReportEvidenceDossier(many, buildSnapshot(many));
    const refs = dossier.packets[0]?.representativeEvidenceRefs ?? [];
    expect(refs).toHaveLength(20);
    expect(refs[0]).toBe('https://site.test/page-0');
    expect(refs[19]).toBe('https://site.test/page-19');
  });

  it('passes pattern evidence through untouched and defaults to none', () => {
    const pattern: PatternEvidence = {
      patternId: 'pattern:contrast-family',
      title: 'Low-contrast text across templates',
      findingIds: ['f-contrast'],
      evidenceRefs: ['https://site.test/'],
      confidence: 'high',
    };
    const withPatterns = buildPayload([...payload.findings], { patternEvidence: [pattern] });
    expect(buildReportEvidenceDossier(withPatterns, buildSnapshot(withPatterns)).patterns).toEqual([
      pattern,
    ]);
    expect(buildReportEvidenceDossier(payload, snapshot).patterns).toEqual([]);
  });
});

describe('reconcileCoverageLedger', () => {
  it('marks planned findings as project-owned and leaves the rest untouched', () => {
    const ledger = buildInitialCoverageLedger(payload, snapshot);
    const plan = buildPlan(
      [buildProject({ projectKey: 'fix-contrast', findingIds: ['f-contrast'] })],
      ['fix-contrast'],
    );
    const reconciled = reconcileCoverageLedger(ledger, plan);
    expect(reconciled.entries.find((entry) => entry.findingId === 'f-contrast')).toMatchObject({
      disposition: 'project',
      projectKey: 'fix-contrast',
    });
    expect(reconciled.entries.find((entry) => entry.findingId === 'f-lcp')?.disposition).toBe(
      'unassigned',
    );
    expect(reconciled.entries.find((entry) => entry.findingId === 'f-meta')?.disposition).toBe(
      'appendix-only',
    );
  });

  it('rejects a finding assigned to two projects', () => {
    const ledger = buildInitialCoverageLedger(payload, snapshot);
    const plan = buildPlan(
      [
        buildProject({ projectKey: 'a', findingIds: ['f-contrast'] }),
        buildProject({ projectKey: 'b', findingIds: ['f-contrast'] }),
      ],
      ['a'],
    );
    expect(() => reconcileCoverageLedger(ledger, plan)).toThrow(
      'Finding f-contrast is assigned to multiple remediation projects',
    );
  });
});

describe('assertCoverageLedgerComplete', () => {
  it('passes once every eligible finding is project-owned, with minor findings appendix-only', () => {
    const ledger = reconcileCoverageLedger(
      buildInitialCoverageLedger(payload, snapshot),
      buildPlan(
        [buildProject({ projectKey: 'fix-all', findingIds: ['f-contrast', 'f-lcp'] })],
        ['fix-all'],
      ),
    );
    expect(() => assertCoverageLedgerComplete(ledger, payload)).not.toThrow();
  });

  it('rejects an eligible finding left unassigned or appendix-only', () => {
    const ledger = buildInitialCoverageLedger(payload, snapshot);
    expect(() => assertCoverageLedgerComplete(ledger, payload)).toThrow(
      'Senior report plan omitted eligible finding(s): f-contrast, f-lcp',
    );
  });

  it('detects a finding missing from the ledger entirely (negative case)', () => {
    const tampered: CoverageLedger = {
      ...ledgerSnapshotOf(payload),
      entries: ledgerSnapshotOf(payload).entries.filter(
        (entry) => entry.findingId !== 'f-contrast',
      ),
    };
    expect(() => assertCoverageLedgerComplete(tampered, payload)).toThrow(
      /does not account for the approved evidence .*missing: f-contrast/,
    );
  });

  it('detects duplicated ledger entries and a ledger bound to a different evidence snapshot', () => {
    const duplicated: CoverageLedger = {
      ...ledgerSnapshotOf(payload),
      entries: [...ledgerSnapshotOf(payload).entries, ledgerSnapshotOf(payload).entries[0]!],
    };
    expect(() => assertCoverageLedgerComplete(duplicated, payload)).toThrow(
      /duplicated: f-contrast/,
    );

    const wrongSnapshot: CoverageLedger = {
      ...ledgerSnapshotOf(payload),
      inputSnapshotDigest: reportQualityDigest({ approval: 'something-else' }),
    };
    expect(() => assertCoverageLedgerComplete(wrongSnapshot, payload)).toThrow(
      'Coverage ledger input snapshot digest does not match the approved evidence payload',
    );
  });
});

describe('assertMandatoryDisclosures', () => {
  it('passes when every mandatory limitation carries its deterministic report destination', () => {
    const limitations = [
      buildLimitation({ limitationId: 'crawl-cap' }),
      buildLimitation({ limitationId: 'single-run' }),
    ];
    expect(() =>
      assertMandatoryDisclosures(
        limitations,
        limitations.map((limitation) => limitation.reportDestination),
      ),
    ).not.toThrow();
  });

  it('rejects a disclosure whose destination was not rendered', () => {
    const limitations = [
      buildLimitation({ limitationId: 'crawl-cap' }),
      buildLimitation({ limitationId: 'single-run' }),
    ];
    expect(() => assertMandatoryDisclosures(limitations, ['methodology#crawl-cap'])).toThrow(
      'Mandatory evidence disclosure(s) have no report destination: single-run',
    );
    expect(() => assertMandatoryDisclosures(limitations, [])).toThrow('crawl-cap, single-run');
  });
});
