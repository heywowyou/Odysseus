import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { DirectoryEntry } from '@odysseus/core';
import {
  archiveProspect,
  createRandomIndependentProspectFromDirectory,
  listDirectory,
  listProspectEvents,
  upsertDirectoryEntries,
} from './prospect-hub.js';
import { createDirectoryEntryModel } from './schemas/directory-entry.schema.js';
import { createProspectEventModel } from './schemas/prospect-event.schema.js';
import { createProspectHubModel } from './schemas/prospect-hub.schema.js';
import { probeMongoAvailability, scopedMongoTestUri } from './test-support.js';

const { available, connection } = await probeMongoAvailability(
  scopedMongoTestUri('directory_random_prospect'),
);

afterAll(async () => {
  if (!connection) return;
  await connection.dropDatabase();
  await connection.close();
});

type GroupStatus = NonNullable<DirectoryEntry['groupStatus']>;

interface Fixture {
  directoryId: string;
  groupStatus?: GroupStatus;
  stars?: number;
  department?: string;
  rooms?: number;
  name?: string;
}

/** Seeds directory rows with an explicit stored groupStatus: the import's own
 *  domain-based derivation is not what these tests exercise. */
async function seed(fixtures: readonly Fixture[]): Promise<void> {
  const at = new Date('2026-09-01T00:00:00.000Z');
  await upsertDirectoryEntries(
    connection!,
    fixtures.map((fixture) => ({
      directoryId: fixture.directoryId,
      sector: 'hotel',
      name: fixture.name ?? `Hôtel ${fixture.directoryId}`,
      websiteUrl: `https://${fixture.directoryId}.example/`,
      registrableDomain: `${fixture.directoryId}.example`,
      websiteKind: 'own' as const,
      stars: fixture.stars ?? 3,
      ...(fixture.department === undefined ? {} : { department: fixture.department }),
      ...(fixture.rooms === undefined ? {} : { rooms: fixture.rooms }),
      sourceRefs: [{ source: 'atout-france', sourceId: `src-${fixture.directoryId}` }],
      createdAt: at,
      updatedAt: at,
    })),
  );
  const Directory = createDirectoryEntryModel(connection!);
  for (const fixture of fixtures) {
    await Directory.updateOne(
      { directoryId: fixture.directoryId },
      { $set: { groupStatus: fixture.groupStatus ?? 'independent' } },
    );
  }
}

async function linkedProspectId(directoryId: string): Promise<string | undefined> {
  const entry = await createDirectoryEntryModel(connection!)
    .findOne({ directoryId })
    .lean<DirectoryEntry>();
  return entry?.prospectId;
}

