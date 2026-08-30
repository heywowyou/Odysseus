/**
 * Streams AFNIC Fichier A ("Noms de domaine en point fr"), per
 * docs/rules/prospect-qualification.md section 2: semicolon-separated,
 * ISO-8859-1 encoded. ISO-8859-1 maps 1:1 onto Node's built-in `latin1`
 * buffer encoding, so decoding needs no extra dependency beyond Node
 * core - only the Sirene stock file (UTF-8, see sirene-stock-index.ts)
 * needs a different encoding, easy to get backwards.
 *
 * The literal header row is not hardcoded (see AfnicRow's field names vs
 * the CSV's actual French column headers): a resumed read (startByteOffset
 * > 0) starts mid-file, past the header, and has nothing to auto-detect
 * columns from, so the header discovered on the very first read (offset 0)
 * is persisted (see @odysseus/store's ProspectIngestionCheckpoint) and
 * reused on every subsequent resumed call via the headerColumns param.
 *
 * Flag for implementation time: docs/rules/prospect-qualification.md section 2
 * gives AFNIC's columns semantically (domain name, registrar geo/name,
 * subdomain, titulaire type, titulaire country/department, IDN flag,
 * creation date, withdrawal date), not as verified literal header
 * strings. The field-name mapping below (titulaireType, withdrawalDate,
 * etc.) assumes csv-parse's columns:true auto-detects the real header on
 * the first read; confirm the discovered header names against a real
 * downloaded Fichier A sample the first time this runs against the real
 * file, since ROW_FIELD_MAP's keys must match them exactly.
 */

import { createReadStream } from 'node:fs';
import { parse } from 'csv-parse';
import type { AfnicRow } from '@odysseus/core';

/** Maps the AFNIC CSV's own header labels to AfnicRow's field names.
 *  Verify against a real downloaded Fichier A sample - see module doc
 *  comment. Any column not listed here is read but discarded. */
const HEADER_FIELD_MAP: Readonly<Record<string, keyof AfnicRow>> = {
  'Nom de domaine': 'domain',
  'Type du titulaire': 'titulaireType',
  'Pays titulaire': 'titulaireCountry',
  'Departement titulaire': 'titulaireDepartment',
  'Domaine IDN': 'idn',
  'Date de création': 'creationDate',
  'Date de retrait du WHOIS': 'withdrawalDate',
};

function toAfnicRow(record: Record<string, string>): AfnicRow | null {
  const mapped: Partial<AfnicRow> = {};
  for (const [header, value] of Object.entries(record)) {
    const field = HEADER_FIELD_MAP[header];
    if (!field) continue;
    if (field === 'idn') {
      mapped.idn = value === '1' || value.toLowerCase() === 'oui' || value.toLowerCase() === 'true';
    } else {
      (mapped as Record<string, string>)[field] = value;
    }
  }
  if (!mapped.domain) return null;
  return {
    domain: mapped.domain,
    titulaireType: mapped.titulaireType ?? '',
    idn: mapped.idn ?? false,
    ...(mapped.titulaireCountry ? { titulaireCountry: mapped.titulaireCountry } : {}),
    ...(mapped.titulaireDepartment ? { titulaireDepartment: mapped.titulaireDepartment } : {}),
    ...(mapped.creationDate ? { creationDate: mapped.creationDate } : {}),
    ...(mapped.withdrawalDate ? { withdrawalDate: mapped.withdrawalDate } : {}),
  };
}

/** The AFNIC-level filter, per docs/rules/prospect-qualification.md section 1
 *  and 2: drop domains with a populated withdrawal date (no longer
 *  exist), keep only ORG-type holders (personne physique holder data is
 *  restricted/excluded by design). */
function passesAfnicFilter(row: AfnicRow): boolean {
  if (row.withdrawalDate && row.withdrawalDate.trim() !== '') return false;
  return row.titulaireType.trim().toUpperCase() === 'ORG';
}

export interface AfnicStreamResult {
  candidates: AfnicRow[];
  rowsScanned: number;
  nextByteOffset: number;
  exhausted: boolean;
  /** The header row this read used - either freshly discovered (offset 0)
   *  or the one passed in via headerColumns. Callers must persist this
   *  into the checkpoint so a subsequent resumed read can reuse it. */
  headerColumns: string[];
}

export async function streamAfnicCandidates(
  filePath: string,
  startByteOffset: number,
  targetCandidateCount: number,
  headerColumns?: string[],
): Promise<AfnicStreamResult> {
  const isResume = startByteOffset > 0;
  if (isResume && (!headerColumns || headerColumns.length === 0)) {
    throw new Error(
      'odysseus: streamAfnicCandidates requires headerColumns to resume from a non-zero byte offset',
    );
  }

  return new Promise((resolve, reject) => {
    const candidates: AfnicRow[] = [];
    let rowsScanned = 0;
    let bytesConsumedAtStop = 0;
    let discoveredHeaderColumns: string[] = headerColumns ?? [];
    let settled = false;

    const readStream = createReadStream(filePath, { start: startByteOffset, encoding: 'latin1' });

    const columnsOption: string[] | true = isResume ? (headerColumns as string[]) : true;
    const parser = parse({
      delimiter: ';',
      // Explicit columns when resuming (no header on this read to
      // auto-detect from); auto-detect from the real header row on a
      // fresh, from-the-start read.
      columns: columnsOption,
      relax_column_count: true,
      skip_empty_lines: true,
      // Tracked via parser.info.bytes below, read at the exact record we
      // stop on - not the underlying fs stream's own 'data' events, which
      // deliver in filesystem-chunk-sized bursts (often the whole small
      // file in one event) well ahead of how far csv-parse has actually
      // been told to stop consuming, and so would report a nextByteOffset
      // far past the last row this call actually decided to keep.
      info: true,
    });

    function finish(exhausted: boolean): void {
      if (settled) return;
      settled = true;
      readStream.destroy();
      resolve({
        candidates,
        rowsScanned,
        nextByteOffset: startByteOffset + bytesConsumedAtStop,
        exhausted,
        headerColumns: discoveredHeaderColumns,
      });
    }

    parser.on('readable', () => {
      let entry: { info: { bytes: number }; record: Record<string, string> | string[] };
      while ((entry = parser.read()) !== null) {
        const { info, record } = entry;
        if (!isResume && discoveredHeaderColumns.length === 0 && !Array.isArray(record)) {
          discoveredHeaderColumns = Object.keys(record);
        }
        rowsScanned++;
        bytesConsumedAtStop = info.bytes;
        const row = Array.isArray(record) ? null : toAfnicRow(record);
        if (row && passesAfnicFilter(row)) {
          candidates.push(row);
        }
        if (candidates.length >= targetCandidateCount) {
          finish(false);
          return;
        }
      }
    });

    parser.on('end', () => finish(true));
    parser.on('error', (error) => {
      if (settled) return;
      settled = true;
      readStream.destroy();
      reject(error);
    });
    readStream.on('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });

    readStream.pipe(parser);
  });
}
