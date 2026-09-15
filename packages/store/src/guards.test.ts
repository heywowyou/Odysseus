import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./active-jobs.js', () => ({
  findActiveBrowserHeavyHostConflict: vi.fn(),
}));
vi.mock('./suppression.js', () => ({
  isSuppressed: vi.fn(),
}));
vi.mock('./schemas/audit.schema.js', () => ({
  createAuditModel: vi.fn(),
}));

import { findActiveBrowserHeavyHostConflict } from './active-jobs.js';
import { checkOutreachAction, checkScanLaunch } from './guards.js';
import { isSuppressed } from './suppression.js';
import { createAuditModel } from './schemas/audit.schema.js';

const fakeConnection = {} as never;

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
  findingsProvenance: { normalizationFingerprint: '256750115048ff0a' },
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

describe('central prospect guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isSuppressed).mockResolvedValue(false);
    vi.mocked(findActiveBrowserHeavyHostConflict).mockResolvedValue(null);
  });

  it('accepts a vendor-hosted website as a valid scan target', async () => {
    vi.mocked(isSuppressed).mockResolvedValue(false);
    vi.mocked(findActiveBrowserHeavyHostConflict).mockResolvedValue(null);

    await expect(
      checkScanLaunch(fakeConnection, {
        url: 'https://arkhotel.octosite.net',
        kind: 'prospecting-audit',
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
    vi.mocked(findActiveBrowserHeavyHostConflict).mockResolvedValue({ jobId: 'busy-job' } as never);
    await expect(
      checkScanLaunch(fakeConnection, { url: 'https://example.com', kind: 'full-audit' }),
    ).resolves.toEqual({ allowed: false, refusal: 'host-busy' });
  });

  it('does not block a follow-up merely because the prospect is vendor-hosted', async () => {
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

  it('explains when no attached audit qualifies', async () => {
    mockAuditRows([
      audit({
        findingsProvenance: undefined,
        pages: [{ status: 'visited', url: 'https://arkhotel.octosite.net/' }],
      }),
    ]);

    await expect(
      checkOutreachAction(fakeConnection, {
        prospect: vendorHostedProspect,
        action: 'preview',
      }),
    ).resolves.toEqual({
      allowed: false,
      refusal: 'audit-stale',
      auditState: 'stale',
    });
  });
});
