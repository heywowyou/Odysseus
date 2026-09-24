import { describe, expect, it } from 'vitest';
import type { ScanIntent } from '@odysseus/core';
import type {
  RetentionAnalysisRow,
  RetentionBundleRow,
  RetentionQualityRunRow,
  RetentionReportRow,
} from '@odysseus/store';
import {
  analysisKey,
  bundleKey,
  planRetention,
  qualityRunKey,
  reportKey,
  RETENTION_KEEP_REASONS,
  structureKey,
  type RetentionAuditInput,
  type RetentionKeepReason,
  type RetentionPlan,
  type RetentionSnapshot,
  type RetentionStructureFile,
} from './retention-policy.js';

const NOW = new Date('2026-10-01T00:00:00Z');
const HOUR = 3_600_000;
const ago = (days: number, hours = 0): Date =>
  new Date(NOW.getTime() - days * 24 * HOUR - hours * HOUR);

function audit(overrides: Partial<RetentionAuditInput> = {}): RetentionAuditInput {
  return {
    auditId: 'a1',
    siteUrl: 'https://hotel.example/',
    kind: 'audit',
    scanIntent: 'full-audit',
    startedAt: ago(40),
    finishedAt: ago(40),
    hasFindingsProvenance: true,
    storage: 'local',
    ...overrides,
  };
}

function snapshot(parts: Partial<RetentionSnapshot> = {}): RetentionSnapshot {
  return {
    audits: [audit()],
    reports: [],
    analyses: [],
    structures: [],
    approvals: [],
    bundles: [],
    activeBundles: [],
    qualityRuns: [],
    livePreviewAuditIds: [],
    archivedProspectIds: [],
    ...parts,
  };
}

function report(id: string, days: number, overrides: Partial<RetentionReportRow> = {}) {
  return {
    rowId: `row-${id}`,
    reportId: id,
    auditId: 'a1',
    analysisId: 'an-unrelated',
    language: 'fr',
    origin: 'pipeline',
    generatedAt: ago(days),
    fileRef: `reports/${id}-fr.pdf`,
    ...overrides,
  } satisfies RetentionReportRow;
}

function analysis(id: string, days: number, overrides: Partial<RetentionAnalysisRow> = {}) {
  return {
    analysisId: id,
    auditId: 'a1',
    language: 'fr',
    generatedAt: ago(days),
    ...overrides,
  } satisfies RetentionAnalysisRow;
}

function structure(name: string, days: number): RetentionStructureFile {
  return {
    auditId: 'a1',
    fileName: `${name}-structure.json`,
    generatedAt: ago(days).toISOString(),
  };
}

function run(id: string, days: number): RetentionQualityRunRow {
  return { qualityRunId: id, auditId: 'a1', createdAt: ago(days) };
}

function bundle(
  id: string,
  qualityRunId: string,
  state: RetentionBundleRow['state'] = 'quality-approved',
): RetentionBundleRow {
  return { bundleId: id, auditId: 'a1', qualityRunId, state, createdAt: ago(20) };
}

function deletedKeys(plan: RetentionPlan): string[] {
  return [
    ...plan.deleteReports.map(reportKey),
    ...plan.deleteAnalyses.map(analysisKey),
    ...plan.deleteStructureFiles.map(structureKey),
    ...plan.deleteQualityCandidates.map(qualityRunKey),
    ...plan.deleteReportBundles.map(bundleKey),
  ];
}

interface KeepReasonFixture {
  /** A snapshot where the reason keeps the item. */
  withReason: RetentionSnapshot;
  /** The same snapshot without what the reason reads. */
  withoutReason: RetentionSnapshot;
  itemKey: string;
  /** Every reason expected to keep the item in `withReason`. */
  reasons: RetentionKeepReason[];
}

const olderStructure = structure('2026-09-11', 20);
const newerStructure = structure('2026-09-21', 10);

