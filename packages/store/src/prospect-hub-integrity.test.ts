import { afterAll, describe, expect, it } from 'vitest';
import type { Model } from 'mongoose';
import {
  archiveProspect,
  createProspectHub,
  getProspectHub,
  listProspectEvents,
  restoreProspect,
  updateProspect,
} from './prospect-hub.js';
import { createProspectEventModel } from './schemas/prospect-event.schema.js';
import { createProspectHubModel, type ProspectHubDocument } from './schemas/prospect-hub.schema.js';
import { probeMongoAvailability, scopedMongoTestUri } from './test-support.js';

const { available, connection } = await probeMongoAvailability(
  scopedMongoTestUri('prospect_hub_integrity'),
);

afterAll(async () => {
  if (!connection) return;
  await connection.dropDatabase();
  await connection.close();
});

async function newProspect(name: string): Promise<ProspectHubDocument> {
  const domain = `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.example`;
  return createProspectHub(connection!, {
    sector: 'hotel',
    name,
    websites: [
      { url: `https://${domain}/`, registrableDomain: domain, kind: 'own', primary: true },
    ],
  });
}

/** Runs `between` right after the next findOne on the model resolves, so a
 *  read-modify-write under test sees a copy that is stale by the time it
 *  writes. Restores the model before running `between`. */
function afterNextRead(model: Model<ProspectHubDocument>, between: () => Promise<unknown>): void {
  const original = model.findOne;
  model.findOne = function (this: unknown, ...args: Parameters<typeof original>) {
    model.findOne = original;
    const query = original.apply(model, args);
    const exec = query.exec.bind(query);
    query.exec = (async () => {
      const result = await exec();
      await between();
      return result;
    }) as typeof query.exec;
    return query;
  } as typeof original;
}

describe.skipIf(!available)('prospect record integrity', () => {
  it('keeps an archive that lands between an update read and its write', async () => {
    const prospect = await newProspect('Concurrent Archive');
    afterNextRead(createProspectHubModel(connection!), () =>
      archiveProspect(connection!, prospect.prospectId),
    );

    const updated = await updateProspect(connection!, prospect.prospectId, {
      notes: 'edited while archiving',
    });

    const stored = await getProspectHub(connection!, prospect.prospectId);
    expect(stored?.notes).toBe('edited while archiving');
    expect(stored?.archivedAt).toBeInstanceOf(Date);
    expect(updated?.archivedAt).toBeInstanceOf(Date);
  });

  it('ignores identity, lifecycle and bookkeeping fields in a patch', async () => {
    const prospect = await newProspect('Immutable Fields');
    await updateProspect(connection!, prospect.prospectId, {
      notes: 'kept',
      prospectId: '00000000-0000-4000-8000-000000000000',
      status: 'won',
      createdAt: new Date('2000-01-01'),
      directoryRef: { source: 'forged', sourceId: 'forged' },
    } as never);

    const stored = await getProspectHub(connection!, prospect.prospectId);
    expect(stored?.notes).toBe('kept');
    expect(stored?.status).toBe(prospect.status);
    expect(stored?.createdAt.getTime()).toBe(prospect.createdAt.getTime());
    expect(stored?.directoryRef).toBeUndefined();
  });

  it('removes a field the patch clears and leaves the others alone', async () => {
    const prospect = await newProspect('Clear Field');
    await updateProspect(connection!, prospect.prospectId, { notes: 'x', phone: '0102030405' });
    await updateProspect(connection!, prospect.prospectId, { notes: undefined });

    const stored = await getProspectHub(connection!, prospect.prospectId);
    expect(stored).not.toHaveProperty('notes');
    expect(stored?.phone).toBe('0102030405');
  });

  it('records a lifecycle event lost to a failed write when the operator retries', async () => {
    const prospect = await newProspect('Lost Archive Event');
    const Events = createProspectEventModel(connection!);
    const originalCreate = Events.create;
    Events.create = (async () => {
      throw new Error('event write failed');
    }) as never;
    try {
      await expect(archiveProspect(connection!, prospect.prospectId)).rejects.toThrow(
        'event write failed',
      );
    } finally {
      Events.create = originalCreate;
    }

    const retry = await archiveProspect(connection!, prospect.prospectId);
    expect(retry?.changed).toBe(false);
    const again = await archiveProspect(connection!, prospect.prospectId);
    expect(again?.changed).toBe(false);
    const types = (await listProspectEvents(connection!, prospect.prospectId)).map((e) => e.type);
    expect(types.filter((type) => type === 'prospect-archived')).toHaveLength(1);

    Events.create = (async () => {
      throw new Error('event write failed');
    }) as never;
    try {
      await expect(restoreProspect(connection!, prospect.prospectId)).rejects.toThrow();
    } finally {
      Events.create = originalCreate;
    }
    await restoreProspect(connection!, prospect.prospectId);
    await restoreProspect(connection!, prospect.prospectId);
    const after = (await listProspectEvents(connection!, prospect.prospectId)).map((e) => e.type);
    expect(after.filter((type) => type === 'prospect-restored')).toHaveLength(1);
    expect(after[0]).toBe('prospect-restored');
  });

  it('records no lifecycle event when restoring a prospect that was never archived', async () => {
    const prospect = await newProspect('Never Archived');
    await restoreProspect(connection!, prospect.prospectId);
    const types = (await listProspectEvents(connection!, prospect.prospectId)).map((e) => e.type);
    expect(types).not.toContain('prospect-restored');
  });
});
