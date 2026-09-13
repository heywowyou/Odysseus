import type { Connection } from 'mongoose';
import {
  isFreeMailDomain,
  type HotelContactAddressOrigin,
} from '@odysseus/core';
import {
  deleteManualHotelContact,
  getEffectiveHotelContact,
  getHotelCandidate,
  getHotelContact,
  getManualHotelContact,
  isSuppressed,
  listOutreachAudits,
  recordManualHotelContact,
  type HotelContactDocument,
} from '@odysseus/store';
import { jsonBodyNotRead, readJsonBodyOrRespond, sendError, sendJson } from '../http-utils.js';
import { CURRENT_CONTACT_VERSION } from '../prospecting/hotel-contacts/discover-contacts.js';
import type { Router } from '../router.js';

const ORIGINS: readonly HotelContactAddressOrigin[] = [
  'hotel-website',
  'other-public-source',
  'provided-directly',
];

/** Conservative boundary validation, intentionally not mailbox verification.
 * No DNS or SMTP probe is part of a plan-045 operator override. */
const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

function isPlausibleCandidateId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200 &&
    !/[\x00-\x1f\x7f]/.test(value)
  );
}

function normalizedAddress(raw: unknown): { address: string; addressDomain: string } | null {
  if (typeof raw !== 'string') return null;
  const address = raw.trim().toLowerCase();
  if (address.length === 0 || address.length > 254 || !EMAIL_PATTERN.test(address)) return null;
  const at = address.lastIndexOf('@');
  if (at < 1 || at === address.length - 1) return null;
  return { address, addressDomain: address.slice(at + 1) };
}

function projectContact(contact: HotelContactDocument | null) {
  if (contact === null) return null;
  return {
    contactId: contact.contactId,
    contactVersion: contact.contactVersion,
    address: contact.address ?? null,
    addressOrigin:
      contact.addressOrigin ?? (contact.reason === 'operator-entered' ? null : 'hotel-website'),
    state: contact.state,
    reason: contact.reason,
    sourceKind: contact.source ?? null,
    freeMailAttestedAt: contact.freeMailAttestedAt ?? null,
    validatedAt: contact.validatedAt,
  };
}

interface ContactBody {
  address: string;
  origin: HotelContactAddressOrigin;
  freeMailAttested: boolean;
}

function parseContactBody(raw: unknown): ContactBody | null {
  if (raw === null || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const normalized = normalizedAddress(record['address']);
  const origin = record['origin'];
  if (normalized === null || typeof origin !== 'string' || !ORIGINS.includes(origin as HotelContactAddressOrigin)) {
    return null;
  }
  const freeMailAttested = record['freeMailAttested'] === true;
  return { address: normalized.address, origin: origin as HotelContactAddressOrigin, freeMailAttested };
}

async function contactState(connection: Connection, candidateId: string) {
  const [manual, discovered, audits] = await Promise.all([
    getManualHotelContact(connection, candidateId),
    getHotelContact(connection, CURRENT_CONTACT_VERSION, candidateId),
    listOutreachAudits(connection, candidateId),
  ]);
  const effective = manual ?? discovered;
  return {
    linkedToAudit: audits.length > 0,
    manual: projectContact(manual),
    discovered: projectContact(discovered),
    effective: projectContact(effective),
  };
}

/** The editable address is deliberately on a narrow private route rather than
 * added to the general operator projections, whose safety invariant excludes
 * address material. */
export function registerProspectContactRoutes(router: Router, connection: Connection): void {
  router.get('/api/prospects/:candidateId/contact', async ({ res, params }) => {
    const candidateId = params['candidateId']!;
    if (!isPlausibleCandidateId(candidateId)) {
      sendError(res, 400, 'candidateId must be a non-empty string without control characters');
      return;
    }
    const candidate = await getHotelCandidate(connection, candidateId);
    if (candidate === null) {
      sendError(res, 404, 'prospect not found');
      return;
    }
    sendJson(res, 200, await contactState(connection, candidateId));
  });

  router.put('/api/prospects/:candidateId/contact', async ({ req, res, params }) => {
    const candidateId = params['candidateId']!;
    if (!isPlausibleCandidateId(candidateId)) {
      sendError(res, 400, 'candidateId must be a non-empty string without control characters');
      return;
    }
    const candidate = await getHotelCandidate(connection, candidateId);
    if (candidate === null) {
      sendError(res, 404, 'prospect not found');
      return;
    }

    const body = await readJsonBodyOrRespond(req, res);
    if (body === jsonBodyNotRead) return;
    const parsed = parseContactBody(body);
    if (parsed === null) {
      sendJson(res, 200, { saved: false, refusal: 'invalid-address' });
      return;
    }

    const audits = await listOutreachAudits(connection, candidateId);
    if (audits.length === 0) {
      sendJson(res, 200, { saved: false, refusal: 'no-linked-audit' });
      return;
    }

    const hotelDomain = candidate.ownRegistrableDomain;
    if (hotelDomain === undefined || hotelDomain === '') {
      sendJson(res, 200, { saved: false, refusal: 'invalid-address' });
      return;
    }

    if (await isSuppressed(connection, hotelDomain, parsed.address)) {
      sendJson(res, 200, { saved: false, refusal: 'suppressed' });
      return;
    }

    const at = parsed.address.lastIndexOf('@');
    const addressDomain = parsed.address.slice(at + 1);
    const freeMail = isFreeMailDomain(addressDomain);
    if (freeMail && !parsed.freeMailAttested) {
      sendJson(res, 200, { saved: false, refusal: 'free-mail-needs-attestation' });
      return;
    }

    // Preserve a real cohort only when the exact discovered generation has
    // one. A manual-only contact is explicitly cohort-independent.
    const discovered = await getHotelContact(connection, CURRENT_CONTACT_VERSION, candidateId);
    const saved = await recordManualHotelContact(connection, {
      candidateId,
      domain: hotelDomain,
      address: parsed.address,
      addressOrigin: parsed.origin,
      ...(discovered?.cohortId === undefined ? {} : { cohortId: discovered.cohortId }),
      ...(freeMail ? { freeMailAttestedAt: new Date() } : {}),
    });

    sendJson(res, 200, { saved: true, contact: projectContact(saved) });
  });

  router.delete('/api/prospects/:candidateId/contact', async ({ res, params }) => {
    const candidateId = params['candidateId']!;
    if (!isPlausibleCandidateId(candidateId)) {
      sendError(res, 400, 'candidateId must be a non-empty string without control characters');
      return;
    }
    const candidate = await getHotelCandidate(connection, candidateId);
    if (candidate === null) {
      sendError(res, 404, 'prospect not found');
      return;
    }

    const removed = await deleteManualHotelContact(connection, candidateId);
    const effective = await getEffectiveHotelContact(
      connection,
      CURRENT_CONTACT_VERSION,
      candidateId,
    );
    sendJson(res, 200, { removed, effective: projectContact(effective) });
  });
}
