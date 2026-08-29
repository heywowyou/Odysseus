/**
 * Builds and caches a small SIREN -> SireneIndexEntry lookup from
 * INSEE's Sirene stock file (StockUniteLegale, data.gouv.fr, UTF-8 CSV,
 * confirmed via research - a different encoding than AFNIC's file, see
 * afnic-reader.ts). Confirmed field names (via research against INSEE's
 * own documentation, not guessed): siren, denominationUniteLegale,
 * activitePrincipaleUniteLegale, trancheEffectifsUniteLegale,
 * etatAdministratifUniteLegale.
 *
 * This is the answer to "join efficiently against a 30M+ row file
 * without loading it naively": the expensive full scan happens once per
 * stock-file version, applying the NAF-allowlist + effectifs-threshold +
 * active filter per row, caching only the (expected low-thousands to
 * tens-of-thousands, given only a handful of NAF codes are enabled -
 * two e-commerce codes from the first wave plus two hospitality codes
 * added 2026-08-22, see naf-sector-allowlist.json)
 * matching rows to disk as JSON Lines. Every subsequent call reads the
 * small cache instead, unless the stock file's own fingerprint (mtime +
 * size) has changed, in which case the cache is rebuilt.
 *
 * Documented trade-off: because the index applies all three filters
 * together, a failed lookup gets one undifferentiated reason
 * (see @odysseus/core's qualify-prospect.ts, 'siren-not-in-qualifying-
 * sirene-set') rather than "wrong NAF" vs "too few employees" vs
 * "inactive" vs "not in Sirene at all." Per-reason diagnostics would
 * require holding the entire stock file in memory or a second unindexed
 * scan per miss - both defeat this design at any real candidate volume.
 * An operator debugging one SIREN by hand can grep the raw stock file
 * directly.
 */

import { createReadStream, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createWriteStream } from 'node:fs';
import { parse } from 'csv-parse';
import { getEnabledNafCodes, meetsEffectifThreshold, type SireneIndexEntry } from '@odysseus/core';

/** INSEE's official French wording per tranche_effectif_salarie code -
 *  duplicated from sirene/sirene-client.ts's own private
 *  EFFECTIF_BAND_LABELS_FR rather than importing it (that map is not
 *  exported, and the two callers read the same fixed external
 *  nomenclature independently, the same way core's own
 *  effectif-threshold.ts and assessObligations.ts's
 *  SME_EXEMPT_EFFECTIF_CODES each hold their own slice of it). */
const EFFECTIF_BAND_LABELS_FR: Readonly<Record<string, string>> = {
  NN: 'Effectif non renseigné',
  '00': '0 salarié',
  '01': '1 à 2 salariés',
  '02': '3 à 5 salariés',
  '03': '6 à 9 salariés',
  '11': '10 à 19 salariés',
  '12': '20 à 49 salariés',
  '21': '50 à 99 salariés',
  '22': '100 à 199 salariés',
  '31': '200 à 249 salariés',
  '32': '250 à 499 salariés',
  '41': '500 à 999 salariés',
  '42': '1 000 à 1 999 salariés',
  '51': '2 000 à 4 999 salariés',
  '52': '5 000 à 9 999 salariés',
  '53': '10 000 salariés et plus',
};

/** INSEE's own wording for a headcount band code, or the code itself when the
 *  nomenclature has no entry for it. Exported because plan 009's outreach
 *  preview prints this label to a prospect: a *fourth* private copy of the map
 *  is one thing in an internal report and another in a document a hotel reads,
 *  and the label a preview shows must be the one the qualification pass
 *  recorded. */
export function effectifBandLabelFr(code: string): string {
  return EFFECTIF_BAND_LABELS_FR[code] ?? code;
}

export interface SireneStockIndexHandle {
  lookup(siren: string): SireneIndexEntry | null;
  version: string;
}

function fingerprint(filePath: string): string {
  const stats = statSync(filePath);
  return `${stats.size}:${stats.mtimeMs}`;
}

async function readCacheFingerprint(cacheFilePath: string): Promise<string | null> {
  try {
    const rl = createInterface({ input: createReadStream(cacheFilePath, { encoding: 'utf-8' }) });
    for await (const line of rl) {
      rl.close();
      const parsed = JSON.parse(line) as { fingerprint?: string };
      return parsed.fingerprint ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

async function loadCacheIntoMap(cacheFilePath: string): Promise<Map<string, SireneIndexEntry>> {
  const index = new Map<string, SireneIndexEntry>();
  const rl = createInterface({ input: createReadStream(cacheFilePath, { encoding: 'utf-8' }) });
  let first = true;
  for await (const line of rl) {
    if (first) {
      first = false;
      continue; // the fingerprint header line
    }
    if (!line.trim()) continue;
    const entry = JSON.parse(line) as SireneIndexEntry;
    index.set(entry.siren, entry);
  }
  return index;
}

async function buildCache(
  stockFilePath: string,
  cacheFilePath: string,
  stockFingerprint: string,
): Promise<void> {
  const enabledNafCodes = getEnabledNafCodes();
  const output = createWriteStream(cacheFilePath, { encoding: 'utf-8' });
  output.write(`${JSON.stringify({ fingerprint: stockFingerprint })}\n`);

  await new Promise<void>((resolve, reject) => {
    const readStream = createReadStream(stockFilePath, { encoding: 'utf-8' });
    const parser = parse({ columns: true, relax_column_count: true, skip_empty_lines: true });

    parser.on('readable', () => {
      let record: Record<string, string> | null;
      while ((record = parser.read()) !== null) {
        const siren = record['siren'];
        const naf = record['activitePrincipaleUniteLegale'];
        const effectifCode = record['trancheEffectifsUniteLegale'];
        const etat = record['etatAdministratifUniteLegale'];
        if (!siren || !naf || !etat) continue;
        if (etat !== 'A') continue;
        if (!enabledNafCodes.has(naf)) continue;
        if (!meetsEffectifThreshold(effectifCode)) continue;

        const code = effectifCode ?? 'NN';
        const entry: SireneIndexEntry = {
          siren,
          denomination: record['denominationUniteLegale'] ?? '',
          naf,
          effectifBand: { code, label: EFFECTIF_BAND_LABELS_FR[code] ?? code },
          etatAdministratif: etat,
        };
        output.write(`${JSON.stringify(entry)}\n`);
      }
    });

    parser.on('end', () => {
      output.end(() => resolve());
    });
    parser.on('error', reject);
    readStream.on('error', reject);
    readStream.pipe(parser);
  });
}

export async function getOrBuildSireneStockIndex(
  stockFilePath: string,
  cacheFilePath: string,
): Promise<SireneStockIndexHandle> {
  const stockFingerprint = fingerprint(stockFilePath);
  const cachedFingerprint = await readCacheFingerprint(cacheFilePath);

  if (cachedFingerprint !== stockFingerprint) {
    await buildCache(stockFilePath, cacheFilePath, stockFingerprint);
  }

  const index = await loadCacheIntoMap(cacheFilePath);

  return {
    lookup: (siren: string) => index.get(siren) ?? null,
    version: stockFingerprint,
  };
}
