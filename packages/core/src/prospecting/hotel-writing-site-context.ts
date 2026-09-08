/**
 * Deterministic business facts that the hotel catalogue may contribute to the
 * writing pass. This deliberately carries only non-financial establishment
 * facts. The LLM package owns how they are worded in a prompt.
 */

import type { LlmInput } from '../types/llm-output.js';
import type { HotelCandidate } from '../types/hotel-candidate.js';

export interface HotelCatalogueWritingSiteContext {
  propertyType?: string;
  roomCount?: number;
  city?: string;
  sector?: string;
}

/** The complete analysis context is persisted as generation provenance. */
export type AnalysisSiteContext = LlmInput['siteContext'] & HotelCatalogueWritingSiteContext;

export type HotelCatalogueWritingSiteContextFact = keyof HotelCatalogueWritingSiteContext;

export type HotelCatalogueWritingSiteContextUnknownReason =
  'candidate-not-found' | 'missing-accommodation-type' | 'missing-room-count' | 'missing-commune';

export interface HotelCatalogueWritingSiteContextResolution {
  siteContext: HotelCatalogueWritingSiteContext;
  /** Every absent fact has an explicit reason. A caller can distinguish an
   * absent candidate from a candidate whose one source field was blank. */
  unknownReasons: Partial<
    Record<HotelCatalogueWritingSiteContextFact, HotelCatalogueWritingSiteContextUnknownReason>
  >;
}

type HotelWritingContextCandidate = Pick<
  HotelCandidate,
  'accommodationType' | 'starRating' | 'roomCount' | 'commune'
>;

function missingAllFacts(
  reason: HotelCatalogueWritingSiteContextUnknownReason,
): HotelCatalogueWritingSiteContextResolution {
  return {
    siteContext: {},
    unknownReasons: {
      propertyType: reason,
      roomCount: reason,
      city: reason,
      sector: reason,
    },
  };
}

/**
 * Resolves only facts the catalogue actually contains. `propertyType` keeps
 * the source typology verbatim and appends the official rating when present;
 * sector is the deterministic classification of that same hotel typology.
 */
export function resolveHotelCatalogueWritingSiteContext(
  candidate: HotelWritingContextCandidate | undefined,
): HotelCatalogueWritingSiteContextResolution {
  if (candidate === undefined) return missingAllFacts('candidate-not-found');

  const siteContext: HotelCatalogueWritingSiteContext = {};
  const unknownReasons: HotelCatalogueWritingSiteContextResolution['unknownReasons'] = {};

  if (candidate.accommodationType === undefined) {
    unknownReasons.propertyType = 'missing-accommodation-type';
    unknownReasons.sector = 'missing-accommodation-type';
  } else {
    siteContext.propertyType =
      candidate.starRating === undefined
        ? candidate.accommodationType
        : `${candidate.accommodationType} (${candidate.starRating} étoiles)`;
    siteContext.sector = 'hospitality';
  }

  if (candidate.roomCount === undefined) {
    unknownReasons.roomCount = 'missing-room-count';
  } else {
    siteContext.roomCount = candidate.roomCount;
  }

  if (candidate.commune === undefined) {
    unknownReasons.city = 'missing-commune';
  } else {
    siteContext.city = candidate.commune;
  }

  return { siteContext, unknownReasons };
}
