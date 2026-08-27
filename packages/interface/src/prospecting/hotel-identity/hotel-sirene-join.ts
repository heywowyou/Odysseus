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
 * **This join matches almost nothing today, and that is expected rather than a
 * defect.** The Atout France export carries no SIRET and no SIREN column
 * (measured, see advisor-plans/README.md), so a candidate reaches this stage
 * with no identifier at all. The identifier arrives in plan 003, from the
 * hotel's own published identification via the shipped mentions-legales path.
 * The seam is built now so that plan is a drop-in rather than a refactor.
 *
 * Because of that, `no-identifier` is a first-class status rather than a
 * flavour of "not found". "We never had anything to look with" is fixable by
 * plan 003; "we looked and this company is not in the qualifying set" is a real
 * disqualification. Collapsing the two would make the first look like the
 * second and hide the entire reason the population is small.
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
