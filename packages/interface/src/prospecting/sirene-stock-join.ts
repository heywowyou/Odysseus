/**
 * Thin adapter: a SireneIndexEntry (or a miss) into the Provenanced<...>
 * fields run-prospect-ingestion-job.ts needs for a prospects document.
 * Deliberately produces no `turnover` field at all - the prospects schema
 * has no turnover field (see assessObligations.ts's milestone 9a doc
 * comment), so the "never lie about a resolved turnover" concern is
 * satisfied by construction here; it would only become live if a future
 * milestone built an actual OperatorProfile from this same stock data.
 */

import type { EffectifBand, Provenanced, SireneIndexEntry } from '@odysseus/core';

export interface SireneStockJoinResult {
  denomination: Provenanced<string>;
  naf: Provenanced<string>;
  trancheEffectifs: Provenanced<EffectifBand | null>;
  etatAdministratif: Provenanced<string>;
}

export function joinSireneStockEntry(entry: SireneIndexEntry | null, stockVersion: string): SireneStockJoinResult {
  const retrievedAt = new Date();
  const source = `sirene-stock:${stockVersion}`;

  if (!entry) {
    return {
      denomination: { value: '', source, retrievedAt },
      naf: { value: '', source, retrievedAt },
      trancheEffectifs: { value: null, source, retrievedAt },
      etatAdministratif: { value: '', source, retrievedAt },
    };
  }

  return {
    denomination: { value: entry.denomination, source, retrievedAt },
    naf: { value: entry.naf, source, retrievedAt },
    trancheEffectifs: { value: entry.effectifBand, source, retrievedAt },
    etatAdministratif: { value: entry.etatAdministratif, source, retrievedAt },
  };
}
