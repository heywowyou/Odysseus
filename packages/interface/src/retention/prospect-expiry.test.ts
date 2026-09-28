/**
 * Issue #538: the 90-day prospect expiry. The plan is pure; the run is
 * checked against real Mongo (Docker-gated like every store suite) with a
 * temporary artifacts root and no bucket.
 */

import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProspectExpiryRow } from '@odysseus/store';
import { addSuppressionEntry, createProspectHub, isSuppressed } from '@odysseus/store';
import { probeMongoAvailability, scopedMongoTestUri } from '@odysseus/store/test-support.js';
import type { PreviewPublisher } from '../outreach/preview-publisher.js';
import { planProspectExpiry, runProspectExpiry } from './prospect-expiry.js';

const NOW = new Date('2026-12-31T00:00:00Z');
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

function row(prospectId: string, days: number, status: ProspectExpiryRow['status'] = 'contacted') {
  return { prospectId, status, lastActivityAt: ago(days) };
}

describe('planProspectExpiry', () => {
  it('expires a non-client prospect inactive for more than 90 days and leaves a recent one', () => {
    const plan = planProspectExpiry([row('old', 91), row('recent', 89)], new Set(), NOW);
    expect(plan.expire.map((prospect) => prospect.prospectId)).toEqual(['old']);
    expect(plan.kept).toEqual([]);
  });

  it('keeps won, call and quoted prospects and a prospect with a delivered audit', () => {
    const plan = planProspectExpiry(
      [
        row('won', 200, 'won'),
        row('call', 200, 'call'),
        row('quoted', 200, 'quoted'),
        row('d', 200),
      ],
      new Set(['d']),
      NOW,
    );
    expect(plan.expire).toEqual([]);
    expect(plan.kept).toEqual([
      { prospectId: 'won', reason: 'client-status' },
      { prospectId: 'call', reason: 'client-status' },
      { prospectId: 'quoted', reason: 'client-status' },
      { prospectId: 'd', reason: 'delivered-audit' },
    ]);
  });

  it('expires lost and opted-out prospects like any other', () => {
    const plan = planProspectExpiry(
      [row('l', 120, 'lost'), row('o', 120, 'opted-out')],
      new Set(),
      NOW,
    );
    expect(plan.expire).toHaveLength(2);
  });
});

const { available, connection } = await probeMongoAvailability(
  scopedMongoTestUri('prospect_expiry'),
);

afterAll(async () => {
  if (!connection) return;
  await connection.dropDatabase();
  await connection.close();
});

let root: string;
beforeEach(async () => {
  if (!available) return;
  await connection!.dropDatabase();
  root = await fs.mkdtemp(path.join(tmpdir(), 'prospect-expiry-'));
});
afterEach(async () => {
  if (root !== undefined) await fs.rm(root, { recursive: true, force: true });
});

const publisher = (): PreviewPublisher => {
  throw new Error('no preview should need removing');
};

async function seedProspect(name: string, days: number, status?: string): Promise<string> {
  const domain = `${name}.example`;
  const prospect = await createProspectHub(connection!, {
    sector: 'hotel',
    name,
    websites: [
      { url: `https://${domain}/`, registrableDomain: domain, kind: 'own', primary: true },
    ],
    emails: [{ address: `owner@${domain}`, origin: 'operator' }],
  });
  const at = ago(days);
  await connection!
    .db!.collection('prospects')
    .updateOne(
      { prospectId: prospect.prospectId },
      { $set: { lastActivityAt: at, updatedAt: at, ...(status ? { status } : {}) } },
    );
  await connection!
    .db!.collection('prospect_events')
    .updateMany({ prospectId: prospect.prospectId }, { $set: { at } });
  return prospect.prospectId;
}

describe.skipIf(!available)('runProspectExpiry', () => {
  const run = (apply: boolean, allowLarge = false) =>
    runProspectExpiry({
      connection: connection!,
      artifactsRoot: root,
      store: undefined,
      publisher,
      mailbox: null,
      now: NOW,
      apply,
      allowLarge,
    });

  it('deletes an inactive prospect and keeps its suppression, a won one and a recent one', async () => {
    const expired = await seedProspect('expired-hotel', 100);
    const won = await seedProspect('won-hotel', 100, 'won');
    const recent = await seedProspect('recent-hotel', 10);
    await addSuppressionEntry(connection!, {
      domain: 'expired-hotel.example',
      address: 'owner@expired-hotel.example',
      reasonCode: 'objection',
      reason: 'test',
    });

    const dryRun = await run(false);
    expect(dryRun.plan.expire.map((prospect) => prospect.prospectId)).toEqual([expired]);
    expect(await connection!.db!.collection('prospects').countDocuments()).toBe(3);

    const applied = await run(true);

    expect(applied.deleted).toEqual([expired]);
    const remaining = await connection!
      .db!.collection('prospects')
      .find({}, { projection: { prospectId: 1 } })
      .toArray();
    expect(remaining.map((doc) => doc['prospectId']).sort()).toEqual([recent, won].sort());
    expect(
      await connection!.db!.collection('prospect_events').countDocuments({ prospectId: expired }),
    ).toBe(0);
    await expect(
      isSuppressed(connection!, 'expired-hotel.example', 'owner@expired-hotel.example'),
    ).resolves.toBe(true);
  });

  it('keeps a prospect whose audit was delivered', async () => {
    const prospectId = await seedProspect('delivered-hotel', 200);
    await connection!.db!.collection('audits').insertOne({
      auditId: 'delivered-audit',
      siteUrl: 'https://delivered-hotel.example/',
      kind: 'audit',
      startedAt: ago(200),
      finishedAt: ago(200),
      prospectId,
    });
    await connection!
      .db!.collection('reportApprovals')
      .insertOne({ approvalId: 'ap', auditId: 'delivered-audit', fr: { reportId: 'r1' } });

    const result = await run(true);

    expect(result.deleted).toEqual([]);
    expect(result.plan.kept).toEqual([{ prospectId, reason: 'delivered-audit' }]);
  });

  it('refuses a run above the cap unless the operator lifts it', async () => {
    for (let i = 0; i < 21; i += 1) await seedProspect(`backlog-${i}`, 100);

    const refused = await run(true);
    expect(refused.refusal).toEqual({ reason: 'cap', count: 21, cap: 20 });
    expect(await connection!.db!.collection('prospects').countDocuments()).toBe(21);

    const lifted = await run(true, true);
    expect(lifted.deleted).toHaveLength(21);
  });
});
