import { beforeEach, describe, expect, it, vi } from 'vitest';

// Plan 077: the retention sweeper deletes stored audits, so it must start
// only when `serve` passes the deployment's flag through, never by default.

vi.mock('./outreach/opt-out-poller.js', () => ({ startOptOutPoller: vi.fn(() => vi.fn()) }));
vi.mock('./outreach/mailbox-sync.js', () => ({ startMailboxSyncPoller: vi.fn(() => vi.fn()) }));
vi.mock('./reference-audit/reference-audit-poller.js', () => ({
  startReferenceAuditReceiptPoller: vi.fn(() => vi.fn()),
}));
vi.mock('./retention/retention-sweeper.js', () => ({
  startRetentionSweeper: vi.fn(() => vi.fn()),
}));

import { startRetentionSweeper } from './retention/retention-sweeper.js';
import { startBackgroundPollers } from './server.js';

const connection = {} as never;
const queue = { listInFlightJobIds: () => [] };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('startBackgroundPollers', () => {
  it('does not start the retention sweeper without the option', () => {
    startBackgroundPollers(connection, queue, {
      pollOptOutRequests: true,
      syncMailbox: true,
      pollReferenceAuditReceipts: true,
    });
    startBackgroundPollers(connection, queue, { retentionSweep: false });

    expect(startRetentionSweeper).not.toHaveBeenCalled();
  });

  it('starts it with the queue when the option is on, and stops it on close', () => {
    const stop = startBackgroundPollers(connection, queue, { retentionSweep: true });

    expect(startRetentionSweeper).toHaveBeenCalledWith(connection, { queue });
    const stopSweeper = vi.mocked(startRetentionSweeper).mock.results[0]!.value as () => void;
    stop();
    expect(stopSweeper).toHaveBeenCalledOnce();
  });
});