const KEEP_REASON_FIXTURES = {
  // The newest report is always also the newest of its origin, so this
  // reason never stands alone; the fixture shows it is still recorded.
  'latest-per-language': {
    withReason: snapshot({ reports: [report('old', 20), report('new', 10)] }),
    withoutReason: snapshot({ reports: [report('old', 20), report('new', 10)] }),
    itemKey: reportKey(report('new', 10)),
    reasons: ['latest-per-language', 'latest-generated-per-language'],
  },
  'latest-generated-per-language': {
    withReason: snapshot({
      reports: [report('gen', 20), report('fin', 10, { origin: 'finalized' })],
    }),
    withoutReason: snapshot({
      reports: [report('gen', 20), report('gen2', 15), report('fin', 10, { origin: 'finalized' })],
    }),
    itemKey: reportKey(report('gen', 20)),
    reasons: ['latest-generated-per-language'],
  },
  'latest-finalized-per-language': {
    withReason: snapshot({
      reports: [report('fin', 20, { origin: 'finalized' }), report('gen', 10)],
    }),
    withoutReason: snapshot({
      reports: [
        report('fin', 20, { origin: 'finalized' }),
        report('fin2', 15, { origin: 'finalized' }),
        report('gen', 10),
      ],
    }),
    itemKey: reportKey(report('fin', 20, { origin: 'finalized' })),
    reasons: ['latest-finalized-per-language'],
  },
  'finalization-source': {
    withReason: snapshot({
      reports: [
        report('src', 20),
        report('gen', 15),
        report('fin', 10, { origin: 'finalized', supersedesReportId: 'src' }),
      ],
    }),
    withoutReason: snapshot({
      reports: [
        report('src', 20),
        report('gen', 15),
        report('fin', 10, { origin: 'finalized', supersedesReportId: 'gen' }),
      ],
    }),
    itemKey: reportKey(report('src', 20)),
    reasons: ['finalization-source'],
  },
  approved: {
    withReason: snapshot({
      reports: [report('appr', 20), report('new', 10)],
      approvals: [{ auditId: 'a1', reportIds: ['appr'] }],
    }),
    withoutReason: snapshot({ reports: [report('appr', 20), report('new', 10)] }),
    itemKey: reportKey(report('appr', 20)),
    reasons: ['approved'],
  },
  selected: {
    withReason: snapshot({
      audits: [
        audit({
          writingSelection: {
            selected: { frAnalysisId: 'sel', findingsProvenance: undefined as never },
          },
        }),
      ],
      analyses: [analysis('sel', 20), analysis('new', 10)],
    }),
    withoutReason: snapshot({ analyses: [analysis('sel', 20), analysis('new', 10)] }),
    itemKey: analysisKey(analysis('sel', 20)),
    reasons: ['selected'],
  },
  candidate: {
    withReason: snapshot({
      audits: [
        audit({
          writingSelection: {
            candidate: {
              status: 'failed',
              reason: 'guard',
              createdAt: ago(20).toISOString(),
              partialPair: { frAnalysisId: 'cand' },
            },
          },
        }),
      ],
      analyses: [analysis('cand', 20), analysis('new', 10)],
    }),
    withoutReason: snapshot({ analyses: [analysis('cand', 20), analysis('new', 10)] }),
    itemKey: analysisKey(analysis('cand', 20)),
    reasons: ['candidate'],
  },
  'report-source': {
    withReason: snapshot({
      reports: [report('r', 10, { analysisId: 'src' })],
      analyses: [analysis('src', 20), analysis('new', 10)],
    }),
    withoutReason: snapshot({
      reports: [report('r', 10, { analysisId: 'new' })],
      analyses: [analysis('src', 20), analysis('new', 10)],
    }),
    itemKey: analysisKey(analysis('src', 20)),
    reasons: ['report-source'],
  },
  'newest-per-language': {
    withReason: snapshot({ analyses: [analysis('old', 20), analysis('new', 10)] }),
    withoutReason: snapshot({
      analyses: [analysis('old', 20), analysis('new', 10), analysis('newer', 9)],
    }),
    itemKey: analysisKey(analysis('new', 10)),
    reasons: ['newest-per-language'],
  },
  'structure-of-kept-analysis': {
    withReason: snapshot({
      analyses: [analysis('an', 10, { structureGeneratedAt: olderStructure.generatedAt })],
      structures: [olderStructure, newerStructure],
    }),
    withoutReason: snapshot({
      analyses: [analysis('an', 10, { structureGeneratedAt: newerStructure.generatedAt })],
      structures: [olderStructure, newerStructure],
    }),
    itemKey: structureKey(olderStructure),
    reasons: ['structure-of-kept-analysis'],
  },
  'newest-structure': {
    withReason: snapshot({ structures: [olderStructure, newerStructure] }),
    withoutReason: snapshot({
      structures: [olderStructure, newerStructure, structure('2026-09-22', 9)],
    }),
    itemKey: structureKey(newerStructure),
    reasons: ['newest-structure'],
  },
  'active-bundle': {
    withReason: snapshot({
      qualityRuns: [run('q-old', 20), run('q-new', 10)],
      bundles: [bundle('b-old', 'q-old')],
      activeBundles: [{ auditId: 'a1', bundleId: 'b-old', qualityRunId: 'q-old' }],
    }),
    withoutReason: snapshot({
      qualityRuns: [run('q-old', 20), run('q-new', 10)],
      bundles: [bundle('b-old', 'q-old')],
    }),
    itemKey: bundleKey(bundle('b-old', 'q-old')),
    reasons: ['active-bundle'],
  },
  'operator-approved-or-promoted': {
    withReason: snapshot({
      qualityRuns: [run('q-old', 20), run('q-new', 10)],
      bundles: [bundle('b-old', 'q-old', 'operator-approved')],
    }),
    withoutReason: snapshot({
      qualityRuns: [run('q-old', 20), run('q-new', 10)],
      bundles: [bundle('b-old', 'q-old', 'awaiting-operator-approval')],
    }),
    itemKey: bundleKey(bundle('b-old', 'q-old')),
    reasons: ['operator-approved-or-promoted'],
  },
  'newest-run': {
    withReason: snapshot({ qualityRuns: [run('q-old', 20), run('q-new', 10)] }),
    withoutReason: snapshot({
      qualityRuns: [run('q-old', 20), run('q-new', 10), run('q-newer', 9)],
    }),
    itemKey: qualityRunKey(run('q-new', 10)),
    reasons: ['newest-run'],
  },
} satisfies Record<RetentionKeepReason, KeepReasonFixture>;

