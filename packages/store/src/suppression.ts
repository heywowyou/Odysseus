/**
 * Read/write helpers around the `suppression` collection. Both the write
 * path and the read path go through @odysseus/core's
 * normalizeDomainForHash/normalizeAddressForHash/hashSuppressionValue, so
 * this file never invents its own normalization and the two can never
 * disagree about what counts as "the same" domain or address.
 */

import { randomUUID } from 'node:crypto';
import type { Connection } from 'mongoose';
import { hashSuppressionValue, normalizeAddressForHash, normalizeDomainForHash } from '@odysseus/core';
import { createSuppressionModel } from './schemas/suppression.schema.js';

export interface AddSuppressionEntryInput {
  domain: string;
  address?: string;
  reason: string;
}

export async function addSuppressionEntry(connection: Connection, input: AddSuppressionEntryInput): Promise<void> {
  const SuppressionModel = createSuppressionModel(connection);
  const domainHash = hashSuppressionValue(normalizeDomainForHash(input.domain));
  const addressHash =
    input.address !== undefined ? hashSuppressionValue(normalizeAddressForHash(input.address)) : undefined;
  await SuppressionModel.create({
    suppressionId: randomUUID(),
    domainHash,
    ...(addressHash !== undefined ? { addressHash } : {}),
    reason: input.reason,
    createdAt: new Date(),
  });
}

export async function isSuppressed(connection: Connection, domain: string, address?: string): Promise<boolean> {
  const SuppressionModel = createSuppressionModel(connection);
  const domainHash = hashSuppressionValue(normalizeDomainForHash(domain));
  const addressHash = address !== undefined ? hashSuppressionValue(normalizeAddressForHash(address)) : undefined;

  const query =
    addressHash !== undefined ? { $or: [{ domainHash }, { addressHash }] } : { domainHash };

  const match = await SuppressionModel.findOne(query).lean();
  return match !== null;
}
