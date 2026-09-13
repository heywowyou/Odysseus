import { isFreeMailDomain, type HotelContactAddressOrigin } from '@odysseus/core';
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
import type { Connection } from 'mongoose';
import { jsonBodyNotRead, readJsonBodyOrRespond, sendJson } from '../http-utils.js';
import type { Router } from '../router.js';
import { CURRENT_CONTACT_VERSION } from '../prospecting/hotel-contacts/discover-contacts.js';

const ORIGINS = new Set<HotelContactAddressOrigin>(['other-public-source', 'provided-directly']);

function normalizeEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  if (at <= 0 || at === normalized.length - 1) return null;
  if (normalized.indexOf('@') !== at || /\s/u.test(normalized)) return null;
  const localPart = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (localPart.length > 64 || normalized.length > 254) return null;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/iu.test(localPart)) return null;
  if (
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/iu.test(
      domain,
    )
  ) {
    return null;
  }
  return normalized;
}

function addressDomain(address: string): string {
  return address.slice(address.lastIndexOf('@') + 1);
}

async function isContactSuppressed(
  connection: Connection,
  hotelDomain: string,
  address: string,
): Promise<boolean> {
  if (await isSuppressed(connection, hotelDomain)) return true;
  return isSuppressed(connection, addressDomain(address), address);
}

function projectContact(contact: Awaited<ReturnType<typeof getEffectiveHotelContact>>): unknown {
  if (contact === null) return null;
  return {
    address: contact.address ?? null,
    origin: contact.addressOrigin ?? 'hotel-website',
    manual: contact.contactVersion === 'manual-v1',
    freeMailAttestedAt: contact.freeMailAttestedAt ?? null,
  };
}

export function registerProspectContactRoutes(router: Router, connection: Connection): void {
  router.get('/api/prospects/:candidateId/contact', async ({ res, params }) => {
    const candidateId = params['candidateId']!;
    const candidate = await getHotelCandidate(connection, candidateId);
    if (candidate === null) {
      sendJson(res, 404, { error: 'candidate-unknown' });
      return;
    }

    const linkedToAudit = (await listOutreachAudits(connection, candidateId)).length > 0;
    const discovered = await getHotelContact(connection, CURRENT_CONTACT_VERSION, candidateId);
    const manual = await getManualHotelContact(connection, candidateId);
    const effective = manual ?? discovered;

    sendJson(res, 200, {
      linkedToAudit,
      manual: projectContact(manual),
      discovered: projectContact(discovered),
      effective: projectContact(effective),
    });
  });

  router.put('/api/prospects/:candidateId/contact', async ({ req, res, params }) => {
    const body = await readJsonBodyOrRespond(req, res);
    if (body === jsonBodyNotRead) return;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      sendJson(res, 400, { error: 'invalid-address' });
      return;
    }

    const candidateId = params['candidateId']!;
    const candidate = await getHotelCandidate(connection, candidateId);
    if (candidate === null) {
      sendJson(res, 404, { error: 'candidate-unknown' });
      return;
    }
    if ((await listOutreachAudits(connection, candidateId)).length === 0) {
      sendJson(res, 409, { error: 'audit-link-required' });
      return;
    }

    const raw = body as Record<string, unknown>;
    if (typeof raw['address'] !== 'string') {
      sendJson(res, 400, { error: 'invalid-address' });
      return;
    }
    const address = normalizeEmail(raw['address']);
    if (address === null) {
      sendJson(res, 400, { error: 'invalid-address' });
      return;
    }
    const origin = raw['origin'];
    if (typeof origin !== 'string' || !ORIGINS.has(origin as HotelContactAddressOrigin)) {
      sendJson(res, 400, { error: 'invalid-origin' });
      return;
    }

    const hotelDomain = candidate.ownRegistrableDomain?.trim().toLowerCase();
    if (!hotelDomain) {
      sendJson(res, 409, { error: 'hotel-domain-missing' });
      return;
    }
    if (await isContactSuppressed(connection, hotelDomain, address)) {
      sendJson(res, 409, { error: 'suppressed' });
      return;
    }

    const mailDomain = addressDomain(address);
    const freeMail = isFreeMailDomain(mailDomain);
    const attested = raw['freeMailProfessionalUseAttested'] === true;
    if (freeMail && !attested) {
      sendJson(res, 409, { error: 'free-mail-needs-attestation' });
      return;
    }

    const discovered = await getHotelContact(connection, CURRENT_CONTACT_VERSION, candidateId);
    const now = new Date();
    const stored = await recordManualHotelContact(connection, {
      candidateId,
      domain: hotelDomain,
      address,
      addressOrigin: origin as HotelContactAddressOrigin,
      ...(discovered?.cohortId === undefined ? {} : { cohortId: discovered.cohortId }),
      ...(freeMail ? { freeMailAttestedAt: now } : {}),
      validatedAt: now,
    });

    sendJson(res, 200, { contact: projectContact(stored) });
  });

  router.delete('/api/prospects/:candidateId/contact', async ({ res, params }) => {
    const candidateId = params['candidateId']!;
    const candidate = await getHotelCandidate(connection, candidateId);
    if (candidate === null) {
      sendJson(res, 404, { error: 'candidate-unknown' });
      return;
    }

    await deleteManualHotelContact(connection, candidateId);
    const effective = await getEffectiveHotelContact(
      connection,
      CURRENT_CONTACT_VERSION,
      candidateId,
    );
    sendJson(res, 200, { contact: projectContact(effective) });
  });
}