describe('planRetention keep registry', () => {
  it('has exactly one fixture per keep reason', () => {
    expect(Object.keys(KEEP_REASON_FIXTURES).sort()).toEqual([...RETENTION_KEEP_REASONS].sort());
  });

  it.each(Object.entries(KEEP_REASON_FIXTURES) as [RetentionKeepReason, KeepReasonFixture][])(
    '%s keeps its item, which goes without it',
    (reason, fixture) => {
      const kept = planRetention(fixture.withReason, NOW);
      expect(kept.kept.get(fixture.itemKey)).toEqual(fixture.reasons);
      expect(kept.kept.get(fixture.itemKey)).toContain(reason);
      expect(deletedKeys(kept)).not.toContain(fixture.itemKey);

      if (reason === 'latest-per-language') return;
      expect(deletedKeys(planRetention(fixture.withoutReason, NOW))).toContain(fixture.itemKey);
    },
  );

  it('deletes a report with its quality candidates and bundle only when every item is unnamed', () => {
    const plan = planRetention(
      snapshot({
        reports: [report('old', 20), report('new', 10)],
        qualityRuns: [run('q-old', 20), run('q-new', 10)],
        bundles: [bundle('b-old', 'q-old'), bundle('b-new', 'q-new')],
      }),
      NOW,
    );

    expect(deletedKeys(plan).sort()).toEqual(
      [
        reportKey(report('old', 20)),
        qualityRunKey(run('q-old', 20)),
        bundleKey(bundle('b-old', 'q-old')),
      ].sort(),
    );
    expect(plan.kept.get(bundleKey(bundle('b-new', 'q-new')))).toEqual(['newest-run']);
  });
});

