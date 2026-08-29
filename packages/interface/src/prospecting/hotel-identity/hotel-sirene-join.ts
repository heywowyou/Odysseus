/**
 * Joins a hotel candidate to INSEE company facts, when there is an identifier
 * to join on.
 *
 * Thin on purpose. It reuses the shipped `getOrBuildSireneStockIndex` and
 * `joinSireneStockEntry` rather than opening a second path into the stock file:
 * that index already applies the NAF allowlist, the effectifs threshold, and
 * the active-establishment filter, and a parallel implementation would drift
 * from those rules silently.
 *
 * **Called from the qualification pass, not from identity resolution.** The
 * Atout France export carries no SIRET and no SIREN column (measured, see
 * advisor-plans/README.md); the identifier comes from the hotel's own
 * published identification, which the qualification site probe reads. Asking
 * before that page has been fetched can only ever answer `no-identifier`,
 * which is what happened for the whole of v1 and v2 and is why the effectif
 * rule never fired for a single hotel.
 *
 * `no-identifier` remains a first-class status rather than a flavour of "not
 * found". "We never had anything to look with" and "we looked and this company
 * is not in the qualifying set" are different facts, and only the second is a
 * disqualification. Collapsing them would hide why a population is small.
 *
 * `stock-file-unavailable` is a third such fact and the loudest one: it means
 * the operator has not placed the INSEE stock file, so nobody has been asked
 * about anything. Treating it as a miss would report every hotel as failing a
 * check that was never run.
 */

import { existsSync } from 'node:fs';
import type { HotelSireneJoin } from '@odysseus/core';
import { getOrBuildSireneStockIndex, type SireneStockIndexHandle } from '../sirene-stock-index.js';
import { joinSireneStockEntry } from '../sirene-stock-join.js';

export interface HotelSireneJoiner {
  join(siren: string | undefined): HotelSireneJoin;
  /** Fingerprint of the stock file behind this joiner, or null when there is
   *  no stock file and every join reports `stock-file-unavailable`. */
  stockVersion: string | null;
}

/** Returns a joiner that reports `stock-file-unavailable` for every candidate
 *  when the operator has not downloaded the stock file, rather than throwing.
 *  A missing optional input must not fail a resolve run whose primary output
 *  does not depend on it. */
export async function createHotelSireneJoiner(
  stockFilePath: string,
  cacheFilePath: string,
): Promise<HotelSireneJoiner> {
  if (!existsSync(stockFilePath)) {
    return {
      stockVersion: null,
      join: (): HotelSireneJoin => ({
        status: 'stock-file-unavailable',
        checkedAt: new Date(),
      }),
    };
  }

  const index: SireneStockIndexHandle = await getOrBuildSireneStockIndex(
    stockFilePath,
    cacheFilePath,
  );

  return {
    stockVersion: index.version,
    join: (siren): HotelSireneJoin => {
      const checkedAt = new Date();
      if (siren === undefined || siren === '') {
        return { status: 'no-identifier', stockVersion: index.version, checkedAt };
      }
      const entry = index.lookup(siren);
      if (entry === null) {
        return {
          status: 'siren-not-in-qualifying-sirene-set',
          stockVersion: index.version,
          checkedAt,
        };
      }
      const joined = joinSireneStockEntry(entry, index.version);
      return {
        status: 'matched',
        stockVersion: index.version,
        denomination: joined.denomination.value,
        naf: joined.naf.value,
        ...(joined.trancheEffectifs.value !== null
          ? { effectifBandCode: joined.trancheEffectifs.value.code }
          : {}),
        etatAdministratif: joined.etatAdministratif.value,
        checkedAt,
      };
    },
  };
}