describe.skipIf(!available)('random independent prospect from the directory', () => {
  beforeEach(async () => {
    await createDirectoryEntryModel(connection!).deleteMany({});
    await createProspectHubModel(connection!).deleteMany({});
    await createProspectEventModel(connection!).deleteMany({});
  });

  it('creates the only eligible entry through the normal directory add', async () => {
    await seed([{ directoryId: 'only-one', department: '33', rooms: 12 }]);

    const created = await createRandomIndependentProspectFromDirectory(connection!, {});

    expect(created).not.toBeNull();
    expect(created!.name).toBe('Hôtel only-one');
    expect(created!.status).toBe('new');
    expect(created!.hotel?.groupStatus).toBe('independent');
    expect(created!.directoryRef).toEqual({ source: 'atout-france', sourceId: 'src-only-one' });
    expect(created!.fieldOrigins['name']).toBe('atout-france');
    expect(await linkedProspectId('only-one')).toBe(created!.prospectId);
    const events = await listProspectEvents(connection!, created!.prospectId);
    expect(events.map((event) => event.type)).toContain('prospect-created');
    // No random-selection bookkeeping on the created record.
    expect(Object.keys(created!)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/random|drawn/i)]),
    );
  });

  it('never selects a group-member, vendor-hosted or unknown entry', async () => {
    await seed([
      { directoryId: 'grp', groupStatus: 'group-member' },
      { directoryId: 'vendor', groupStatus: 'vendor-hosted' },
      { directoryId: 'unknown', groupStatus: 'unknown' },
      { directoryId: 'indep', groupStatus: 'independent' },
    ]);

    const first = await createRandomIndependentProspectFromDirectory(connection!, {});
    expect(first?.name).toBe('Hôtel indep');
    expect(await createRandomIndependentProspectFromDirectory(connection!, {})).toBeNull();
    for (const id of ['grp', 'vendor', 'unknown']) {
      expect(await linkedProspectId(id)).toBeUndefined();
    }
  });

  it('forces independence even when the filter asks for another group status', async () => {
    await seed([
      { directoryId: 'grp-forced', groupStatus: 'group-member' },
      { directoryId: 'indep-forced', groupStatus: 'independent' },
    ]);

    const created = await createRandomIndependentProspectFromDirectory(connection!, {
      groupStatus: 'group-member',
    });
    expect(created?.name).toBe('Hôtel indep-forced');
  });

  it('excludes entries already linked to active or archived prospects', async () => {
    await seed([{ directoryId: 'first' }, { directoryId: 'second' }]);

    const a = await createRandomIndependentProspectFromDirectory(connection!, {});
    const b = await createRandomIndependentProspectFromDirectory(connection!, {});
    expect(new Set([a?.name, b?.name])).toEqual(new Set(['Hôtel first', 'Hôtel second']));
    await archiveProspect(connection!, a!.prospectId);

    expect(await createRandomIndependentProspectFromDirectory(connection!, {})).toBeNull();
    expect(await createProspectHubModel(connection!).countDocuments()).toBe(2);
  });

  it('respects the current directory facets', async () => {
    await seed([
      { directoryId: 'three-33', stars: 3, department: '33', rooms: 20 },
      { directoryId: 'four-75', stars: 4, department: '75', rooms: 20 },
      { directoryId: 'four-33-big', stars: 4, department: '33', rooms: 80 },
      { directoryId: 'four-33', stars: 4, department: '33', rooms: 20, name: 'Le Phare' },
    ]);

    const created = await createRandomIndependentProspectFromDirectory(connection!, {
      stars: 4,
      department: '33',
      roomsMax: 40,
      q: 'phare',
    });
    expect(created?.name).toBe('Le Phare');
    expect(
      await createRandomIndependentProspectFromDirectory(connection!, {
        stars: 4,
        department: '33',
        roomsMax: 40,
      }),
    ).toBeNull();
  });

  it('draws from the whole matching pool, not the first page', async () => {
    const fillers = Array.from({ length: 60 }, (_, index) => ({
      directoryId: `a-${String(index).padStart(3, '0')}`,
      groupStatus: 'group-member' as const,
    }));
    await seed([...fillers, { directoryId: 'zz-last', name: 'Zz Last Hotel' }]);
    const firstPage = await listDirectory(connection!, {});
    expect(firstPage.rows.map((row) => row.directoryId)).not.toContain('zz-last');

    const created = await createRandomIndependentProspectFromDirectory(connection!, {
      page: 1,
      pageSize: 1,
    });
    expect(created?.name).toBe('Zz Last Hotel');
  });

  it('returns null when nothing matches', async () => {
    await seed([{ directoryId: 'elsewhere', department: '75' }]);
    expect(
      await createRandomIndependentProspectFromDirectory(connection!, { department: '33' }),
    ).toBeNull();
  });

  it('never creates two prospects from one entry under concurrent draws', async () => {
    await seed([{ directoryId: 'contested' }]);

    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        createRandomIndependentProspectFromDirectory(connection!, {}),
      ),
    );

    expect(results.filter((result) => result !== null)).toHaveLength(1);
    expect(await createProspectHubModel(connection!).countDocuments()).toBe(1);
  });

  it('resamples when a concurrent add wins the sampled entry', async () => {
    await seed([{ directoryId: 'lost' }, { directoryId: 'kept' }]);
    const Directory = createDirectoryEntryModel(connection!);
    const originalAggregate = Directory.aggregate;
    let draws = 0;
    // The first draw returns 'lost', then another request claims it before
    // this one can add it.
    Directory.aggregate = function (this: unknown, ...args: Parameters<typeof originalAggregate>) {
      draws += 1;
      if (draws === 1) {
        return Promise.resolve(
          Directory.updateOne(
            { directoryId: 'lost' },
            { $set: { prospectId: 'claimed-elsewhere', updatedAt: new Date() } },
          ).then(() => [{ directoryId: 'lost' }]),
        ) as never;
      }
      return originalAggregate.apply(Directory, args);
    } as typeof originalAggregate;
    try {
      const created = await createRandomIndependentProspectFromDirectory(connection!, {});
      expect(created?.name).toBe('Hôtel kept');
      expect(draws).toBe(2);
    } finally {
      Directory.aggregate = originalAggregate;
    }
  });
});
