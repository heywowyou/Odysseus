/**
 * Cache-first Sirene lookup: the same SIREN recurs across scans, so a
 * cache hit returns the previously retrieved profile with no network
 * call. Only a successful lookup is cached - an api-unreachable result
 * today should not poison tomorrow's retry of the same SIREN.
 */

import type { Connection } from 'mongoose';
import type { SireneLookupResult } from '@odysseus/core';
import { getCachedSireneProfile, upsertSireneCache } from '@odysseus/store';
import { fetchSireneProfile } from './sirene-client.js';

export async function lookupOperatorProfile(connection: Connection, siren: string): Promise<SireneLookupResult> {
  const cached = await getCachedSireneProfile(connection, siren);
  if (cached) return { status: 'found', profile: cached };

  const result = await fetchSireneProfile(siren);
  if (result.status === 'found') {
    await upsertSireneCache(connection, siren, result.profile, result.profile.siren.retrievedAt);
  }
  return result;
}
