import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NORMALIZATION_FINGERPRINT } from '@odysseus/core';

vi.mock('./active-jobs.js', () => ({
  planProspectJobLaunch: vi.fn(),
}));
vi.mock('./suppression.js', () => ({
  isSuppressed: vi.fn(),
}));
vi.mock('./schemas/audit.schema.js', () => ({
  createAuditModel: vi.fn(),
}));
vi.mock('./schemas/job.schema.js', () => ({
  createJobModel: vi.fn(),
}));
vi.mock('./schemas/prospect-event.schema.js', () => ({
  createProspectEventModel: vi.fn(),
}));
vi.mock('./outreach-threads.js', async (importOriginal) => ({
  followUpDueAt: (await importOriginal<typeof import('./outreach-threads.js')>()).followUpDueAt,
  findOutreachThreadByProspect: vi.fn(),
}));
vi.mock('./schemas/outreach-preview.schema.js', () => ({
  createOutreachPreviewModel: vi.fn(() => ({ exists: vi.fn().mockResolvedValue(null) })),
}));
vi.mock('./outreach-drafts.js', () => ({
  findLiveOutreachDraft: vi.fn(),
  findUnverifiedProviderDraft: vi.fn(async () => null),
}));
vi.mock('./outreach-report-readiness.js', () => ({
  loadOutreachReportReadiness: vi.fn(),
}));

import { planProspectJobLaunch } from './active-jobs.js';
import { findLiveOutreachDraft, findUnverifiedProviderDraft } from './outreach-drafts.js';
import { findOutreachThreadByProspect } from './outreach-threads.js';
import { checkOutreachAction, checkScanLaunch } from './guards.js';
import { isSuppressed } from './suppression.js';
import { createAuditModel } from './schemas/audit.schema.js';
import { createJobModel } from './schemas/job.schema.js';
import { createProspectEventModel } from './schemas/prospect-event.schema.js';
import { loadOutreachReportReadiness } from './outreach-report-readiness.js';

const fakeConnection = {} as never;

const DAY_MS = 24 * 60 * 60 * 1000;
const SPACING = { touch2AfterDays: 4, touch3AfterDays: 7, replyWindowDays: 14 };

/** A thread whose touches were all sent `sentDaysAgo` days ago, so a
 *  follow-up is due unless a test says otherwise. */
function threadIn(state: string, sentDaysAgo = 30, extra: Record<string, unknown> = {}) {
  const sentAt = new Date(Date.now() - sentDaysAgo * DAY_MS);
  return {
    threadId: 'thread-1',
    state,
    spacing: SPACING,
    touches: [1, 2].map((touch) => ({ touch, providerMessageId: `m${touch}`, sentAt })),
    ...extra,
  } as never;
}

const vendorHostedProspect = {
  prospectId: '6c00b0c7-6f37-4e98-a8d3-95f94db9f7a3',
  sector: 'hotel',
  name: 'ARK Hôtel',
  websites: [
    {
      url: 'https://arkhotel.octosite.net',
      registrableDomain: 'octosite.net',
      kind: 'vendor-hosted' as const,
      primary: true,
    },
  ],
  emails: [{ address: 'contact@octosite.net', origin: 'operator' as const }],
  status: 'new' as const,
  fieldOrigins: { name: 'operator' as const },
  createdAt: new Date(),
  updatedAt: new Date(),
  lastActivityAt: new Date(),
};

const audit = (overrides: Record<string, unknown> = {}) => ({
  auditId: 'audit-1',
  prospectId: vendorHostedProspect.prospectId,
  siteUrl: 'https://arkhotel.octosite.net',
  kind: 'prospecting-audit',
  startedAt: new Date('2026-09-01T10:00:00.000Z'),
  finishedAt: new Date('2026-09-01T10:10:00.000Z'),
  pages: [{ status: 'visited', url: 'https://arkhotel.octosite.net/' }],
  crawl: {},
  findingsProvenance: { normalizationFingerprint: NORMALIZATION_FINGERPRINT },
  scanIntent: 'prospecting-audit',
  ...overrides,
});

