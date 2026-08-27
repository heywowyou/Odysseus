/**
 * Streams DATAtourisme's flat regional CSV exports, the supplementary hotel
 * source for milestone 9c. Comma delimited, UTF-8, nineteen regional files
 * read in sorted order so a resume checkpoint is deterministic.
 *
 * Supplementary means two specific things, both enforced here rather than by
 * convention downstream:
 *
 * - **This source never supplies the campaign rating.** DATAtourisme carries a
 *   contributor-supplied `Classements_du_POI`, but it is inconsistently
 *   populated and not the official register, so records from here always leave
 *   `starRating` absent. A DATAtourisme hotel becomes campaign-eligible only by
 *   being joined to its Atout France row, never on its own evidence.
 * - **No contact is promoted.** `Contacts_du_POI` mixes website, email, and
 *   telephone behind `#` and `|` separators. Only a website is read from it.
 *   An email found there is discarded: outreach addresses come from a separate
 *   allowlist-enforcing stage, and telephone prospecting is closed entirely.
 */

import { createReadStream, statSync } from 'node:fs';
import { parse } from 'csv-parse';
import type { HotelSourceIngestCounters, HotelSourceRecord } from '@odysseus/core';
import {
  emptyCounters,
  optionalText,
  type HotelCatalogueSource,
  type HotelSourceEmission,
} from './hotel-catalogue-source.js';

export const DATATOURISME_LICENCE = 'etalab-2.0';
/** The ontology URI that identifies a hotel inside the pipe-joined
 *  `Categories_de_POI` column. A POI carries its whole ontology ancestry, so a
 *  substring test against this exact URI is the filter; broader terms such as
 *  Accommodation would also match campsites and holiday resorts. */
export const DATATOURISME_HOTEL_TYPE_URI = 'https://www.datatourisme.fr/ontology/core#Hotel';

const COLUMN = {
  name: 'Nom_du_POI',
  categories: 'Categories_de_POI',
  address: 'Adresse_postale',
  postcodeAndCommune: 'Code_postal_et_commune',
  contacts: 'Contacts_du_POI',
  uri: 'URI_ID_du_POI',
} as const;

/** `Code_postal_et_commune` is written '20220#Algajola'. A row missing either
 *  half yields only the half it has, rather than a mangled composite. */
export function splitPostcodeAndCommune(raw: string | undefined): {
  postcode?: string;
  commune?: string;
} {
  const text = optionalText(raw);
  if (text === undefined) return {};
  const separatorIndex = text.indexOf('#');
  if (separatorIndex === -1) return { postcode: text };
  const postcode = optionalText(text.slice(0, separatorIndex));
  const commune = optionalText(text.slice(separatorIndex + 1));
  return {
    ...(postcode !== undefined ? { postcode } : {}),
    ...(commune !== undefined ? { commune } : {}),
  };
}

/** Reads only an http(s) entry out of the mixed contact column. Everything
 *  else, including any email, is deliberately dropped. */
export function extractDeclaredWebsite(raw: string | undefined): string | undefined {
  const text = optionalText(raw);
  if (text === undefined) return undefined;
  for (const part of text.split(/[|#]/u)) {
    const candidate = part.trim();
    if (/^https?:\/\/\S+$/iu.test(candidate)) return candidate;
  }
  return undefined;
}

function fingerprintFiles(filePaths: string[]): string {
  return filePaths
    .map((filePath) => {
      const stats = statSync(filePath);
      return `${filePath}:${stats.size}:${stats.mtimeMs}`;
    })
    .join('|');
}

export interface DatatourismeSourceOptions {
  /** Regional export files. Read in the order given after sorting, so a
   *  checkpoint naming a file and an offset resumes deterministically. */
  filePaths: string[];
  /** Skip files already fully read in a previous pass. */
  completedFilePaths?: string[];
  /** Offset within the first file still to be read. */
  startByteOffset?: number;
  headerColumns?: string[];
}

export function createDatatourismeSource(options: DatatourismeSourceOptions): HotelCatalogueSource {
  const counters = emptyCounters();
  const orderedPaths = [...options.filePaths].sort();
  const completed = new Set(options.completedFilePaths ?? []);
  const startByteOffset = options.startByteOffset ?? 0;

  async function* readOneFile(
    filePath: string,
    offset: number,
    version: string,
  ): AsyncGenerator<HotelSourceEmission> {
    const isResume = offset > 0;
    if (isResume && (options.headerColumns === undefined || options.headerColumns.length === 0)) {
      throw new Error(
        'odysseus: createDatatourismeSource requires headerColumns to resume from a non-zero byte offset',
      );
    }
    const retrievedAt = new Date(statSync(filePath).mtimeMs);
    const parser = parse({
      delimiter: ',',
      columns: isResume ? (options.headerColumns as string[]) : true,
      relax_column_count: true,
      skip_empty_lines: true,
      info: true,
    });
    createReadStream(filePath, { start: offset, encoding: 'utf-8' }).pipe(parser);

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
      const categories = record[COLUMN.categories] ?? '';
      if (!categories.split('|').includes(DATATOURISME_HOTEL_TYPE_URI)) {
        counters.skipped['not-a-hotel-typology'] += 1;
        continue;
      }
      const name = optionalText(record[COLUMN.name]);
      if (name === undefined) {
        counters.skipped['missing-establishment-name'] += 1;
        continue;
      }
      const sourceId = optionalText(record[COLUMN.uri]);
      if (sourceId === undefined) {
        counters.skipped['malformed-row'] += 1;
        continue;
      }

      const built: HotelSourceRecord = {
        source: 'datatourisme',
        sourceId,
        sourceVersion: version,
        retrievedAt,
        licence: DATATOURISME_LICENCE,
        name,
        accommodationType: DATATOURISME_HOTEL_TYPE_URI,
        // No starRating, ever: see this module's doc comment.
        warnings: [],
      };
      const address = optionalText(record[COLUMN.address]);
      if (address !== undefined) built.address = address;
      const { postcode, commune } = splitPostcodeAndCommune(record[COLUMN.postcodeAndCommune]);
      if (postcode !== undefined) built.postcode = postcode;
      if (commune !== undefined) built.commune = commune;
      const website = extractDeclaredWebsite(record[COLUMN.contacts]);
      if (website !== undefined) built.declaredWebsite = website;

      counters.accepted += 1;
      yield { record: built, filePath, byteOffset: offset + info.bytes };
    }
  }

  async function* read(): AsyncGenerator<HotelSourceEmission> {
    const version = fingerprintFiles(orderedPaths);
    let offsetForNextFile = startByteOffset;
    for (const filePath of orderedPaths) {
      if (completed.has(filePath)) continue;
      yield* readOneFile(filePath, offsetForNextFile, version);
      // Only the first file still in progress carries a resume offset; every
      // later file in this pass is read from its start.
      offsetForNextFile = 0;
    }
  }

  return {
    name: 'datatourisme',
    licence: DATATOURISME_LICENCE,
    fingerprint: () => fingerprintFiles(orderedPaths),
    read,
    counters: (): HotelSourceIngestCounters => ({
      ...counters,
      skipped: { ...counters.skipped },
    }),
  };
}
