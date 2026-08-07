/**
 * Upserts by SIREN, not inserted: contrast persist-analysis.ts's
 * insert-only rationale. A repeat lookup of the same SIREN across scans
 * should converge to the most recently retrieved profile, not accumulate
 * one document per lookup.
 */

import type { Connection } from 'mongoose';
import type { OperatorProfile } from '@odysseus/core';
import { createSireneCacheModel } from './schemas/sirene-cache.schema.js';

export async function upsertSireneCache(
  connection: Connection,
  siren: string,
  profile: OperatorProfile,
  retrievedAt: Date,
): Promise<void> {
  const SireneCacheModel = createSireneCacheModel(connection);
  await SireneCacheModel.findOneAndUpdate(
    { siren },
    { $set: { siren, profile, retrievedAt } },
    { upsert: true },
  );
}

export async function getCachedSireneProfile(
  connection: Connection,
  siren: string,
): Promise<OperatorProfile | undefined> {
  const SireneCacheModel = createSireneCacheModel(connection);
  const document = await SireneCacheModel.findOne({ siren });
  if (!document) return undefined;
  // .profile on a live Mongoose document is a subdocument instance, not a
  // plain object: its fields are exposed via getters, not own enumerable
  // properties, so a caller that spreads it (`{...profile.siren, ...}`,
  // exactly what packages/interface's obligation-stage.ts does when
  // tagging siren provenance) silently loses every field. .toObject()
  // converts the whole document to a plain, JSON-shaped OperatorProfile
  // before it ever leaves this function, so every caller gets the same
  // safe-to-spread shape a freshly fetched (non-cached) profile already
  // has. Confirmed with a live second lookup of the same SIREN, not
  // assumed: the crash this caused was silently swallowed by
  // runObligationStage's own catch block and only surfaced once
  // reproduced without it.
  return (document.toObject() as { profile: OperatorProfile }).profile;
}