describe('planRetention grace period', () => {
  it('keeps an item superseded 6 days 23 hours ago and deletes one superseded 7 days ago', () => {
    const recent = planRetention(
      snapshot({ reports: [report('old', 20), report('new', 6, { generatedAt: ago(6, 23) })] }),
      NOW,
    );
    const due = planRetention(snapshot({ reports: [report('old', 20), report('new', 7)] }), NOW);

    expect(deletedKeys(recent)).toEqual([]);
    expect(deletedKeys(due)).toEqual([reportKey(report('old', 20))]);
  });

  it('counts from when the item was superseded, not from its own age', () => {
    const plan = planRetention(
      snapshot({ reports: [report('ancient', 300), report('new', 3)] }),
      NOW,
    );

    expect(deletedKeys(plan)).toEqual([]);
  });

  it('deletes an audit replaced 7 days ago and keeps one replaced 6 days 23 hours ago', () => {
    const older = audit({ auditId: 'old', startedAt: ago(30), finishedAt: ago(30) });
    const newerAt = (finishedAt: Date) => audit({ auditId: 'new', startedAt: ago(8), finishedAt });

    const recent = planRetention(snapshot({ audits: [older, newerAt(ago(6, 23))] }), NOW);
    const due = planRetention(snapshot({ audits: [older, newerAt(ago(7))] }), NOW);

    expect(recent.deleteAudits).toEqual([]);
    expect(due.deleteAudits.map((action) => action.auditId)).toEqual(['old']);
    expect(due.deleteAudits[0]).toMatchObject({ supersededBy: 'new', supersededAt: ago(7) });
  });
});

describe('planRetention audit supersession', () => {
  const intents: Array<ScanIntent | undefined> = [
    'quick-check',
    'prospecting-audit',
    'full-audit',
    undefined,
  ];
  const rank = { 'quick-check': 0, 'prospecting-audit': 1, 'full-audit': 2 } as const;
  const pairs = intents.flatMap((older) => intents.map((newer) => [older, newer] as const));

  it.each(pairs)('older %s, newer %s', (olderIntent, newerIntent) => {
    const withIntent = (
      intent: ScanIntent | undefined,
      overrides: Partial<RetentionAuditInput>,
    ): RetentionAuditInput => {
      const { scanIntent: _default, ...rest } = audit(overrides);
      return intent === undefined ? rest : { ...rest, scanIntent: intent };
    };
    const older = withIntent(olderIntent, { auditId: 'old' });
    const newer = withIntent(newerIntent, {
      auditId: 'new',
      startedAt: ago(20),
      finishedAt: ago(20),
    });
    const expected =
      newerIntent !== undefined &&
      rank[newerIntent] >= (olderIntent === undefined ? 2 : rank[olderIntent]);

    const plan = planRetention(snapshot({ audits: [older, newer] }), NOW);

    expect(plan.deleteAudits.map((action) => action.auditId)).toEqual(expected ? ['old'] : []);
  });

  it('never replaces the newest audit of a site and kind', () => {
    const plan = planRetention(
      snapshot({
        audits: [
          audit({ auditId: 'old' }),
          audit({ auditId: 'new', startedAt: ago(20), finishedAt: ago(20) }),
        ],
      }),
      NOW,
    );

    expect(plan.deleteAudits.map((action) => action.auditId)).toEqual(['old']);
  });

  it('ignores a newer audit of another site, another kind, or without findings provenance', () => {
    const newer = { startedAt: ago(20), finishedAt: ago(20) };
    const plan = planRetention(
      snapshot({
        audits: [
          audit({ auditId: 'old' }),
          audit({ auditId: 'other-site', siteUrl: 'https://other.example/', ...newer }),
          audit({ auditId: 'other-kind', kind: 'render-diff', ...newer }),
          audit({ auditId: 'unfinished', hasFindingsProvenance: false, ...newer }),
        ],
      }),
      NOW,
    );

    expect(plan.deleteAudits).toEqual([]);
  });

  it('dates the replacement from the earliest qualifying newer audit', () => {
    const plan = planRetention(
      snapshot({
        audits: [
          audit({ auditId: 'old' }),
          audit({ auditId: 'first', startedAt: ago(25), finishedAt: ago(25) }),
          audit({ auditId: 'second', startedAt: ago(10), finishedAt: ago(10) }),
        ],
      }),
      NOW,
    );

    expect(plan.deleteAudits).toEqual([
      expect.objectContaining({ auditId: 'old', supersededBy: 'first', supersededAt: ago(25) }),
      expect.objectContaining({ auditId: 'first', supersededBy: 'second', supersededAt: ago(10) }),
    ]);
  });

  it('does not list a deleted audit’s own versions separately', () => {
    const plan = planRetention(
      snapshot({
        audits: [
          audit({ auditId: 'a1' }),
          audit({ auditId: 'new', startedAt: ago(20), finishedAt: ago(20) }),
        ],
        reports: [report('old', 30), report('new', 25)],
      }),
      NOW,
    );

    expect(plan.deleteAudits.map((action) => action.auditId)).toEqual(['a1']);
    expect(plan.deleteReports).toEqual([]);
  });
});

