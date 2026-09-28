/**
 * Issue #559: the establishment facts the hotel catalogue holds for an
 * audit's prospect (type with its official rating, city, sector), resolved
 * once for every pipeline that writes a report. The room count stays out
 * (trade-off 63). An audit with no catalogue entry gets no facts, exactly
 * as before.
 */

import type { Connection } from 'mongoose';
import {
  resolveHotelCatalogueWritingSiteContext,
  type HotelCatalogueWritingSiteContext,
} from '@odysseus/core';
import { findDirectoryEntryForAudit } from '@odysseus/store';

/** The catalogue's sectors, as the establishment type a reader knows. */
const ACCOMMODATION_TYPE_BY_SECTOR: Readonly<Record<string, string>> = { hotel: 'Hôtel' };

/** The `catalogueContext` option of runAnalysisStage for an audit: empty
 *  when the catalogue holds no fact about it. */
export async function catalogueContextOption(
  connection: Connection,
  auditId: string,
): Promise<{ catalogueContext?: HotelCatalogueWritingSiteContext }> {
  const entry = await findDirectoryEntryForAudit(connection, auditId);
  if (entry === null) return {};
  const accommodationType = ACCOMMODATION_TYPE_BY_SECTOR[entry.sector];
  const { siteContext } = resolveHotelCatalogueWritingSiteContext({
    ...(accommodationType !== undefined ? { accommodationType } : {}),
    ...(entry.stars !== undefined ? { starRating: entry.stars } : {}),
    ...(entry.commune !== undefined ? { commune: entry.commune } : {}),
  });
  return Object.keys(siteContext).length > 0 ? { catalogueContext: siteContext } : {};
}
