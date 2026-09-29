import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  addSuppressionEntry,
  createProspectHub,
  findOutreachThreadByProspect,
  getProspectHub,
  isSuppressed,
  listOutreachPreviews,
  listProspectEvents,
  openOutreachThread,
  recordOutreachPreview,
} from '@odysseus/store';
import { probeMongoAvailability, scopedMongoTestUri } from '@odysseus/store/test-support.js';
import { createInMemoryPreviewPublisher } from '../outreach/in-memory-preview-publisher.js';
import {
  archiveProspectAction,
  optOutProspect,
  recordProspectOutcomeAction,
  setProspectStatusAction,
} from './prospect-lifecycle.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability(
  scopedMongoTestUri('prospect_lifecycle'),
);

afterAll(async () => {
  if (connection) {
    await connection.dropDatabase();
    await connection.close();
  }
});

/** A prospect on its own domain with a live preview and an open thread, plus
 *  a second prospect on the same domain with its own live preview and thread,
 *  as a hotel listed twice in the catalogue would be. */
async function prospectsOnOneDomain() {
  const domain = `${randomUUID().slice(0, 8)}.fr`;
  const website = {
    url: `https://${domain}/`,
    registrableDomain: domain,
    kind: 'own' as const,
    primary: true,
  };
  const publisher = createInMemoryPreviewPublisher();
  const ids: string[] = [];
  for (const name of ['Hôtel du Port', 'Hôtel du Port (doublon)']) {
    const prospect = await createProspectHub(connection!, {
      sector: 'hotel',
      name,
      websites: [website],
      emails: [{ address: `contact@${domain}`, origin: 'atout-france' }],
    });
    const tokenHash = randomUUID().replaceAll('-', '').padEnd(64, '0');
    const objectKey = `previews/${tokenHash}.html`;
    await publisher.put({ objectKey, html: '<p>x</p>', publicExpiresAt: new Date('2099-01-01') });
    const preview = await recordOutreachPreview(connection!, {
      prospectId: prospect.prospectId,
      tokenHash,
      objectKey,
      previewUrl: `https://odysseusaudit.com/apercu/${tokenHash}`,
      domain,
      language: 'fr',
      previewContentVersion: 'test',
      publishedAt: new Date(),
      sourceKind: 'full-audit',
      auditId: `audit-${prospect.prospectId}`,
    });
    await openOutreachThread(connection!, {
      prospectId: prospect.prospectId,
      previewId: preview.previewId,
      domain,
      roleAddress: `contact@${domain}`,
      language: 'fr',
      openedAt: new Date(),
      spacing: { touch2AfterDays: 4, touch3AfterDays: 7, replyWindowDays: 14 },
      campaignVersion: 'test-campaign',
    });
    ids.push(prospect.prospectId);
  }
  return { domain, publisher, prospectId: ids[0]!, siblingId: ids[1]! };
}

/** What an opt-out left behind, for comparing two entry points. */
async function effectsOf(prospectId: string, siblingId: string) {
  const prospect = await getProspectHub(connection!, prospectId);
  const events = await listProspectEvents(connection!, prospectId);
  const previews = [
    ...(await listOutreachPreviews(connection!, { prospectId })),
    ...(await listOutreachPreviews(connection!, { prospectId: siblingId })),
  ];
  return {
    status: prospect?.status,
    optedOutEvents: events.filter((event) => event.type === 'opted-out').length,
    previews: previews.map((preview) => preview.status),
    threads: [
      (await findOutreachThreadByProspect(connection!, prospectId))?.state,
      (await findOutreachThreadByProspect(connection!, siblingId))?.state,
    ],
  };
}

describe.skipIf(!mongoAvailable)('prospect lifecycle actions (issue #569)', () => {
  it('opts out the same way from the status selector, the outcome and the public form', async () => {
    const results = [];
    for (const entry of ['status', 'outcome', 'public'] as const) {
      const { domain, publisher, prospectId, siblingId } = await prospectsOnOneDomain();
      const adapters = { publisher: () => publisher, mailbox: null };
      if (entry === 'status') {
        await setProspectStatusAction(connection!, prospectId, 'opted-out', adapters);
      } else if (entry === 'outcome') {
        await recordProspectOutcomeAction(connection!, prospectId, 'opt-out', adapters);
      } else {
        await addSuppressionEntry(connection!, {
          domain,
          address: `contact@${domain}`,
          addressOnly: false,
          reasonCode: 'objection',
          reason: 'opt-out form on the public site',
        });
        await optOutProspect(connection!, prospectId, adapters, {
          actor: 'public-opt-out',
          suppression: 'already-applied',
        });
      }
      await expect(isSuppressed(connection!, domain)).resolves.toBe(true);
      expect(publisher.keys()).toEqual([]);
      results.push(await effectsOf(prospectId, siblingId));
    }
    expect(results[0]).toEqual({
      status: 'opted-out',
      optedOutEvents: 1,
      previews: ['revoked', 'revoked'],
      threads: ['opted-out', 'closed'],
    });
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
  });

  it('reports a failed withdrawal after saving the opt-out, and finishes on retry', async () => {
    const { publisher, prospectId, siblingId } = await prospectsOnOneDomain();
    const failing = {
      ...publisher,
      delete: vi.fn(async () => {
        throw new Error('bucket unavailable');
      }),
    };

    const first = await optOutProspect(
      connection!,
      prospectId,
      { publisher: () => failing, mailbox: null },
      { actor: 'operator' },
    );
    expect(first.kind).toBe('withdrawal-failed');
    expect((await getProspectHub(connection!, prospectId))?.status).toBe('opted-out');

    const retry = await optOutProspect(
      connection!,
      prospectId,
      { publisher: () => publisher, mailbox: null },
      { actor: 'operator' },
    );
    expect(retry).toMatchObject({ kind: 'opted-out', effects: { domainPreviewsRevoked: 1 } });
    expect((await effectsOf(prospectId, siblingId)).previews).toEqual(['revoked', 'revoked']);
  });

  it('refuses a reply outcome while nothing has been sent', async () => {
    const { publisher, prospectId } = await prospectsOnOneDomain();
    await expect(
      recordProspectOutcomeAction(connection!, prospectId, 'reply-positive', {
        publisher: () => publisher,
        mailbox: null,
      }),
    ).resolves.toEqual({ kind: 'refused', refusal: 'nothing-sent' });
    expect((await getProspectHub(connection!, prospectId))?.status).toBe('new');
  });

  it('refuses to archive while the probe reports work in flight', async () => {
    const { prospectId } = await prospectsOnOneDomain();
    const workInFlight = vi.fn(async () => true);

    await expect(
      archiveProspectAction(connection!, prospectId, {
        artifactsRoot: '/nonexistent',
        store: undefined,
        workInFlight,
      }),
    ).resolves.toEqual({ kind: 'refused', refusal: 'work-in-flight' });
    expect(workInFlight).toHaveBeenCalledWith(prospectId);
    expect((await getProspectHub(connection!, prospectId))?.archivedAt).toBeUndefined();
  });
});
