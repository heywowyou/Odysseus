/**
 * The one seam every hotel catalogue source is read through, so the CLI and
 * later the job pipeline never branch on which source they are ingesting.
 *
 * Two things differ enough between the sources that they are expressed here
 * rather than assumed by callers:
 *
 * - A source may span several files. Atout France publishes one export;
 *   DATAtourisme publishes nineteen regional files, and a resume checkpoint
 *   has to name the file as well as the offset.
 * - Counters are read from the source rather than returned by the generator,
 *   because a caller that stops early (a --limit) still needs the counts for
 *   the rows it did read, and a generator return value is only delivered to a
 *   consumer that runs the loop to completion.
 */

import type {
  HotelCatalogueSourceName,
  HotelSourceIngestCounters,
  HotelSourceRecord,
} from '@odysseus/core';

export interface HotelSourceEmission {
  record: HotelSourceRecord;
  /** File this record came from, absolute. Recorded per emission because one
   *  source can span several files. */
  filePath: string;
  /** Bytes consumed from `filePath` up to and including this record, suitable
   *  for a resume checkpoint. */
  byteOffset: number;
}

export interface HotelCatalogueSource {
  readonly name: HotelCatalogueSourceName;
  readonly licence: string;
  /** Fingerprint of the exact input this adapter will read. Changing inputs
   *  changes the fingerprint, which is what invalidates a resume checkpoint
   *  rather than resuming into a different file's byte offset. */
  fingerprint(): string;
  read(): AsyncGenerator<HotelSourceEmission>;
  /** Snapshot of what this source has counted so far. */
  counters(): HotelSourceIngestCounters;
}

export function emptyCounters(): HotelSourceIngestCounters {
  return {
    rowsRead: 0,
    accepted: 0,
    skipped: {
      'not-a-hotel-typology': 0,
      'missing-establishment-name': 0,
      'malformed-row': 0,
    },
  };
}

/** Atout France writes missing values as the literal string '-'. A '-' that
 *  reached a stored record would read as real data, so it is normalized to an
 *  absent field at the only point that knows it is a sentinel. */
export function optionalText(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '-') return undefined;
  return trimmed;
}

export function optionalCount(raw: string | undefined): number | undefined {
  const text = optionalText(raw);
  if (text === undefined) return undefined;
  const parsed = Number.parseInt(text.replace(/\s/gu, ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
