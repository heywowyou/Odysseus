import { describe, expect, it, vi } from 'vitest';
import { resolveReferenceAuditRedirect } from './reference-audit-redirect';
import type { ReferenceAuditReader } from './reference-audit-object';
import {
  hashReferenceAuditToken,
  referenceAuditReceiptKey,
  type ReferenceAuditReceiptWriter,
} from './reference-audit-receipt';

const token = 'A'.repeat(43);
const manifest = {
  referenceReleaseVersion: 'reference-release-v7',
} as never;

describe('reference audit tracked redirect', () => {
  it('writes only the bounded hashed receipt and redirects to the canonical route', async () => {
    const receipts: unknown[] = [];
    const reader: ReferenceAuditReader = {
      readCurrent: vi.fn(async () => ({ manifest, pdf: new Uint8Array() })),
    };
    const writer: ReferenceAuditReceiptWriter = {
      write: vi.fn(async (receipt) => void receipts.push(receipt)),
    };
    const response = await resolveReferenceAuditRedirect({
      token,
      reader,
      writer,
      now: new Date('2026-09-20T10:00:00.000Z'),
    });

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('/exemple-audit');
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toEqual({
      tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
      requestedAt: '2026-09-20T10:00:00.000Z',
      referenceVersion: 'reference-release-v7',
    });
    expect(JSON.stringify(receipts[0])).not.toContain(token);
  });

  it('redirects successfully when the receipt writer fails', async () => {
    const response = await resolveReferenceAuditRedirect({
      token,
      reader: { readCurrent: async () => ({ manifest, pdf: new Uint8Array() }) },
      writer: {
        write: async () => {
          throw new Error('bucket down');
        },
      },
    });
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('/exemple-audit');
  });

  it('does not touch storage for malformed path tokens', async () => {
    const reader = { readCurrent: vi.fn() } as unknown as ReferenceAuditReader;
    const writer = { write: vi.fn() } as unknown as ReferenceAuditReceiptWriter;
    const response = await resolveReferenceAuditRedirect({
      token: 'short',
      reader,
      writer,
    });
    expect(response.status).toBe(307);
    expect(reader.readCurrent).not.toHaveBeenCalled();
    expect(writer.write).not.toHaveBeenCalled();
  });

  it('keys a receipt by token and day, so a repeat overwrites it (issue #551)', () => {
    const receipt = (requestedAt: string, tokenHash = hashReferenceAuditToken(token)) => ({
      tokenHash,
      requestedAt,
      referenceVersion: 'reference-release-v7',
    });
    const morning = referenceAuditReceiptKey(receipt('2026-09-20T08:00:00.000Z'));
    expect(referenceAuditReceiptKey(receipt('2026-09-20T22:30:00.000Z'))).toBe(morning);
    expect(referenceAuditReceiptKey(receipt('2026-09-21T08:00:00.000Z'))).not.toBe(morning);
    expect(
      referenceAuditReceiptKey(
        receipt('2026-09-20T08:00:00.000Z', hashReferenceAuditToken('B'.repeat(43))),
      ),
    ).not.toBe(morning);
    expect(morning).toMatch(/^reference-audit-receipts\/2026-09-20\/[0-9a-f]{64}\.json$/u);
  });
});
