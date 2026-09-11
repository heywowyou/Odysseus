/**
 * Streams Atout France's classified-accommodation export, the base hotel
 * catalogue for milestone 9c. Semicolon delimited, **UTF-8** - contrast
 * ../afnic-reader.ts, which is ISO-8859-1; that file's own doc comment already
 * warns the two are easy to get backwards, and an accented commune name in the
 * fixtures is what fails a test rather than a national ingest if they are.
 *
 * The literal header row is recorded in advisor-plans/README.md, "Measured
 * source facts", and mapped explicitly below rather than read positionally:
 * the export is regenerated daily, and a column inserted upstream must break a
 * name lookup loudly instead of silently shifting every field one to the left.
 *
 * This source is authoritative for the official star rating, which is the only
 * reason it is the base catalogue rather than an enrichment. It publishes no
 * establishment id, so sourceId is derived deterministically from the fields
 * that identify an establishment - stable across daily regenerations as long
 * as those fields do not change, which is exactly the intended behaviour: an
 * establishment that moves or is renamed is legitimately a new observation.
 */

import { createHash } from 'node:crypto';
import { createReadStream, statSync } from 'node:fs';
import { parse } from 'csv-parse';
import {
  parseAtoutFranceClassement,
  type HotelSourceIngestCounters,
  type HotelSourceRecord,
} from '@odysseus/core';
import {
  emptyCounters,
  optionalCount,
  optionalText,
  type HotelCatalogueSource,
  type HotelSourceEmission,
} from './hotel-catalogue-source.js';

const ATOUT_FRANCE_LICENCE = 'fr-lo';
/** The one typology this campaign ingests. The export also carries campings,
 *  tourist residences, holiday villages, residential leisure parks, and
 *  collective hostels, none of which are in scope. */
const ATOUT_FRANCE_HOTEL_TYPOLOGY = 'HÔTEL DE TOURISME';

const COLUMN = {
  typology: 'TYPOLOGIE ÉTABLISSEMENT',
  classement: 'CLASSEMENT',
  name: 'NOM COMMERCIAL',
  address: 'ADRESSE',
  postcode: 'CODE POSTAL',
  commune: 'COMMUNE',
  website: 'SITE INTERNET',
  capacity: "CAPACITÉ D'ACCUEIL (PERSONNES)",
  rooms: 'NOMBRE DE CHAMBRES',
} as const;

/** Stable id from the fields that identify an establishment. Truncated to 16
 *  hex characters: collision risk is negligible at a catalogue of five figures
 *  and a full digest makes stored rows harder to read by eye. */
function deriveSourceId(record: Record<string, string>): string {
  const parts = [
    record[COLUMN.name] ?? '',
    record[COLUMN.address] ?? '',
    record[COLUMN.postcode] ?? '',
    record[COLUMN.commune] ?? '',
  ];
  return createHash('sha256').update(parts.join('|'), 'utf8').digest('hex').slice(0, 16);
}

function fingerprintFile(filePath: string): string {
  const stats = statSync(filePath);
  return `${stats.size}:${stats.mtimeMs}`;
}

export interface AtoutFranceSourceOptions {
  filePath: string;
  /** Resume point from a persisted checkpoint. The export is small enough to
   *  read in one pass, so this exists for retry symmetry with the regional
   *  DATAtourisme reader rather than out of necessity. */
  startByteOffset?: number;
  headerColumns?: string[];
}

export function createAtoutFranceSource(options: AtoutFranceSourceOptions): HotelCatalogueSource {
  const counters = emptyCounters();
  const startByteOffset = options.startByteOffset ?? 0;
  const isResume = startByteOffset > 0;

  if (isResume && (options.headerColumns === undefined || options.headerColumns.length === 0)) {
    throw new Error(
      'odysseus: createAtoutFranceSource requires headerColumns to resume from a non-zero byte offset',
    );
  }

  async function* read(): AsyncGenerator<HotelSourceEmission> {
    const version = fingerprintFile(options.filePath);
    const retrievedAt = new Date(statSync(options.filePath).mtimeMs);
    const parser = parse({
      delimiter: ';',
      // This export does not quote fields, and it does contain literal quote
      // characters inside them ('RN 6 - Lieu dit "Le Chaumois"', 'HÔTEL "LA
      // MAISON"'). Left at the default, csv-parse rejects the whole file on
      // the first such row. Verified against the real export: no field in it
      // begins with a quote, so nothing is being parsed as data that was
      // meant as a delimiter.
      quote: false,
      columns: isResume ? (options.headerColumns as string[]) : true,
      relax_column_count: true,
      skip_empty_lines: true,
      info: true,
    });
    const stream = createReadStream(options.filePath, {
      start: startByteOffset,
      encoding: 'utf-8',
    });
    stream.pipe(parser);

    for await (const entry of parser) {
      const { info, record } = entry as {
        info: { bytes: number };
        record: Record<string, string> | string[];
      };
      counters.rowsRead += 1;

      if (Array.isArray(record)) {
        counters.skipped['malformed-row'] += 1;
        continue;
      }
      if ((record[COLUMN.typology] ?? '').trim() !== ATOUT_FRANCE_HOTEL_TYPOLOGY) {
        counters.skipped['not-a-hotel-typology'] += 1;
        continue;
      }
      const name = optionalText(record[COLUMN.name]);
      if (name === undefined) {
        counters.skipped['missing-establishment-name'] += 1;
        continue;
      }

      const warnings: string[] = [];
      const rawClassement = record[COLUMN.classement] ?? '';
      const starRating = parseAtoutFranceClassement(rawClassement);
      if (starRating === null && optionalText(rawClassement) !== undefined) {
        // A value that is present but unreadable is the signature of a contract
        // drift. Park the row and say so, rather than rating it by guess.
        warnings.push('unreadable-classement');
      }

      const built: HotelSourceRecord = {
        source: 'atout-france',
        sourceId: deriveSourceId(record),
        sourceVersion: version,
        retrievedAt,
        licence: ATOUT_FRANCE_LICENCE,
        name,
        accommodationType: ATOUT_FRANCE_HOTEL_TYPOLOGY,
        warnings,
      };
      const address = optionalText(record[COLUMN.address]);
      if (address !== undefined) built.address = address;
      const postcode = optionalText(record[COLUMN.postcode]);
      if (postcode !== undefined) built.postcode = postcode;
      const commune = optionalText(record[COLUMN.commune]);
      if (commune !== undefined) built.commune = commune;
      const website = optionalText(record[COLUMN.website]);
      if (website !== undefined) built.declaredWebsite = website;
      if (starRating !== null) built.starRating = starRating;
      const rooms = optionalCount(record[COLUMN.rooms]);
      if (rooms !== undefined) built.roomCount = rooms;
      const capacity = optionalCount(record[COLUMN.capacity]);
      if (capacity !== undefined) built.capacity = capacity;

      counters.accepted += 1;
      yield {
        record: built,
        filePath: options.filePath,
        byteOffset: startByteOffset + info.bytes,
      };
    }
  }

  return {
    name: 'atout-france',
    licence: ATOUT_FRANCE_LICENCE,
    fingerprint: () => fingerprintFile(options.filePath),
    read,
    counters: (): HotelSourceIngestCounters => ({
      ...counters,
      skipped: { ...counters.skipped },
    }),
  };
}
