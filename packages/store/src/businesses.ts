/**
 * The durable business identity behind a hotel-campaign candidate (issue
 * #218). Reconciliation is deliberately narrow: it only ever matches on a
 * candidate's `ownRegistrableDomain`, the same safe-match signal
 * `linkAuditToHotelByDomain` (audits.ts) already trusts - set only when a
 * domain has exactly one holder in that resolution run (trade-off 33). A
 * candidate with no own-registrable-domain (ambiguous, shared, or
 * vendor-hosted) never creates or reconciles a business: an unsafe merge
 * rule would defeat the whole point of a durable identity.
 */

import { randomUUID } from 'node:crypto';
import type { Connection } from 'mongoose';
import type { Business, HotelCandidate } from '@odysseus/core';
import { createBusinessModel, type BusinessDocument } from './schemas/business.schema.js';
import { createHotelCandidateModel } from './schemas/hotel-candidate.schema.js';

export async function getBusiness(
  connection: Connection,
  businessId: string,
): Promise<BusinessDocument | null> {
  const Model = createBusinessModel(connection);
  return Model.findOne({ businessId }).lean<BusinessDocument>();
}

export async function getBusinessByDomain(
  connection: Connection,
  registrableDomain: string,
): Promise<BusinessDocument | null> {
  const Model = createBusinessModel(connection);
  return Model.findOne({
    identityKeys: { $elemMatch: { kind: 'own-registrable-domain', value: registrableDomain } },
  }).lean<BusinessDocument>();
}

/** The business a given candidate generation was last reconciled to, read
 *  directly off the candidate's own stamped `businessId` - no domain
 *  lookup needed once a generation has been viewed at least once. */
export async function getBusinessForCandidate(
  connection: Connection,
  candidateId: string,
): Promise<BusinessDocument | null> {
  const CandidateModel = createHotelCandidateModel(connection);
  const candidate = await CandidateModel.findOne({ candidateId }, { businessId: 1 }).lean<{
    businessId?: string;
  } | null>();
  if (!candidate?.businessId) return null;
  return getBusiness(connection, candidate.businessId);
}

/** Every audit whose `hotelLink` points at this durable business, so the
 *  hub can list an audit's history even once the campaign candidate
 *  generation that first linked it has expired. Kept here rather than in
 *  audits.ts so this file owns every read that keys off `businessId`.
 *  `outreach` (the immutable prospecting-provenance stamp) does not carry
 *  a `businessId` yet - stamping it is out of scope here; #216 extends
 *  this lookup once it does. */
export async function getAuditIdsForBusiness(
  connection: Connection,
  businessId: string,
): Promise<string[]> {
  // Imported lazily-by-name (not at module scope) to avoid a store-internal
  // circular import: audits.ts calls into this file, so this file borrows
  // only the plain Mongoose model constructor from audit.schema.ts, not
  // anything from audits.ts itself.
  const { createAuditModel } = await import('./schemas/audit.schema.js');
  const AuditModel = createAuditModel(connection);
  const rows = await AuditModel.find(
    { 'hotelLink.businessId': businessId },
    { _id: 0, auditId: 1 },
  ).lean<{ auditId: string }[]>();
  return rows.map((row) => row.auditId);
}

/**
 * The single reconciliation entry point. Resolves the durable business for
 * a candidate generation, creating one on first sight of a domain and
 * reconciling (not merging) a later generation of the same domain back onto
 * it. Returns null for a candidate with no safe own-registrable-domain
 * signal - callers must not fall back to a weaker match themselves.
 *
 * Idempotent and safe to call repeatedly on the same candidate: once
 * `businessId` is stamped, later calls reconcile again (picking up a
 * rename) but never create a second business for the same domain, and
 * never touch `identityKeys`/`candidateGenerations` beyond appending the
 * current generation if it is not already recorded.
 */
export async function resolveOrCreateBusinessForCandidate(
  connection: Connection,
  candidate: Pick<
    HotelCandidate,
    'candidateId' | 'resolutionVersion' | 'ownRegistrableDomain' | 'name'
  >,
): Promise<BusinessDocument | null> {
  if (candidate.ownRegistrableDomain === undefined) return null;
  const domain = candidate.ownRegistrableDomain;

  const BusinessModel = createBusinessModel(connection);
  const now = new Date();
  const generationRef = {
    candidateId: candidate.candidateId,
    resolutionVersion: candidate.resolutionVersion,
    linkedAt: now,
  };

  const existing = await getBusinessByDomain(connection, domain);
  let business: BusinessDocument;
  if (existing) {
    const alreadyLinked = existing.candidateGenerations.some(
      (generation) => generation.candidateId === candidate.candidateId,
    );
    const nameChanged = existing.displayName !== candidate.name;
    if (alreadyLinked && !nameChanged) {
      business = existing;
    } else {
      const updated = await BusinessModel.findOneAndUpdate(
        { businessId: existing.businessId },
        {
          $set: { updatedAt: now, ...(nameChanged ? { displayName: candidate.name } : {}) },
          ...(alreadyLinked ? {} : { $push: { candidateGenerations: generationRef } }),
        },
        { new: true },
      ).lean<BusinessDocument>();
      business = updated ?? existing;
    }
  } else {
    const created: Business = {
      businessId: randomUUID(),
      displayName: candidate.name,
      currentRegistrableDomain: domain,
      identityKeys: [{ kind: 'own-registrable-domain', value: domain, addedAt: now }],
      candidateGenerations: [generationRef],
      createdAt: now,
      updatedAt: now,
    };
    await BusinessModel.create(created);
    business = created;
  }

  const CandidateModel = createHotelCandidateModel(connection);
  await CandidateModel.updateOne(
    { candidateId: candidate.candidateId },
    { $set: { businessId: business.businessId } },
  );

  return business;
}
