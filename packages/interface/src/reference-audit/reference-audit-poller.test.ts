import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/store', () => ({
  recordReferenceAuditRequest: vi.fn(),
}));

import { recordReferenceAuditRequest } from '@odysseus/store';
import {
  processReferenceAuditReceipts,
  type ReferenceAuditReceipt,
} from './reference-audit-poller.js';
import {
  createInMemoryReferenceAuditReceiptBucket,
  REFERENCE_AUDIT_RECEIPT_PREFIX,
  type ReferenceAuditReceiptBucket,
} from './reference-audit-receipt-bucket.js';

const connection = {} as never;
const now = new Date('2026-09-20T12:00:00.000Z');

function receipt(overrides: Partial<ReferenceAuditReceipt> = {}): ReferenceAuditReceipt {
  return {
    tokenHash: 'a'.repeat(64),
    requestedAt: '2026-09-20T11:00:00.000Z',
    referenceVersion: 'reference-release-v1',
    ...overrides,
  };
}

describe('reference audit receipt poller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(recordReferenceAuditRequest).mockResolvedValue({ accepted: true, first: true });
  });

  it('consumes only the bounded receipt shape and forwards no request metadata', async () => {
    const bucket = createInMemoryReferenceAuditReceiptBucket();
    await bucket.putJson(`${REFERENCE_AUDIT_RECEIPT_PREFIX}valid.json`, receipt());
    await bucket.putJson(`${REFERENCE_AUDIT_RECEIPT_PREFIX}extra.json`, {
      ...receipt({ tokenHash: 'b'.repeat(64) }),
      ip: '192.0.2.1',
      userAgent: 'test-agent',
    });

    const result = await processReferenceAuditReceipts({ bucket, connection, now });

    expect(result).toEqual({ processed: 1, accepted: 1, discarded: 1, failed: 0 });
    expect(recordReferenceAuditRequest).toHaveBeenCalledOnce();
    expect(recordReferenceAuditRequest).toHaveBeenCalledWith(connection, {
      tokenHash: 'a'.repeat(64),
      referenceVersion: 'reference-release-v1',
      requestedAt: new Date('2026-09-20T11:00:00.000Z'),
    });
    expect(bucket.keys()).toEqual([]);
  });

  it('discards future receipts and keeps transient failures for the next tick', async () => {
    const inMemory = createInMemoryReferenceAuditReceiptBucket();
    await inMemory.putJson(
      `${REFERENCE_AUDIT_RECEIPT_PREFIX}future.json`,
      receipt({ requestedAt: '2026-09-21T11:00:00.000Z' }),
    );
    const transientKey = `${REFERENCE_AUDIT_RECEIPT_PREFIX}transient.json`;
    const bucket: ReferenceAuditReceiptBucket = {
      list: async () => [transientKey],
      getJson: async () => {
        throw new Error('temporary object-store failure');
      },
      delete: async () => undefined,
    };

    const futureResult = await processReferenceAuditReceipts({
      bucket: inMemory,
      connection,
      now,
    });
    const transientResult = await processReferenceAuditReceipts({ bucket, connection, now });

    expect(futureResult).toEqual({ processed: 0, accepted: 0, discarded: 1, failed: 0 });
    expect(transientResult).toEqual({ processed: 0, accepted: 0, discarded: 0, failed: 1 });
    expect(recordReferenceAuditRequest).not.toHaveBeenCalled();
  });
});
