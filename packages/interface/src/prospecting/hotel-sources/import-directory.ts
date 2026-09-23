import type { Connection } from 'mongoose';
import { isOutsideEuTerritory } from '@odysseus/core';
import { upsertDirectoryEntries } from '@odysseus/store';
import { directoryEntryFromHotelSource } from './directory-entry.js';
import type { HotelCatalogueSource } from './hotel-catalogue-source.js';

export interface DirectoryImportReport {
  source: string;
  sourceVersion: string;
  rowsRead: number;
  written: number;
  skipped: number;
  /** Rows left out because the hotel is in a French territory outside the
   *  EU, which Odysseus does not audit (see core's eu-territory.ts). */
  outsideEu: number;
}

export async function importDirectory(
  connection: Connection,
  source: HotelCatalogueSource,
): Promise<DirectoryImportReport> {
  const entries = [];
  let outsideEu = 0;
  for await (const emission of source.read()) {
    const entry = directoryEntryFromHotelSource(emission.record);
    if (isOutsideEuTerritory({ postcode: entry.postcode, url: entry.websiteUrl })) {
      outsideEu += 1;
      continue;
    }
    entries.push(entry);
  }
  const result = await upsertDirectoryEntries(connection, entries);
  return {
    source: source.name,
    sourceVersion: source.fingerprint(),
    rowsRead: source.counters().rowsRead,
    written: result.created + result.updated,
    skipped: source.counters().rowsRead - source.counters().accepted + outsideEu,
    outsideEu,
  };
}
