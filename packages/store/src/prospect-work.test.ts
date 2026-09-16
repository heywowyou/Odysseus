import { describe, expect, it, vi } from 'vitest';
import { NORMALIZATION_FINGERPRINT } from '@odysseus/core';

vi.mock('./schemas/audit.schema.js', () => ({ createAuditModel: vi.fn() }));
vi.mock('./schemas/job.schema.js', () => ({ createJobModel: vi.fn() }));
vi.mock('./schemas/outreach-draft.schema.js', () => ({ createOutreachDraftModel: vi.fn() }));
vi.mock('./schemas/outreach-thread.schema.js', () => ({ createOutreachThreadModel: vi.fn() }));
vi.mock('./suppression.js', () => ({ findSuppressionMatches: vi.fn() }));

import { createAuditModel } from './schemas/audit.schema.js';
import { createJobModel } from './schemas/job.schema.js';
import { createOutreachDraftModel } from './schemas/outreach-draft.schema.js';
import { createOutreachThreadModel } from './schemas/outreach-thread.schema.js';
import { findSuppressionMatches } from './suppression.js';
import {
  deriveProspectWork,
  loadProspectWork,
  selectNewestQualifyingAudit,
  type ProspectWorkAudit,
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
    findingsProvenance: { normalizationFingerprint: NORMALIZATION_FINGERPRINT },
    ...overrides,
  } as ProspectWorkAudit;
}

const emptySources = {
  audits: [],
  drafts: [],
  threads: [],
  needsInputJobs: [],
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

  it('recommends the first email, not a rescan, for a complete audit from older code', () => {
    const older = audit({ findingsProvenance: { normalizationFingerprint: 'older-release' } });
    expect(selectNewestQualifyingAudit([older])).toEqual({
      state: 'qualifying',
      audit: older,
      dataVersionState: 'older',
    });

    const work = deriveProspectWork(
      prospect,
      { ...emptySources, audits: [older] },
      new Date('2026-09-15T00:00:00.000Z'),
    );
    expect(work.auditState).toBe('qualifying');
    expect(work.dataVersionState).toBe('older');
    expect(work.items).toEqual([expect.objectContaining({ kind: 'first-email' })]);
    expect(work.recommendation).toMatchObject({ action: 'create-first-email' });
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

    expect(work.items).toHaveLength(1);
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
    vi.mocked(findSuppressionMatches).mockResolvedValue({
      domains: new Set(),
      addresses: new Set(),
    });

    const work = await loadProspectWork({} as never, [
      prospect,
      { ...prospect, prospectId: 'p-2' },
    ]);
    expect(work).toHaveLength(2);
    expect(createAuditModel).toHaveBeenCalledTimes(1);
    expect(createOutreachDraftModel).toHaveBeenCalledTimes(1);
    expect(createOutreachThreadModel).toHaveBeenCalledTimes(1);
    expect(createJobModel).toHaveBeenCalledTimes(1);
    expect(findSuppressionMatches).toHaveBeenCalledTimes(1);
    const auditProjection = auditCursor.select.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(auditProjection).toHaveProperty('pages', 1);
    expect(auditProjection).not.toHaveProperty('findings');
    expect(auditProjection).not.toHaveProperty('analysis');
  });
});
