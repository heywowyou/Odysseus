import { describe, expect, it, vi } from 'vitest';
import { NORMALIZATION_FINGERPRINT } from '@odysseus/core';

vi.mock('./schemas/audit.schema.js', () => ({ createAuditModel: vi.fn() }));
vi.mock('./schemas/job.schema.js', () => ({ createJobModel: vi.fn() }));
vi.mock('./schemas/outreach-draft.schema.js', () => ({ createOutreachDraftModel: vi.fn() }));
vi.mock('./schemas/outreach-thread.schema.js', () => ({ createOutreachThreadModel: vi.fn() }));
vi.mock('./suppression.js', () => ({ findSuppressionMatches: vi.fn() }));
vi.mock('./schemas/report.schema.js', () => ({ createReportModel: vi.fn() }));
vi.mock('./schemas/analysis.schema.js', () => ({
  createAnalysisModel: vi.fn(() => {
    const cursor = { select: () => cursor, lean: () => Promise.resolve([]) };
    return { find: () => cursor };
  }),
}));
vi.mock('./report-quality.js', () => ({ listNewestReportQualityRuns: vi.fn() }));

import { createAuditModel } from './schemas/audit.schema.js';
import { createJobModel } from './schemas/job.schema.js';
import { createOutreachDraftModel } from './schemas/outreach-draft.schema.js';
import { createOutreachThreadModel } from './schemas/outreach-thread.schema.js';
import { findSuppressionMatches } from './suppression.js';
import { createReportModel } from './schemas/report.schema.js';
import { listNewestReportQualityRuns, type NewestReportQualityRun } from './report-quality.js';
import {
  deriveProspectWork,
  loadProspectWork,
  selectNewestQualifyingAudit,
  type ProspectWorkAudit,
  type ProspectWorkReport,
} from './prospect-work.js';

const prospect = {
  prospectId: '6c00b0c7-6f37-4e98-a8d3-95f94db9f7a3',
  sector: 'hotel',
  name: 'ARK Hôtel',
  websites: [
    {
      url: 'https://example.fr',
      registrableDomain: 'example.fr',
      kind: 'own' as const,
      primary: true,
    },
  ],
  emails: [{ address: 'contact@agency.example', origin: 'operator' as const }],
  status: 'new' as const,
  fieldOrigins: { name: 'operator' as const },
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  lastActivityAt: new Date('2026-09-01T00:00:00.000Z'),
};

function audit(overrides: Record<string, unknown> = {}): ProspectWorkAudit {
  return {
    auditId: 'audit-old',
    prospectId: prospect.prospectId,
    siteUrl: 'https://example.fr',
    kind: 'audit' as const,
    startedAt: new Date('2026-09-01T10:00:00.000Z'),
    finishedAt: new Date('2026-09-01T10:10:00.000Z'),
    pages: [{ status: 'visited', url: 'https://example.fr/' }],
    crawl: {},
    scanIntent: 'prospecting-audit',
    findingsProvenance: currentProvenance,
    ...overrides,
  } as ProspectWorkAudit;
}

const currentProvenance = {
  findingsSchemaVersion: 1 as const,
  normalizationFingerprint: NORMALIZATION_FINGERPRINT,
  findingsDigest: 'digest-current',
};

/** A current FR+EN report pair; since Plan 067 the French report alone is
 *  the issue #388 prerequisite of initial outreach. */
function readyReports(
  auditId = 'audit-old',
  findingsProvenance: Record<string, unknown> = currentProvenance,
): ProspectWorkReport[] {
  return (['fr', 'en'] as const).map((language) => ({
    auditId,
    language,
    generatedAt: new Date('2026-09-01T11:00:00.000Z'),
    findingsProvenance,
  }));
}

/** Plan 058: the newest quality run of the prospect's qualifying audit, as
 *  listNewestReportQualityRuns would project it. */