describe('planRetention delivered audits', () => {
  const older = audit({ auditId: 'a1' });
  const newer = audit({ auditId: 'new', startedAt: ago(20), finishedAt: ago(20) });
  const signals: Array<[string, Partial<RetentionSnapshot>]> = [
    ['an approval', { approvals: [{ auditId: 'a1', reportIds: ['r'] }] }],
    ['an active bundle', { activeBundles: [{ auditId: 'a1', bundleId: 'b', qualityRunId: 'q' }] }],
    ['an operator-approved bundle', { bundles: [bundle('b', 'q', 'operator-approved')] }],
    ['a promoted bundle', { bundles: [bundle('b', 'q', 'promoted')] }],
    ['a finalized report', { reports: [report('fin', 30, { origin: 'finalized' })] }],
    ['a live outreach preview', { livePreviewAuditIds: ['a1'] }],
  ];

  it.each(signals)('slims instead of deleting an audit with %s', (_label, parts) => {
    const plan = planRetention(snapshot({ audits: [older, newer], ...parts }), NOW);

    expect(plan.deleteAudits).toEqual([]);
    expect(plan.slimAudits.map((action) => action.auditId)).toEqual(['a1']);
  });

  it('does not slim an audit twice, but still cleans its superseded versions', () => {
    const plan = planRetention(
      snapshot({
        audits: [{ ...older, slimmedAt: ago(5) }, newer],
        approvals: [{ auditId: 'a1', reportIds: ['appr'] }],
        reports: [report('appr', 30), report('mid', 28), report('new', 25)],
      }),
      NOW,
    );

    expect(plan.slimAudits).toEqual([]);
    expect(deletedKeys(plan)).toEqual([reportKey(report('mid', 28))]);
  });
});

describe('planRetention holds', () => {
  const older = audit({ auditId: 'a1', prospectId: 'p1' });
  const newer = audit({ auditId: 'new', startedAt: ago(20), finishedAt: ago(20) });

  it.each<[string, Partial<RetentionSnapshot>]>([
    ['job-in-flight', { audits: [{ ...older, busy: 'job-in-flight' }, newer] }],
    ['report-production', { audits: [{ ...older, busy: 'report-production' }, newer] }],
    ['archived-prospect', { audits: [older, newer], archivedProspectIds: ['p1'] }],
    ['not-local', { audits: [{ ...older, storage: 'absent' }, newer] }],
  ])('skips an audit held by %s and reports it', (reason, parts) => {
    const plan = planRetention(snapshot(parts), NOW);

    expect(plan.deleteAudits).toEqual([]);
    expect(plan.holds).toEqual([{ auditId: 'a1', reason }]);
  });

  it('holds within-audit cleanup too', () => {
    const plan = planRetention(
      snapshot({
        audits: [audit({ busy: 'report-production' })],
        reports: [report('old', 20), report('new', 10)],
      }),
      NOW,
    );

    expect(deletedKeys(plan)).toEqual([]);
    expect(plan.holds).toEqual([{ auditId: 'a1', reason: 'report-production' }]);
  });

  it('proceeds when the files are only in the bucket', () => {
    const plan = planRetention(
      snapshot({ audits: [{ ...older, storage: 'bucket-only' }, newer] }),
      NOW,
    );

    expect(plan.deleteAudits.map((action) => action.auditId)).toEqual(['a1']);
  });

  it('reports no hold for an audit with nothing to do', () => {
    const plan = planRetention(snapshot({ audits: [audit({ storage: 'absent' })] }), NOW);

    expect(plan.holds).toEqual([]);
  });
});
