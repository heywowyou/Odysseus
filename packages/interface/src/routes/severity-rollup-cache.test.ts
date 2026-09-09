import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/store', () => ({
  getSeverityRollups: vi.fn(),
}));

import { getSeverityRollups, type SeverityRollup } from '@odysseus/store';
import {
  getSeverityRollupsForPoll,
  resetSeverityRollupCacheForTests,
} from './severity-rollup-cache.js';

const fakeConnection = {} as never;

/** Each store call answers with distinct rollup objects carrying the call
 *  number, so a test can tell a refetch from a cache hit by value and by
 *  object identity. */
let fetchCount = 0;

beforeEach(() => {
  resetSeverityRollupCacheForTests();
  vi.mocked(getSeverityRollups).mockReset();
  fetchCount = 0;
  vi.mocked(getSeverityRollups).mockImplementation(async (_connection, auditIds) => {
    fetchCount += 1;
    const result = new Map<string, SeverityRollup>();
    for (const auditId of auditIds) {
      result.set(auditId, { critical: fetchCount, serious: 0, moderate: 0, minor: 0 });
    }
    return result;
  });
});

describe('getSeverityRollupsForPoll', () => {
  it('serves a repeat poll with the same auditIds from the cache inside the TTL', async () => {
    const t = 0;
    const first = await getSeverityRollupsForPoll(fakeConnection, ['audit-a'], {
      ttlMs: 1000,
      now: () => t,
    });
    const second = await getSeverityRollupsForPoll(fakeConnection, ['audit-a'], {
      ttlMs: 1000,
      now: () => t + 500,
    });

    expect(getSeverityRollups).toHaveBeenCalledTimes(1);
    expect(second.get('audit-a')).toEqual(first.get('audit-a'));
    expect(second.get('audit-a')).toEqual({ critical: 1, serious: 0, moderate: 0, minor: 0 });
  });

  it('refetches an entry once the poll clock moves past the TTL', async () => {
    const t = 0;
    await getSeverityRollupsForPoll(fakeConnection, ['audit-b'], { ttlMs: 1000, now: () => t });
    const second = await getSeverityRollupsForPoll(fakeConnection, ['audit-b'], {
      ttlMs: 1000,
      now: () => t + 1001,
    });

    expect(getSeverityRollups).toHaveBeenCalledTimes(2);
    expect(second.get('audit-b')).toEqual({ critical: 2, serious: 0, moderate: 0, minor: 0 });
  });

  it('drops every cached entry when the poll auditId set changes, even inside the TTL', async () => {
    const t = 0;
    await getSeverityRollupsForPoll(fakeConnection, ['audit-c'], { ttlMs: 1000, now: () => t });
    const second = await getSeverityRollupsForPoll(fakeConnection, ['audit-c', 'audit-d'], {
      ttlMs: 1000,
      now: () => t + 100,
    });

    expect(getSeverityRollups).toHaveBeenCalledTimes(2);
    expect(vi.mocked(getSeverityRollups).mock.calls[1]?.[1]).toEqual(['audit-c', 'audit-d']);
    expect(second.get('audit-d')).toEqual({ critical: 2, serious: 0, moderate: 0, minor: 0 });
  });

  it('answers an empty id list with an empty map and never calls the store', async () => {
    const t = 0;
    const result = await getSeverityRollupsForPoll(fakeConnection, [], {
      ttlMs: 1000,
      now: () => t,
    });

    expect(result.size).toBe(0);
    expect(getSeverityRollups).not.toHaveBeenCalled();
  });

  it('never aliases one fetch rollup object into a later refetch result', async () => {
    const t = 0;
    const first = await getSeverityRollupsForPoll(fakeConnection, ['audit-e'], {
      ttlMs: 1000,
      now: () => t,
    });
    // A caller mutating what it received must not reach the next fetch's
    // answer; each fetch hands out the store's own distinct object.
    const held = first.get('audit-e');
    if (held) held.critical = 99;

    const second = await getSeverityRollupsForPoll(fakeConnection, ['audit-e'], {
      ttlMs: 1000,
      now: () => t + 1001,
    });

    expect(second.get('audit-e')).not.toBe(held);
    expect(second.get('audit-e')).toEqual({ critical: 2, serious: 0, moderate: 0, minor: 0 });
  });
});
