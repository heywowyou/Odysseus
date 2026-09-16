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
import { createSuppressionModel, DOMAIN_ONLY_ADDRESS_KEY } from './schemas/suppression.schema.js';

export interface AddSuppressionEntryInput {
  domain: string;
  address?: string;
  reasonCode: SuppressionReasonCode;
  reason: string;
}

/**
 * Idempotent: an upsert keyed on the same (domainHash, addressKey,
 * reasonCode) the schema's unique index enforces, so a retried objection or
 * bounce-confirm writes nothing a second time rather than accumulating
 * duplicate rows for the same cause. The filter also matches a row written
 * before addressKey existed, which the index does not cover, so a retry
 * against such a row still writes nothing.
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
  const addressKey = addressHash ?? DOMAIN_ONLY_ADDRESS_KEY;
  const legacyShape =
    addressHash !== undefined ? { addressHash } : { addressHash: { $exists: false } };
  const filter = {
    domainHash,
    reasonCode: input.reasonCode,
    $or: [{ addressKey }, { addressKey: { $exists: false }, ...legacyShape }],
  };

  try {
    await SuppressionModel.updateOne(
      filter,
      {
        $setOnInsert: {
          suppressionId: randomUUID(),
          domainHash,
          ...(addressHash !== undefined ? { addressHash } : {}),
          addressKey,
          reasonCode: input.reasonCode,
          reason: input.reason,
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );
  } catch (error) {
    // Two concurrent retries can both miss the filter and race to insert; the
    // unique index lets exactly one land, and the loser's cause is recorded.
    if (!isDuplicateKeyError(error)) throw error;
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000
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

export interface SuppressionMatches {
  domains: Set<string>;
  addresses: Set<string>;
}

/**
 * Bulk counterpart used by the prospect-work loader. It intentionally returns
 * only membership sets: the suppression collection stores hashes, and neither
 * a list page nor a recommendation needs the reason or the row itself.
 */
export async function findSuppressionMatches(
  connection: Connection,
  domains: readonly string[],
  addresses: readonly string[],
): Promise<SuppressionMatches> {
  if (domains.length === 0 && addresses.length === 0) {
    return { domains: new Set(), addresses: new Set() };
  }
  const SuppressionModel = createSuppressionModel(connection);
  const domainByHash = new Map<string, string>();
  for (const domain of domains) {
    domainByHash.set(hashSuppressionValue(normalizeDomainForHash(domain)), domain);
  }
  const addressByHash = new Map<string, string>();
  for (const address of addresses) {
    addressByHash.set(hashSuppressionValue(normalizeAddressForHash(address)), address);
  }
  const clauses: Record<string, unknown>[] = [];
  if (domainByHash.size > 0) clauses.push({ domainHash: { $in: [...domainByHash.keys()] } });
  if (addressByHash.size > 0) clauses.push({ addressHash: { $in: [...addressByHash.keys()] } });
  const rows = await SuppressionModel.find({ $or: clauses })
    .select({ domainHash: 1, addressHash: 1 })
    .lean<{ domainHash: string; addressHash?: string }[]>();
  const matches: SuppressionMatches = { domains: new Set(), addresses: new Set() };
  for (const row of rows) {
    const domain = domainByHash.get(row.domainHash);
    if (domain !== undefined) matches.domains.add(domain);
    if (row.addressHash !== undefined) {
      const address = addressByHash.get(row.addressHash);
      if (address !== undefined) matches.addresses.add(address);
    }
  }
  return matches;
}
