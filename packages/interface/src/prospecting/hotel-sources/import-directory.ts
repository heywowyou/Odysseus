import type { Connection } from 'mongoose';
import { upsertDirectoryEntries } from '@odysseus/store';
import { directoryEntryFromHotelSource } from './directory-entry.js';
import type { HotelCatalogueSource } from './hotel-catalogue-source.js';

export interface DirectoryImportReport {
  source: string;
  sourceVersion: string;
  rowsRead: number;
  written: number;
  skipped: number;
}

export async function importDirectory(
  connection: Connection,
  source: HotelCatalogueSource,
): Promise<DirectoryImportReport> {
  const entries = [];
  for await (const emission of source.read())
    entries.push(directoryEntryFromHotelSource(emission.record));
  const result = await upsertDirectoryEntries(connection, entries);
  return {
    source: source.name,
    sourceVersion: source.fingerprint(),
    rowsRead: source.counters().rowsRead,
    written: result.created + result.updated,
    skipped: source.counters().rowsRead - source.counters().accepted,
  };
}
