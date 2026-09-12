import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/store', () => ({
  createAuditModel: vi.fn(),
  linkAuditToHotelByDomain: vi.fn(),
  replaceDetectedManualFields: vi.fn(),
}));
vi.mock('./audit-stage.js', () => ({ resolveCoverPrefill: vi.fn() }));

import {
  createAuditModel,
  linkAuditToHotelByDomain,
  replaceDetectedManualFields,
} from '@odysseus/store';
import { resolveCoverPrefill } from './audit-stage.js';
import { backfillAuditHotelLinks } from './backfill-audit-hotel-links.js';

const fakeConnection = {} as never;

function fakeAuditModel(unlinked: { auditId: string; siteUrl: string }[]) {
  return {
    find: vi.fn(() => ({
      limit: vi.fn(() => ({
        lean: vi.fn(async () => unlinked),
      })),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('backfillAuditHotelLinks', () => {
  it('links each unlinked audit and applies its cover-prefill candidates, counting only real matches', async () => {
    vi.mocked(createAuditModel).mockReturnValue(
      fakeAuditModel([
        { auditId: 'audit-1', siteUrl: 'https://hotel-one.example/' },
        { auditId: 'audit-2', siteUrl: 'https://no-match.example/' },
      ]) as never,
    );
    vi.mocked(linkAuditToHotelByDomain).mockImplementation(async (_c, auditId) =>
      auditId === 'audit-1'
        ? { candidate: { candidateId: 'cand-1', name: 'HÔTEL EXEMPLE' } as never }
        : { candidate: null },
    );
    vi.mocked(resolveCoverPrefill).mockResolvedValue({ nomCommercial: 'Hôtel Exemple' });

    const linked = await backfillAuditHotelLinks(fakeConnection);

    expect(linked).toBe(1);
    expect(linkAuditToHotelByDomain).toHaveBeenCalledWith(
      fakeConnection,
      'audit-1',
      'https://hotel-one.example/',
    );
    expect(linkAuditToHotelByDomain).toHaveBeenCalledWith(
      fakeConnection,
      'audit-2',
      'https://no-match.example/',
    );
    // No obligationAssessment is available for an already-persisted audit;
    // 'undetermined' with no basis makes resolveCoverPrefill skip the
    // registrySnapshot half and rely on the linked candidate alone.
    expect(resolveCoverPrefill).toHaveBeenCalledWith(
      fakeConnection,
      { candidateId: 'cand-1', name: 'HÔTEL EXEMPLE' },
      { status: 'undetermined', basis: [] },
      undefined,
      undefined,
    );
    expect(replaceDetectedManualFields).toHaveBeenCalledTimes(1);
    expect(replaceDetectedManualFields).toHaveBeenCalledWith(fakeConnection, 'audit-1', {
      nomCommercial: 'Hôtel Exemple',
    });
  });

  it('writes nothing for an audit whose site matches no hotel candidate', async () => {
    vi.mocked(createAuditModel).mockReturnValue(
      fakeAuditModel([{ auditId: 'audit-3', siteUrl: 'https://no-match.example/' }]) as never,
    );
    vi.mocked(linkAuditToHotelByDomain).mockResolvedValue({ candidate: null });

    const linked = await backfillAuditHotelLinks(fakeConnection);

    expect(linked).toBe(0);
    expect(resolveCoverPrefill).not.toHaveBeenCalled();
    expect(replaceDetectedManualFields).not.toHaveBeenCalled();
  });

  it('queries only audits carrying neither outreach nor hotelLink', async () => {
    const model = fakeAuditModel([]);
    vi.mocked(createAuditModel).mockReturnValue(model as never);

    await backfillAuditHotelLinks(fakeConnection);

    expect(vi.mocked(model.find)).toHaveBeenCalledWith(
      { outreach: { $exists: false }, hotelLink: { $exists: false } },
      { _id: 0, auditId: 1, siteUrl: 1 },
    );
  });
});