function qualityRun(overrides: Record<string, unknown> = {}): NewestReportQualityRun {
  return {
    qualityRunId: 'run-1',
    auditId: 'audit-old',
    state: 'needs-operator-review',
    createdAt: new Date('2026-09-14T09:00:00.000Z'),
    updatedAt: new Date('2026-09-14T09:30:00.000Z'),
    ...overrides,
  } as NewestReportQualityRun;
}

const emptySources = {
  audits: [],
  drafts: [],
  threads: [],
  needsInputJobs: [],
  failedJobs: [],
  reports: readyReports(),
  suppressedDomains: new Set<string>(),
  suppressedAddresses: new Set<string>(),
};

function chain<T>(value: T) {
  const cursor = {
    select: vi.fn(),
    sort: vi.fn(),
    skip: vi.fn(),
    limit: vi.fn(),
    lean: vi.fn(),
  };
  cursor.select.mockReturnValue(cursor);
  cursor.sort.mockReturnValue(cursor);
  cursor.skip.mockReturnValue(cursor);
  cursor.limit.mockReturnValue(cursor);
  cursor.lean.mockResolvedValue(value);
  return cursor;
}

describe('prospect work model', () => {
  it('selects an older qualifying audit when a newer attached audit is incomplete', () => {
    const newer = audit({
      auditId: 'audit-new',
      startedAt: new Date('2026-09-10T10:00:00.000Z'),
      pages: [
        { status: 'error', url: 'https://example.fr/' },
        { status: 'error', url: 'https://example.fr/contact' },
      ],
    });
    expect(selectNewestQualifyingAudit([newer, audit()])).toMatchObject({
      state: 'qualifying',
      audit: { auditId: 'audit-old' },
    });

    const work = deriveProspectWork(
      prospect,
      { ...emptySources, audits: [newer, audit()] },
      new Date('2026-09-15T00:00:00.000Z'),
    );
    expect(work.auditState).toBe('qualifying');
    expect(work.items).toEqual([
      expect.objectContaining({ kind: 'first-email', since: '2026-09-01T10:00:00.000Z' }),
    ]);
  });

  it('issue #390: a running scan replaces the prepare-audit recommendation', () => {
    const running = {
      jobId: 'job-running',
      type: 'full-audit' as const,
      status: 'running' as const,
      phase: 'crawl',
      createdAt: new Date('2026-09-14T10:00:00.000Z'),
      options: { prospectId: prospect.prospectId },
    };
    const idle = deriveProspectWork(prospect, emptySources);
    expect(idle.recommendation).toMatchObject({ action: 'prepare-audit' });
    expect(idle.activeScan).toBeUndefined();

    const work = deriveProspectWork(prospect, { ...emptySources, activeJobs: [running] });
    expect(work.recommendation).toBeUndefined();
    expect(work.activeScan).toEqual({
      jobId: 'job-running',
      status: 'running',
      scanIntent: 'full-audit',
      phase: 'crawl',
    });
  });

  describe('issue #378: audit blockers gate initial outreach', () => {
    const blockedJob = {
      jobId: 'job-blocked',
      auditId: 'audit-old',
      status: 'needs-input' as const,
      createdAt: new Date('2026-09-01T09:59:00.000Z'),
      options: { prospectId: prospect.prospectId },
    };

    it('shows only the audit task while the qualifying audit waits for input', () => {
      const work = deriveProspectWork(
        prospect,
        { ...emptySources, audits: [audit()], needsInputJobs: [blockedJob] },
        new Date('2026-09-15T00:00:00.000Z'),
      );

      expect(work.items.map((item) => item.kind)).toEqual(['audit-input']);
      expect(work.recommendation).toMatchObject({ action: 'review-audit' });
    });

    it('also waits on a newer unresolved run of the same prospect', () => {
      const newerRun = {
        ...blockedJob,
        jobId: 'job-newer',
        auditId: 'audit-newer',
        createdAt: new Date('2026-09-10T10:00:00.000Z'),
      };
      const work = deriveProspectWork(
        prospect,
        { ...emptySources, audits: [audit()], needsInputJobs: [newerRun] },
        new Date('2026-09-15T00:00:00.000Z'),
      );

      expect(work.items.some((item) => item.kind === 'first-email')).toBe(false);
    });

    it('offers the first email again once the blocker is resolved', () => {
      const work = deriveProspectWork(
        prospect,
        { ...emptySources, audits: [audit()], needsInputJobs: [] },
        new Date('2026-09-15T00:00:00.000Z'),
      );

      expect(work.items.map((item) => item.kind)).toEqual(['first-email']);
      expect(work.recommendation).toMatchObject({ action: 'create-first-email' });
    });

    it('is not blocked by a needs-input job from a run superseded by the qualifying audit', () => {
      const superseded = {
        ...blockedJob,
        auditId: 'audit-ancient',
        createdAt: new Date('2026-08-01T10:00:00.000Z'),
      };
      const work = deriveProspectWork(
        prospect,
        { ...emptySources, audits: [audit()], needsInputJobs: [superseded] },
        new Date('2026-09-15T00:00:00.000Z'),
      );

      expect(work.items.map((item) => item.kind).sort()).toEqual(['audit-input', 'first-email']);
    });

    it('replaces the first email with a report task while the report failed (issue #388)', () => {
      const failedJob = {
        jobId: 'job-pdf',
        auditId: 'audit-old',
        status: 'failed' as const,
        createdAt: new Date('2026-09-01T09:59:00.000Z'),
        options: { prospectId: prospect.prospectId },
      };
      const work = deriveProspectWork(
        prospect,
        { ...emptySources, audits: [audit()], reports: [], failedJobs: [failedJob] },
        new Date('2026-09-15T00:00:00.000Z'),
      );

      expect(work.items).toEqual([
        expect.objectContaining({
          kind: 'audit-report',
          action: 'regenerate-report',
          href: '/audits/audit-old',
        }),
      ]);
      expect(work.recommendation).toEqual({
        action: 'regenerate-report',
        href: '/audits/audit-old',
      });
      expect(work.reportReadiness).toEqual({ state: 'not-ready', reason: 'failed' });
    });

    it('waits on regeneration when the report pair is stale', () => {
      const work = deriveProspectWork(
        prospect,
        {
          ...emptySources,
          audits: [audit()],
          reports: readyReports('audit-old', { ...currentProvenance, findingsDigest: 'before' }),
        },
        new Date('2026-09-15T00:00:00.000Z'),
      );

      expect(work.items.map((item) => item.kind)).toEqual(['audit-report']);
      expect(work.reportReadiness).toEqual({ state: 'not-ready', reason: 'stale' });
    });

    it('asks a historical audit without reports for regeneration, never a rescan', () => {
      const work = deriveProspectWork(
        prospect,
        { ...emptySources, audits: [audit()], reports: [] },
        new Date('2026-09-15T00:00:00.000Z'),
      );

      expect(work.items.map((item) => item.kind)).toEqual(['audit-report']);
      expect(work.recommendation).toMatchObject({ action: 'regenerate-report' });
    });

    it('keeps reply work for an already-contacted prospect', () => {
      const work = deriveProspectWork(
        prospect,
        {
          ...emptySources,
          audits: [audit()],
          needsInputJobs: [blockedJob],
          threads: [
            {
              threadId: 'thread-replied',
              prospectId: prospect.prospectId,
              state: 'replied',
              currentTouch: 1,
              touches: [],
              spacing: { touch2AfterDays: 3, touch3AfterDays: 7, replyWindowDays: 14 },
              updatedAt: new Date('2026-09-12T00:00:00.000Z'),
            },
          ] as never,
        },
        new Date('2026-09-15T00:00:00.000Z'),
      );

      expect(work.items.map((item) => item.kind).sort()).toEqual(['audit-input', 'reply']);
    });
  });

  describe('plan 060 §7.1: human-attention rows', () => {
    it('opens exactly one stable attention row for a needs-operator-review quality run', () => {
      const sources = { ...emptySources, audits: [audit()], qualityRuns: [qualityRun()] };
      const first = deriveProspectWork(prospect, sources, new Date('2026-09-15T00:00:00.000Z'));
      const second = deriveProspectWork(prospect, sources, new Date('2026-09-15T00:05:00.000Z'));

      const rows = first.items.filter((item) => item.kind === 'report-quality-review');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        attentionId: 'report-quality-review:audit-old:run-1',
        severity: 'action-required',
        subject: prospect.name,
        auditId: 'audit-old',
        prospectId: prospect.prospectId,
        action: 'review-report',
        href: '/audits/audit-old',
        reasonCode: 'quality-run-needs-operator-review',
        since: '2026-09-14T09:00:00.000Z',
        updatedAt: '2026-09-14T09:30:00.000Z',
      });
      // The attention id is stable across recomputations, so refreshes and
      // history see one condition, not a new row per poll.
      expect(second.items.find((item) => item.kind === 'report-quality-review')?.attentionId).toBe(
        'report-quality-review:audit-old:run-1',
      );
    });

    it('opens no attention for producing, approved, failed or superseded quality work', () => {
      const states = [
        'running',
        'content-clean',
        'parity-clean',
        'fr-candidate-clean',
        'en-candidate-clean',
        'bundle-final-review',
        'quality-approved',
        'awaiting-operator-approval',
        'operator-approved',
        'promoted',
        'failed',
        // An unknown state fabricates nothing: fail closed.
        'some-future-state',
      ] as const;
      const work = deriveProspectWork(
        prospect,
        {
          ...emptySources,
          audits: [audit()],
          qualityRuns: states.map((state, index) =>
            qualityRun({ qualityRunId: `run-${index}`, state: state as string }),
          ),
        },
        new Date('2026-09-15T00:00:00.000Z'),
      );

      expect(work.items.filter((item) => item.kind === 'report-quality-review')).toEqual([]);
      expect(work.items.some((item) => item.attentionId !== undefined)).toBe(false);
    });

    it('opens no attention for a quality-approved bundle the operator never brought to review', () => {
      const work = deriveProspectWork(
        prospect,
        {
          ...emptySources,
          audits: [audit()],
          qualityRuns: [qualityRun({ state: 'quality-approved' })],
        },
        new Date('2026-09-15T00:00:00.000Z'),
      );

      expect(work.items.some((item) => item.attentionId !== undefined)).toBe(false);
      expect(work.recommendation).toMatchObject({ action: 'create-first-email' });
    });

    it('never derives evidence-operator-resolution without durable proof', () => {
      const work = deriveProspectWork(
        prospect,
        {
          ...emptySources,
          audits: [audit()],
          qualityRuns: [qualityRun()],
        },
        new Date('2026-09-15T00:00:00.000Z'),
      );

      // The store keeps no queryable Plan-059 evidence authority, so no
      // source can prove an operator resolution; the kind stays unwired.
      expect(work.items.map((item) => item.kind)).not.toContain('evidence-operator-resolution');
    });

    it('keeps attention rows out of the prospect recommendation', () => {
      const work = deriveProspectWork(
        prospect,
        {
          ...emptySources,
          audits: [audit()],
          needsInputJobs: [
            {
              jobId: 'job-blocked',
              auditId: 'audit-old',
              status: 'needs-input' as const,
              createdAt: new Date('2026-09-13T00:00:00.000Z'),
              options: { prospectId: prospect.prospectId },
            },
          ],
          qualityRuns: [qualityRun()],
        },
        new Date('2026-09-15T00:00:00.000Z'),
      );

      expect(work.items[0]?.kind).toBe('report-quality-review');
      expect(work.recommendation).toMatchObject({ action: 'review-audit' });
    });

    it('loads the newest quality runs with one bounded query per load', async () => {
      // Both load tests assert absolute call counts, so each starts from a
      // clean slate.
      vi.clearAllMocks();
      const auditCursor = chain([audit()]);
      vi.mocked(createAuditModel).mockReturnValue({
        find: vi.fn().mockReturnValue(auditCursor),
      } as never);
      vi.mocked(createOutreachDraftModel).mockReturnValue({
        find: vi.fn().mockReturnValue(chain([])),
      } as never);
      vi.mocked(createOutreachThreadModel).mockReturnValue({
        find: vi.fn().mockReturnValue(chain([])),
      } as never);
      vi.mocked(createJobModel).mockReturnValue({
        find: vi.fn().mockReturnValue(chain([])),
      } as never);
      vi.mocked(createReportModel).mockReturnValue({
        find: vi.fn().mockReturnValue(chain([])),
      } as never);
      vi.mocked(findSuppressionMatches).mockResolvedValue({
        domains: new Set(),
        addresses: new Set(),
      });
      vi.mocked(listNewestReportQualityRuns).mockResolvedValue(
        new Map([['audit-old', qualityRun()]]),
      );

      const [work] = await loadProspectWork({} as never, [prospect]);

      expect(listNewestReportQualityRuns).toHaveBeenCalledTimes(1);
      expect(listNewestReportQualityRuns).toHaveBeenCalledWith(
        {} as never,
        expect.arrayContaining(['audit-old']),
      );
      expect(work?.items.some((item) => item.kind === 'report-quality-review')).toBe(true);
    });
  });

  it('recommends the first email, not a rescan, for a complete audit from older code', () => {
    const olderProvenance = { ...currentProvenance, normalizationFingerprint: 'older-release' };
    const older = audit({ findingsProvenance: olderProvenance });
    expect(selectNewestQualifyingAudit([older])).toEqual({
      state: 'qualifying',
      audit: older,
      dataVersionState: 'older',
    });

    const work = deriveProspectWork(
      prospect,
      { ...emptySources, audits: [older], reports: readyReports('audit-old', olderProvenance) },
      new Date('2026-09-15T00:00:00.000Z'),
    );
    expect(work.auditState).toBe('qualifying');
    expect(work.dataVersionState).toBe('older');
    expect(work.items).toEqual([expect.objectContaining({ kind: 'first-email' })]);
    expect(work.recommendation).toMatchObject({ action: 'create-first-email' });
  });

  it('opens no work and recommends nothing for an archived prospect, keeping its audit state', () => {
    const work = deriveProspectWork(
      { ...prospect, archivedAt: new Date('2026-09-12T00:00:00.000Z') },
      { ...emptySources, audits: [audit()] },
      new Date('2026-09-15T00:00:00.000Z'),
    );
    expect(work.items).toEqual([]);
    expect(work.recommendation).toBeUndefined();
    expect(work.auditState).toBe('qualifying');
    expect(work.qualifyingAudit).toMatchObject({ auditId: 'audit-old' });
  });

  it('withdraws stale work rows from terminal prospects, including opted-out prospects', () => {
    const work = deriveProspectWork(
      { ...prospect, status: 'opted-out' },
      {
        ...emptySources,
        audits: [audit()],
        drafts: [
          {
            draftId: 'draft-1',
            prospectId: prospect.prospectId,
            threadId: 'thread-1',
            touch: 1,
            status: 'created',
            createdAt: new Date('2026-09-14T00:00:00.000Z'),
          },
        ],
      },
      new Date('2026-09-15T00:00:00.000Z'),
    );

    expect(work.items).toEqual([]);
    expect(work.recommendation).toBeUndefined();
  });

  it('qualifies a historical complete prospecting audit and a complete Full scan alike', () => {
    for (const scanIntent of ['prospecting-audit', 'full-audit'] as const) {
      expect(selectNewestQualifyingAudit([audit({ scanIntent })])).toMatchObject({
        state: 'qualifying',
        dataVersionState: 'current',
      });
    }
  });

  it('never qualifies a legacy scan whose purpose cannot be established', () => {
    expect(selectNewestQualifyingAudit([audit({ scanIntent: undefined })])).toEqual({
      state: 'incomplete',
      audit: undefined,
    });
  });

  it('suppresses first-email work from an email-domain match independently of the website', () => {
    const work = deriveProspectWork(
      prospect,
      {
        ...emptySources,
        audits: [audit()],
        suppressedDomains: new Set(['agency.example']),
      },
      new Date('2026-09-15T00:00:00.000Z'),
    );
    expect(work.emailSuppressed).toBe(true);
    expect(work.websiteSuppressed).toBe(false);
    expect(work.items).toEqual([]);
    expect(work.recommendation).toMatchObject({ reason: 'suppressed' });
  });

  it('explains that a finished quick check is not outreach-grade', () => {
    const work = deriveProspectWork(
      prospect,
      { ...emptySources, audits: [audit({ auditId: 'audit-quick', scanIntent: 'quick-check' })] },
      new Date('2026-09-15T00:00:00.000Z'),
    );

    expect(work.auditState).toBe('not-outreach-grade');
    expect(work.recommendation).toMatchObject({
      action: 'prepare-audit',
      reason: 'audit-not-outreach-grade',
    });
  });

  it('does not offer first-email work when no attached audit qualifies', () => {
    const work = deriveProspectWork(
      prospect,
      {
        ...emptySources,
        audits: [
          audit({
            auditId: 'audit-incomplete',
            pages: [{ status: 'error', url: 'https://example.fr/' }],
          }),
        ],
      },
      new Date('2026-09-15T00:00:00.000Z'),
    );

    expect(work.auditState).toBe('incomplete');
    expect(work.items.some((item) => item.kind === 'first-email')).toBe(false);
    expect(work.recommendation).toMatchObject({
      action: 'prepare-audit',
      reason: 'audit-incomplete',
    });
  });

  it('does not recommend stale open work for a terminal prospect', () => {
    const work = deriveProspectWork(
      { ...prospect, status: 'won' },
      {
        ...emptySources,
        drafts: [
          {
            draftId: 'draft-terminal',
            prospectId: prospect.prospectId,
            threadId: 'thread-terminal',
            touch: 1,
            status: 'created',
            createdAt: new Date(),
          },
        ],
      },
    );

    expect(work.items).toHaveLength(0);
    expect(work.recommendation).toBeUndefined();
  });

  it('links every work row to the visible control that handles it', () => {
    const auditInput = deriveProspectWork(prospect, {
      ...emptySources,
      needsInputJobs: [
        {
          jobId: 'job-1',
          auditId: 'audit-1',
          createdAt: new Date(),
          options: { prospectId: prospect.prospectId },
        },
      ],
    });
    expect(auditInput.items[0]?.href).toBe('/audits/audit-1');

    const draft = deriveProspectWork(prospect, {
      ...emptySources,
      drafts: [
        {
          draftId: 'draft-1',
          prospectId: prospect.prospectId,
          threadId: 'thread-1',
          touch: 1,
          status: 'created',
          createdAt: new Date(),
        },
      ],
    });
    expect(draft.items[0]?.href).toBe(`/prospects/${prospect.prospectId}#emails`);

    const reply = deriveProspectWork(prospect, {
      ...emptySources,
      threads: [
        {
          threadId: 'thread-reply',
          prospectId: prospect.prospectId,
          state: 'replied',
          currentTouch: 1,
          touches: [],
          spacing: { touch2AfterDays: 3, touch3AfterDays: 7, replyWindowDays: 14 },
          updatedAt: new Date(),
          needsReview: { reason: 'ambiguous', detectedAt: new Date() },
        },
      ],
    });
    expect(reply.items[0]).toMatchObject({
      action: 'record-outcome',
      href: `/prospects/${prospect.prospectId}#outcome`,
    });

    const followUp = deriveProspectWork(
      prospect,
      {
        ...emptySources,
        threads: [
          {
            threadId: 'thread-follow-up',
            prospectId: prospect.prospectId,
            state: 'e1-sent',
            currentTouch: 1,
            touches: [
              {
                touch: 1,
                providerMessageId: 'message-1',
                sentAt: new Date('2026-09-01T00:00:00.000Z'),
                detectedAt: new Date('2026-09-01T00:00:00.000Z'),
              },
            ],
            spacing: { touch2AfterDays: 0, touch3AfterDays: 7, replyWindowDays: 14 },
            updatedAt: new Date(),
          },
        ],
      },
      new Date('2026-09-15T00:00:00.000Z'),
    );
    expect(followUp.items[0]?.href).toBe(`/prospects/${prospect.prospectId}#emails`);

    const firstEmail = deriveProspectWork(prospect, { ...emptySources, audits: [audit()] });
    expect(firstEmail.items[0]?.href).toBe(`/prospects/${prospect.prospectId}#emails`);
  });

  it('offers the first email again once the only Touch 1 draft was discarded', () => {
    // Hôtel Point France: the draft was skipped, the thread stayed e1-drafted,
    // and the prospect vanished from To do although the guard allows a redraft.
    const discarded = {
      threadId: 'thread-discarded',
      prospectId: prospect.prospectId,
      state: 'e1-drafted' as const,
      currentTouch: 1,
      touches: [],
      spacing: { touch2AfterDays: 4, touch3AfterDays: 11, replyWindowDays: 14 },
      updatedAt: new Date('2026-09-17T22:07:22.780Z'),
    };
    const frenchOnly = readyReports().filter((report) => report.language === 'fr');
    const work = deriveProspectWork(prospect, {
      ...emptySources,
      audits: [audit()],
      reports: frenchOnly,
      threads: [discarded],
    });
    expect(work.items.map((item) => item.kind)).toEqual(['first-email']);
    expect(work.recommendation?.action).toBe('create-first-email');

    const stillDrafted = deriveProspectWork(prospect, {
      ...emptySources,
      audits: [audit()],
      reports: frenchOnly,
      threads: [discarded],
      drafts: [
        {
          draftId: 'draft-live',
          prospectId: prospect.prospectId,
          threadId: discarded.threadId,
          touch: 1,
          status: 'created',
          createdAt: new Date('2026-09-18T00:00:00.000Z'),
        },
      ],
    });
    expect(stillDrafted.items.map((item) => item.kind)).toEqual(['draft']);
  });

  it('offers the follow-up again once its draft was discarded', () => {
    const work = deriveProspectWork(
      prospect,
      {
        ...emptySources,
        threads: [
          {
            threadId: 'thread-follow-up-discarded',
            prospectId: prospect.prospectId,
            state: 'e2-drafted',
            currentTouch: 2,
            touches: [
              {
                touch: 1,
                providerMessageId: 'message-1',
                sentAt: new Date('2026-09-01T00:00:00.000Z'),
                detectedAt: new Date('2026-09-01T00:00:00.000Z'),
              },
            ],
            spacing: { touch2AfterDays: 4, touch3AfterDays: 11, replyWindowDays: 14 },
            updatedAt: new Date('2026-09-06T00:00:00.000Z'),
          },
        ],
      },
      new Date('2026-09-15T00:00:00.000Z'),
    );
    expect(work.items.map((item) => item.kind)).toEqual(['follow-up']);
  });

  it('clears reply work once the thread points to a recorded outcome', () => {
    const work = deriveProspectWork(prospect, {
      ...emptySources,
      threads: [
        {
          threadId: 'thread-resolved',
          prospectId: prospect.prospectId,
          state: 'replied',
          currentTouch: 1,
          touches: [],
          spacing: { touch2AfterDays: 3, touch3AfterDays: 7, replyWindowDays: 14 },
          updatedAt: new Date(),
          currentOutcome: 'outcome-1',
        },
      ],
    });

    expect(work.items.some((item) => item.action === 'record-outcome')).toBe(false);
  });

  it('loads all work sources with one bounded query per collection', async () => {
    // Both load tests assert absolute call counts, so each starts from a
    // clean slate.
    vi.clearAllMocks();
    const auditCursor = chain([audit()]);
    const draftCursor = chain([]);
    const threadCursor = chain([]);
    const jobCursor = chain([]);
    vi.mocked(createAuditModel).mockReturnValue({
      find: vi.fn().mockReturnValue(auditCursor),
    } as never);
    vi.mocked(createOutreachDraftModel).mockReturnValue({
      find: vi.fn().mockReturnValue(draftCursor),
    } as never);
    vi.mocked(createOutreachThreadModel).mockReturnValue({
      find: vi.fn().mockReturnValue(threadCursor),
    } as never);
    vi.mocked(createJobModel).mockReturnValue({
      find: vi.fn().mockReturnValue(jobCursor),
    } as never);
    const reportCursor = chain([]);
    vi.mocked(createReportModel).mockReturnValue({
      find: vi.fn().mockReturnValue(reportCursor),
    } as never);
    vi.mocked(findSuppressionMatches).mockResolvedValue({
      domains: new Set(),
      addresses: new Set(),
    });
    vi.mocked(listNewestReportQualityRuns).mockResolvedValue(new Map());

    const work = await loadProspectWork({} as never, [
      prospect,
      { ...prospect, prospectId: 'p-2' },
    ]);
    expect(work).toHaveLength(2);
    expect(createAuditModel).toHaveBeenCalledTimes(1);
    expect(createOutreachDraftModel).toHaveBeenCalledTimes(1);
    expect(createOutreachThreadModel).toHaveBeenCalledTimes(1);
    expect(createJobModel).toHaveBeenCalledTimes(1);
    expect(createReportModel).toHaveBeenCalledTimes(1);
    expect(listNewestReportQualityRuns).toHaveBeenCalledTimes(1);
    expect(findSuppressionMatches).toHaveBeenCalledTimes(1);
    const reportProjection = reportCursor.select.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(reportProjection).sort()).toEqual(
      ['_id', 'analysisId', 'auditId', 'findingsProvenance', 'generatedAt', 'language'].sort(),
    );
    const auditProjection = auditCursor.select.mock.calls[0]?.[0] as Record<string, unknown>;
    // Only the per-page fields qualification reads, never the whole manifest.
    expect(auditProjection).not.toHaveProperty('pages');
    expect(auditProjection).toMatchObject({ 'pages.status': 1, 'pages.httpStatus': 1 });
    expect(auditProjection).not.toHaveProperty('findings');
    expect(auditProjection).not.toHaveProperty('analysis');
  });

  it('opens audit-input work only for needs-input jobs, never a technical failure (issues #382, #388)', async () => {
    const createdAt = new Date('2026-09-02T10:00:00.000Z');
    const jobCursor = chain([
      {
        jobId: 'job-render-lint',
        type: 'full-audit',
        status: 'failed',
        auditId: 'audit-old',
        createdAt,
        options: { prospectId: prospect.prospectId },
      },
    ]);
    vi.mocked(createAuditModel).mockReturnValue({
      find: vi.fn().mockReturnValue(chain([audit()])),
    } as never);
    vi.mocked(createOutreachDraftModel).mockReturnValue({
      find: vi.fn().mockReturnValue(chain([])),
    } as never);
    vi.mocked(createOutreachThreadModel).mockReturnValue({
      find: vi.fn().mockReturnValue(chain([])),
    } as never);
    vi.mocked(createJobModel).mockReturnValue({
      find: vi.fn().mockReturnValue(jobCursor),
    } as never);
    vi.mocked(createReportModel).mockReturnValue({
      find: vi.fn().mockReturnValue(chain([])),
    } as never);
    vi.mocked(findSuppressionMatches).mockResolvedValue({
      domains: new Set(),
      addresses: new Set(),
    });
    vi.mocked(listNewestReportQualityRuns).mockResolvedValue(new Map());

    const [work] = await loadProspectWork({} as never, [prospect]);

    expect(work?.items.some((item) => item.kind === 'audit-input')).toBe(false);
    // The technical failure still gates initial outreach, as a report task.
    expect(work?.items.map((item) => item.kind)).toEqual(['audit-report']);
    expect(work?.reportReadiness).toEqual({ state: 'not-ready', reason: 'failed' });
  });
});
