/**
 * Read/write helpers around the `suppression` collection. Both the write
 * path and the read path go through @odysseus/core's
 * normalizeDomainForHash/normalizeAddressForHash/hashSuppressionValue, so
 * this file never invents its own normalization and the two can never
 * disagree about what counts as "the same" domain or address.
 */

import { randomUUID } from 'node:crypto';
import type { Connection } from 'mongoose';
import {
  hashSuppressionValue,
  normalizeAddressForHash,
  normalizeDomainForHash,
  type SuppressionReasonCode,
} from '@odysseus/core';
import { createSuppressionModel } from './schemas/suppression.schema.js';

export interface AddSuppressionEntryInput {
  domain: string;
  address?: string;
  reasonCode: SuppressionReasonCode;
  reason: string;
}

/**
 * Idempotent: an upsert keyed on the same (domainHash, addressHash,
 * reasonCode) the schema's partial unique indexes enforce, so a retried
 * objection or bounce-confirm writes nothing a second time rather than
 * accumulating duplicate rows for the same cause.
 */
export async function addSuppressionEntry(
  connection: Connection,
  input: AddSuppressionEntryInput,
): Promise<void> {
  const SuppressionModel = createSuppressionModel(connection);
  const domainHash = hashSuppressionValue(normalizeDomainForHash(input.domain));
  const addressHash =
    input.address !== undefined
      ? hashSuppressionValue(normalizeAddressForHash(input.address))
      : undefined;
  const filter: Record<string, unknown> = { domainHash, reasonCode: input.reasonCode };
  if (addressHash !== undefined) filter['addressHash'] = addressHash;
  else filter['addressHash'] = { $exists: false };

  await SuppressionModel.updateOne(
    filter,
    {
      $setOnInsert: {
        suppressionId: randomUUID(),
        domainHash,
        ...(addressHash !== undefined ? { addressHash } : {}),
        reasonCode: input.reasonCode,
        reason: input.reason,
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );
}

export async function isSuppressed(
  connection: Connection,
  domain: string,
  address?: string,
): Promise<boolean> {
  const SuppressionModel = createSuppressionModel(connection);
  const domainHash = hashSuppressionValue(normalizeDomainForHash(domain));
  const addressHash =
    address !== undefined ? hashSuppressionValue(normalizeAddressForHash(address)) : undefined;

  const query =
    addressHash !== undefined ? { $or: [{ domainHash }, { addressHash }] } : { domainHash };

  const match = await SuppressionModel.findOne(query).lean();
  return match !== null;
}

/**
 * Which of these domains are suppressed, in one query.
 *
 * A per-domain `isSuppressed` call is right when a single draft is about to be
 * created and the check must be as late as possible. Selecting a cohort asks
 * the same question of a whole population at once, and doing that one domain at
 * a time is thousands of round trips for a set the collection can answer in
 * one. Hashing still happens here, through the same core helpers, so the two
 * paths cannot disagree about what "the same domain" means.
 */
export async function findSuppressedDomains(
  connection: Connection,
  domains: readonly string[],
): Promise<Set<string>> {
  if (domains.length === 0) return new Set();
  const SuppressionModel = createSuppressionModel(connection);
  const byHash = new Map<string, string>();
  for (const domain of domains) {
    byHash.set(hashSuppressionValue(normalizeDomainForHash(domain)), domain);
  }
  const rows = await SuppressionModel.find({ domainHash: { $in: [...byHash.keys()] } })
    .select({ domainHash: 1 })
    .lean<{ domainHash: string }[]>();
  const suppressed = new Set<string>();
  for (const row of rows) {
    const domain = byHash.get(row.domainHash);
    if (domain !== undefined) suppressed.add(domain);
  }
  return suppressed;
}