function mockAuditRows(rows: readonly Record<string, unknown>[]): void {
  const query = {
    select: vi.fn(),
    sort: vi.fn(),
    lean: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.sort.mockReturnValue(query);
  query.lean.mockResolvedValue(rows);
  vi.mocked(createAuditModel).mockReturnValue({ find: vi.fn().mockReturnValue(query) } as never);
}

function mockJobRows(rows: readonly Record<string, unknown>[] = []): void {
  const query = {
    select: vi.fn(),
    lean: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.lean.mockResolvedValue(rows);
  vi.mocked(createJobModel).mockReturnValue({ find: vi.fn().mockReturnValue(query) } as never);
}

describe('central prospect guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isSuppressed).mockResolvedValue(false);
    vi.mocked(planProspectJobLaunch).mockResolvedValue({ allowed: true });
    mockJobRows();
    vi.mocked(findOutreachThreadByProspect).mockResolvedValue(null);
    vi.mocked(createProspectEventModel).mockReturnValue({
      exists: vi.fn().mockResolvedValue(null),
    } as never);
    vi.mocked(findLiveOutreachDraft).mockResolvedValue(null);
    vi.mocked(loadOutreachReportReadiness).mockResolvedValue({ state: 'ready' });
  });

  it('refuses a follow-up the draft runtime would refuse', async () => {
    const check = () =>
      checkOutreachAction(fakeConnection, { prospect: vendorHostedProspect, action: 'follow-up' });
    vi.mocked(findOutreachThreadByProspect).mockResolvedValue(threadIn('e1-sent'));

    vi.mocked(findOutreachThreadByProspect).mockResolvedValueOnce(null);
    await expect(check()).resolves.toEqual({ allowed: false, refusal: 'thread-unknown' });

    vi.mocked(findOutreachThreadByProspect).mockResolvedValueOnce(threadIn('e1-drafted'));
    await expect(check()).resolves.toEqual({ allowed: false, refusal: 'thread-not-eligible' });

    vi.mocked(findLiveOutreachDraft).mockResolvedValueOnce({ draftId: 'd' } as never);
    await expect(check()).resolves.toEqual({ allowed: false, refusal: 'draft-already-live' });

    // Issue #552: an unanswered provider request waits for the operator's check.
    vi.mocked(findUnverifiedProviderDraft).mockResolvedValueOnce({ draftId: 'u' } as never);
    await expect(check()).resolves.toEqual({
      allowed: false,
      refusal: 'provider-draft-unverified',
    });

    // A discarded touch-two draft leaves the thread drafted; touch two is due again.
    vi.mocked(findOutreachThreadByProspect).mockResolvedValueOnce(threadIn('e2-drafted'));
    await expect(check()).resolves.toEqual({ allowed: true });

    vi.mocked(findOutreachThreadByProspect).mockResolvedValueOnce(threadIn('opted-out'));
    await expect(check()).resolves.toEqual({ allowed: false, refusal: 'thread-closed' });
  });

  it('refuses a follow-up before it is due or while the thread needs review (issue #479)', async () => {
    const check = () =>
      checkOutreachAction(fakeConnection, { prospect: vendorHostedProspect, action: 'follow-up' });

    vi.mocked(findOutreachThreadByProspect).mockResolvedValue(threadIn('e1-sent', 1));
    await expect(check()).resolves.toEqual({ allowed: false, refusal: 'follow-up-not-due' });

    vi.mocked(findOutreachThreadByProspect).mockResolvedValue(threadIn('e1-sent', 5));
    await expect(check()).resolves.toEqual({ allowed: true });

    vi.mocked(findOutreachThreadByProspect).mockResolvedValue(threadIn('e2-sent', 5));
    await expect(check()).resolves.toEqual({ allowed: false, refusal: 'follow-up-not-due' });

    vi.mocked(findOutreachThreadByProspect).mockResolvedValue(
      threadIn('e1-sent', 5, {
        needsReview: { reason: 'automated-response', detectedAt: new Date() },
      }),
    );
    await expect(check()).resolves.toEqual({ allowed: false, refusal: 'thread-needs-review' });
  });

  it('accepts a vendor-hosted website as a valid scan target', async () => {
    vi.mocked(isSuppressed).mockResolvedValue(false);
    vi.mocked(planProspectJobLaunch).mockResolvedValue({ allowed: true });

    await expect(
      checkScanLaunch(fakeConnection, {
        url: 'https://arkhotel.octosite.net',
        kind: 'full-audit',
      }),
    ).resolves.toEqual({ allowed: true, registrableDomain: 'octosite.net' });
  });

  it('returns explicit invalid, suppression, and host-busy refusals', async () => {
    await expect(
      checkScanLaunch(fakeConnection, { url: 'mailto:test@example.com', kind: 'quick-check' }),
    ).resolves.toEqual({ allowed: false, refusal: 'invalid-url' });

    vi.mocked(isSuppressed).mockResolvedValue(true);
    await expect(
      checkScanLaunch(fakeConnection, { url: 'https://example.com', kind: 'quick-check' }),
    ).resolves.toEqual({ allowed: false, refusal: 'suppressed' });

    vi.mocked(isSuppressed).mockResolvedValue(false);
    vi.mocked(planProspectJobLaunch).mockResolvedValue({
      allowed: false,
      conflictingJobId: 'busy-job',
    });
    await expect(
      checkScanLaunch(fakeConnection, { url: 'https://example.com', kind: 'full-audit' }),
    ).resolves.toEqual({ allowed: false, refusal: 'host-busy', conflictingJobId: 'busy-job' });
  });

  it('does not block a follow-up merely because the prospect is vendor-hosted', async () => {
    vi.mocked(findOutreachThreadByProspect).mockResolvedValue(threadIn('e1-sent'));
    await expect(
      checkOutreachAction(fakeConnection, { prospect: vendorHostedProspect, action: 'follow-up' }),
    ).resolves.toEqual({ allowed: true });
  });

  it('checks the website domain and each email on its own domain', async () => {
    vi.mocked(isSuppressed).mockImplementation(
      async (_connection, domain, address) =>
        domain === 'agency.example' && address === 'contact@agency.example',
    );
    const prospect = {
      ...vendorHostedProspect,
      websites: [
        {
          url: 'https://example.fr',
          registrableDomain: 'example.fr',
          kind: 'vendor-hosted' as const,
          primary: true,
        },
      ],
      emails: [{ address: 'contact@agency.example', origin: 'operator' as const }],
    };

    await expect(
      checkOutreachAction(fakeConnection, { prospect, action: 'follow-up' }),
    ).resolves.toEqual({ allowed: false, refusal: 'suppressed' });
    expect(isSuppressed).toHaveBeenCalledWith(fakeConnection, 'example.fr');
    expect(isSuppressed).toHaveBeenCalledWith(
      fakeConnection,
      'agency.example',
      'contact@agency.example',
    );
    expect(isSuppressed).not.toHaveBeenCalledWith(
      fakeConnection,
      'example.fr',
      'contact@agency.example',
    );
  });

  it('uses the newest qualifying attached audit, not merely the newest audit', async () => {
    const older = audit({ auditId: 'audit-old', startedAt: new Date('2026-09-01T10:00:00.000Z') });
    const newerIncomplete = audit({
      auditId: 'audit-new',
      startedAt: new Date('2026-09-10T10:00:00.000Z'),
      pages: [
        { status: 'error', url: 'https://arkhotel.octosite.net/' },
        { status: 'error', url: 'https://arkhotel.octosite.net/contact' },
      ],
    });
    mockAuditRows([newerIncomplete, older]);

    await expect(
      checkOutreachAction(fakeConnection, {
        prospect: vendorHostedProspect,
        action: 'first-email',
      }),
    ).resolves.toMatchObject({ allowed: true, audit: { auditId: 'audit-old' } });
  });

  it('keeps a prior automated first-touch guard after the outreach thread expires', async () => {
    mockAuditRows([audit()]);
    const exists = vi.fn().mockResolvedValue({ _id: 'historical-contact-event' });
    vi.mocked(createProspectEventModel).mockReturnValue({ exists } as never);

    await expect(
      checkOutreachAction(fakeConnection, {
        prospect: vendorHostedProspect,
        action: 'first-email',
      }),
    ).resolves.toEqual({ allowed: false, refusal: 'prospect-outreach-already-started' });
    expect(exists).toHaveBeenCalledWith({
      prospectId: vendorHostedProspect.prospectId,
      type: 'status-changed',
      actor: 'automation',
      'payload.to': 'contacted',
    });
  });

  it('accepts a complete audit normalized by older code and flags it as advisory', async () => {
    mockAuditRows([audit({ findingsProvenance: { normalizationFingerprint: 'older-release' } })]);

    for (const action of ['preview', 'first-email'] as const) {
      const check = await checkOutreachAction(fakeConnection, {
        prospect: vendorHostedProspect,
        action,
      });
      expect(check).toMatchObject({
        allowed: true,
        audit: { auditId: 'audit-1' },
        dataVersionState: 'older',
      });
      expect(check).not.toHaveProperty('refusal');
    }
  });

  it('refuses only on evidence, never on an unstamped data version alone', async () => {
    mockAuditRows([audit({ findingsProvenance: undefined })]);
    await expect(
      checkOutreachAction(fakeConnection, { prospect: vendorHostedProspect, action: 'preview' }),
    ).resolves.toMatchObject({ allowed: true, dataVersionState: 'unknown' });

    mockAuditRows([
      audit({
        findingsProvenance: { normalizationFingerprint: 'older-release' },
        pages: [
          { status: 'error', url: 'https://arkhotel.octosite.net/' },
          { status: 'error', url: 'https://arkhotel.octosite.net/contact' },
        ],
      }),
    ]);
    await expect(
      checkOutreachAction(fakeConnection, { prospect: vendorHostedProspect, action: 'preview' }),
    ).resolves.toEqual({
      allowed: false,
      refusal: 'no-complete-audit',
      auditState: 'incomplete',
    });
  });
  it('names the missing full scan before the missing email on a fresh prospect', async () => {
    mockAuditRows([]);
    const fresh = { ...vendorHostedProspect, emails: [] };
    for (const action of ['preview', 'first-email'] as const) {
      await expect(
        checkOutreachAction(fakeConnection, { prospect: fresh, action }),
      ).resolves.toMatchObject({ allowed: false, refusal: 'no-complete-audit' });
    }
    await expect(
      checkOutreachAction(fakeConnection, { prospect: fresh, action: 'follow-up' }),
    ).resolves.toMatchObject({ allowed: false, refusal: 'thread-unknown' });

    mockAuditRows([audit()]);
    await expect(
      checkOutreachAction(fakeConnection, { prospect: fresh, action: 'preview' }),
    ).resolves.toMatchObject({ allowed: false, refusal: 'no-contact' });
  });

  // Issue #388: Cap d'Antibes' PDF production failed, yet the first email was
  // offered. Preview and first email need the qualifying audit's reports.
  it('refuses the preview and the first email while the reports are not ready', async () => {
    mockAuditRows([audit()]);
    vi.mocked(loadOutreachReportReadiness).mockResolvedValue({
      state: 'not-ready',
      reason: 'failed',
    });

    for (const action of ['preview', 'first-email'] as const) {
      await expect(
        checkOutreachAction(fakeConnection, { prospect: vendorHostedProspect, action }),
      ).resolves.toEqual({
        allowed: false,
        refusal: 'report-not-ready',
        reportState: 'failed',
        auditId: 'audit-1',
      });
    }
    expect(loadOutreachReportReadiness).toHaveBeenCalledWith(fakeConnection, {
      auditId: 'audit-1',
      prospectId: vendorHostedProspect.prospectId,
    });
  });

  it('never gates a follow-up on report readiness', async () => {
    vi.mocked(loadOutreachReportReadiness).mockResolvedValue({
      state: 'not-ready',
      reason: 'stale',
    });
    vi.mocked(findOutreachThreadByProspect).mockResolvedValue(threadIn('e1-sent'));
    await expect(
      checkOutreachAction(fakeConnection, { prospect: vendorHostedProspect, action: 'follow-up' }),
    ).resolves.toEqual({ allowed: true });
    expect(loadOutreachReportReadiness).not.toHaveBeenCalled();
  });
});
