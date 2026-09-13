import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/store', () => ({
  deleteManualHotelContact: vi.fn(),
  getEffectiveHotelContact: vi.fn(),
  getHotelCandidate: vi.fn(),
  getHotelContact: vi.fn(),
  getManualHotelContact: vi.fn(),
  isSuppressed: vi.fn(),
  listOutreachAudits: vi.fn(),
  recordManualHotelContact: vi.fn(),
}));

import {
  deleteManualHotelContact,
  getEffectiveHotelContact,
  getHotelCandidate,
  getHotelContact,
  getManualHotelContact,
  isSuppressed,
  listOutreachAudits,
  recordManualHotelContact,
} from '@odysseus/store';
import { CURRENT_CONTACT_VERSION } from '../prospecting/hotel-contacts/discover-contacts.js';
import { Router } from '../router.js';
import { registerProspectContactRoutes } from './prospect-contact.js';

type Method = 'GET' | 'PUT' | 'DELETE';

function fakeReq(url: string, method: Method, body?: unknown): IncomingMessage {
  const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const req = Readable.from(payload) as unknown as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers =
    body === undefined ? {} : { 'content-type': 'application/json', 'content-length': '1' };
  return req;
}

function fakeRes(): ServerResponse & { statusCode: number; body: string | undefined } {
  const res = {
    statusCode: 200,
    body: undefined as string | undefined,
    setHeader: vi.fn(),
    end: vi.fn(function (this: { body: string | undefined }, chunk?: string) {
      this.body = chunk;
    }),
  };
  return res as never;
}

const connection = {} as never;

async function handle(method: Method, body?: unknown) {
  const router = new Router();
  registerProspectContactRoutes(router, connection);
  const res = fakeRes();
  await router.handle(fakeReq('/api/prospects/cand-1/contact', method, body), res);
  return {
    status: res.statusCode,
    json: res.body === undefined ? undefined : (JSON.parse(res.body) as Record<string, unknown>),
  };
}

const candidate = {
  candidateId: 'cand-1',
  ownRegistrableDomain: 'hotel-exemple.fr',
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getHotelCandidate).mockResolvedValue(candidate as never);
  vi.mocked(listOutreachAudits).mockResolvedValue([
    { auditId: 'audit-1', startedAt: new Date('2026-09-12T00:00:00.000Z'), jobType: null },
  ]);
  vi.mocked(getHotelContact).mockResolvedValue(null);
  vi.mocked(getManualHotelContact).mockResolvedValue(null);
  vi.mocked(getEffectiveHotelContact).mockResolvedValue(null);
  vi.mocked(isSuppressed).mockResolvedValue(false);
  vi.mocked(deleteManualHotelContact).mockResolvedValue(true);
  vi.mocked(recordManualHotelContact).mockImplementation(async (_connection, input) =>
    ({
      contactId: 'manual-id',
      contactVersion: 'manual-v1',
      candidateId: input.candidateId,
      domain: input.domain,
      state: 'found',
      reason: 'operator-entered',
      address: input.address,
      localPart: input.address.split('@')[0],
      addressOrigin: input.addressOrigin,
      ...(input.freeMailAttestedAt === undefined
        ? {}
        : { freeMailAttestedAt: input.freeMailAttestedAt }),
      mxStatus: 'unknown',
      validatedAt: input.validatedAt,
      expiresAt: new Date('2026-12-12T00:00:00.000Z'),
    }) as never,
  );
});

describe('prospect manual contact route', () => {
  it('requires an existing audit link before manual entry', async () => {
    vi.mocked(listOutreachAudits).mockResolvedValue([]);

    const result = await handle('PUT', {
      address: 'owner@example.net',
      origin: 'provided-directly',
    });

    expect(result).toMatchObject({ status: 409, json: { error: 'audit-link-required' } });
    expect(recordManualHotelContact).not.toHaveBeenCalled();
  });

  it('normalizes the address and stores no synthetic cohort when none exists', async () => {
    const result = await handle('PUT', {
      address: '  Owner@Example.NET  ',
      origin: 'provided-directly',
    });

    expect(result.status).toBe(200);
    expect(recordManualHotelContact).toHaveBeenCalledTimes(1);
    const input = vi.mocked(recordManualHotelContact).mock.calls[0]?.[1];
    expect(input).toMatchObject({
      candidateId: 'cand-1',
      domain: 'hotel-exemple.fr',
      address: 'owner@example.net',
      addressOrigin: 'provided-directly',
    });
    expect(input).not.toHaveProperty('cohortId');
  });

  it('checks the hotel domain, mailbox domain, and exact address for suppression', async () => {
    vi.mocked(isSuppressed).mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const result = await handle('PUT', {
      address: 'owner@example.net',
      origin: 'other-public-source',
    });

    expect(result).toMatchObject({ status: 409, json: { error: 'suppressed' } });
    expect(isSuppressed).toHaveBeenNthCalledWith(1, connection, 'hotel-exemple.fr');
    expect(isSuppressed).toHaveBeenNthCalledWith(2, connection, 'example.net', 'owner@example.net');
    expect(recordManualHotelContact).not.toHaveBeenCalled();
  });

  it('requires professional-use attestation for free-mail and stores it when attested', async () => {
    const refused = await handle('PUT', {
      address: 'hotel.owner@gmail.com',
      origin: 'provided-directly',
    });
    expect(refused).toMatchObject({
      status: 409,
      json: { error: 'free-mail-needs-attestation' },
    });
    expect(recordManualHotelContact).not.toHaveBeenCalled();

    const accepted = await handle('PUT', {
      address: 'hotel.owner@gmail.com',
      origin: 'provided-directly',
      freeMailProfessionalUseAttested: true,
    });
    expect(accepted.status).toBe(200);
    const input = vi.mocked(recordManualHotelContact).mock.calls[0]?.[1];
    expect(input?.freeMailAttestedAt).toBeInstanceOf(Date);
  });

  it('rejects invalid addresses and unsupported manual origins', async () => {
    await expect(
      handle('PUT', { address: 'not-an-email', origin: 'provided-directly' }),
    ).resolves.toMatchObject({
      status: 400,
      json: { error: 'invalid-address' },
    });
    await expect(
      handle('PUT', { address: 'owner@example.net', origin: 'hotel-website' }),
    ).resolves.toMatchObject({ status: 400, json: { error: 'invalid-origin' } });
  });

  it('deletes only the override and resolves the exact requested discovered version again', async () => {
    const discovered = {
      contactVersion: CURRENT_CONTACT_VERSION,
      address: 'reception@hotel-exemple.fr',
      addressOrigin: 'hotel-website',
    };
    vi.mocked(getEffectiveHotelContact).mockResolvedValue(discovered as never);

    const result = await handle('DELETE');

    expect(result.status).toBe(200);
    expect(deleteManualHotelContact).toHaveBeenCalledWith(connection, 'cand-1');
    expect(getEffectiveHotelContact).toHaveBeenCalledWith(
      connection,
      CURRENT_CONTACT_VERSION,
      'cand-1',
    );
    expect(result.json).toMatchObject({
      contact: { address: 'reception@hotel-exemple.fr', manual: false },
    });
  });
});
