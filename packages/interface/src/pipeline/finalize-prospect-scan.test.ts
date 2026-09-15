import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/store', () => ({
  advanceProspectStatus: vi.fn(),
  appendProspectEvent: vi.fn(),
  isOutreachQualifyingAudit: vi.fn(),
}));

import {
  advanceProspectStatus,
  appendProspectEvent,
  isOutreachQualifyingAudit,
} from '@odysseus/store';
import { finalizeProspectScan } from './finalize-prospect-scan.js';

const fakeConnection = {} as never;

function manifest(scanIntent: 'quick-check' | 'prospecting-audit' | 'full-audit') {
  return {
    auditId: 'audit-1',
    scanIntent,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(appendProspectEvent).mockResolvedValue(undefined);
  vi.mocked(advanceProspectStatus).mockResolvedValue(null);
});

describe('finalizeProspectScan', () => {
  it('records a Quick Check attachment without advancing workflow status', async () => {
    vi.mocked(isOutreachQualifyingAudit).mockReturnValue(false);

    await finalizeProspectScan(fakeConnection, {
      prospectId: 'prospect-1',
      manifest: manifest('quick-check'),
    });

    expect(appendProspectEvent).toHaveBeenCalledWith(
      fakeConnection,
      expect.objectContaining({
        prospectId: 'prospect-1',
        type: 'scan-attached',
        payload: { auditId: 'audit-1', scanIntent: 'quick-check' },
      }),
    );
    expect(advanceProspectStatus).not.toHaveBeenCalled();
  });

  it.each(['prospecting-audit', 'full-audit'] as const)(
    'advances a qualifying %s attachment to audited',
    async (scanIntent) => {
      vi.mocked(isOutreachQualifyingAudit).mockReturnValue(true);

      await finalizeProspectScan(fakeConnection, {
        prospectId: 'prospect-1',
        manifest: manifest(scanIntent),
      });

      expect(advanceProspectStatus).toHaveBeenCalledWith(
        fakeConnection,
        'prospect-1',
        'audited',
        'scanner',
      );
    },
  );
});
