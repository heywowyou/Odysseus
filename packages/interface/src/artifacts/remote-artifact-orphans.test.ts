import { describe, expect, it } from 'vitest';
import type { ArtifactStore } from './artifact-store.js';
import { findRemoteArtifactOrphans } from './remote-artifact-orphans.js';

function listingStore(keys: string[]): ArtifactStore {
  return {
    get: async () => null,
    put: async () => undefined,
    list: async (prefix) => keys.filter((key) => key.startsWith(prefix)),
    delete: async () => {
      throw new Error('discovery must never delete');
    },
  };
}

describe('findRemoteArtifactOrphans (issue #384)', () => {
  const now = new Date('2026-09-20T00:00:00Z');

  it('reports only well-formed, old, unowned audit prefixes as orphans', async () => {
    const store = listingStore([
      'hotel.example/2026-09-16T10-00-00Z/manifest.json',
      'hotel.example/2026-09-16T10-00-00Z/pages/p1/scan.json',
      'hotel.example/2026-09-17T10-00-00Z/manifest.json',
      'other.example/2026-09-16T10-00-00Z/manifest.json',
      'fresh.example/2026-09-19T23-00-00Z/manifest.json',
      'loose-file.txt',
      'hotel.example/not-a-timestamp/manifest.json',
      'hotel.example/2026-09-16T10-00-00Z',
    ]);
    const audits = [
      { siteUrl: 'https://hotel.example/', startedAt: new Date('2026-09-17T10:00:00.456Z') },
    ];

    const report = await findRemoteArtifactOrphans(store, audits, { now });

    expect(report.orphans).toEqual([
      {
        prefix: 'hotel.example/2026-09-16T10-00-00Z/',
        hostname: 'hotel.example',
        startedAt: new Date('2026-09-16T10:00:00Z'),
        objects: 2,
      },
      {
        prefix: 'other.example/2026-09-16T10-00-00Z/',
        hostname: 'other.example',
        startedAt: new Date('2026-09-16T10:00:00Z'),
        objects: 1,
      },
    ]);
    expect(report.owned).toBe(1);
    expect(report.tooRecent).toBe(1);
    expect(report.unidentifiedKeys).toEqual([
      'loose-file.txt',
      'hotel.example/not-a-timestamp/manifest.json',
      'hotel.example/2026-09-16T10-00-00Z',
    ]);
  });
});
