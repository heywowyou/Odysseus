/**
 * Deterministic business facts that the hotel catalogue may contribute to the
 * writing pass. This deliberately carries only non-financial establishment
 * facts. The LLM package owns how they are worded in a prompt.
 */

import type { LlmInput } from '../types/llm-output.js';

export interface HotelCatalogueWritingSiteContext {
  propertyType?: string;
  city?: string;
  sector?: string;
  // The room count is deliberately absent, removed 2026-09-10: the writing
  // pass is forbidden any digit in executiveSummary (the report template
  // owns every report figure), so a model-visible count is a guaranteed
  // retry hazard. Any digit the model never sees is a digit it never writes.
}

/** The complete analysis context is persisted as generation provenance. */
export type AnalysisSiteContext = LlmInput['siteContext'] & HotelCatalogueWritingSiteContext;

export type HotelCatalogueWritingSiteContextFact = keyof HotelCatalogueWritingSiteContext;

export type HotelCatalogueWritingSiteContextUnknownReason =
  'candidate-not-found' | 'missing-accommodation-type' | 'missing-commune';

export interface HotelCatalogueWritingSiteContextResolution {
  siteContext: HotelCatalogueWritingSiteContext;
  /** Every absent fact has an explicit reason. A caller can distinguish an
   * absent candidate from a candidate whose one source field was blank. */
  unknownReasons: Partial<
    Record<HotelCatalogueWritingSiteContextFact, HotelCatalogueWritingSiteContextUnknownReason>
  >;
}

type HotelWritingContextCandidate = {
  accommodationType?: string;
  starRating?: string;
  commune?: string;
};

function missingAllFacts(
  reason: HotelCatalogueWritingSiteContextUnknownReason,
): HotelCatalogueWritingSiteContextResolution {
  return {
    siteContext: {},
    unknownReasons: {
      propertyType: reason,
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

  if (candidate.commune === undefined) {
    unknownReasons.city = 'missing-commune';
  } else {
    siteContext.city = candidate.commune;
  }

  return { siteContext, unknownReasons };
}
