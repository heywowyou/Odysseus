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
  /** The official star rating, 1 to 5. */
  starRating?: number;
  /** The catalogue's commune, as published (upper case, and a Paris, Lyon or
   *  Marseille entry carries its arrondissement). */
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

/** Issue #559: the writing pass may name the property type and the city in
 *  its executive summary, which the digit guard keeps free of any digit, so
 *  the rating is written in words and the arrondissement is dropped. */
const STAR_WORDS: Readonly<Record<number, string>> = {
  1: 'une étoile',
  2: 'deux étoiles',
  3: 'trois étoiles',
  4: 'quatre étoiles',
  5: 'cinq étoiles',
};

/** Particles French place names keep in lower case after the first word. */
const PLACE_NAME_PARTICLES = new Set([
  'à',
  'au',
  'aux',
  'd',
  'de',
  'des',
  'du',
  'en',
  'et',
  'l',
  'la',
  'le',
  'les',
  'lès',
  'sous',
  'sur',
]);

/** « PARIS 10E ARRONDISSEMENT » reads « Paris », « SAINT-JEAN-DE-LUZ »
 *  reads « Saint-Jean-de-Luz ». A name that still holds a digit is left
 *  unknown rather than shown. */
function formatCommune(commune: string): string | undefined {
  const withoutDistrict = commune
    .replace(/\s+\d+\s*(?:E|ER|ÈME|EME)\s+ARRONDISSEMENT\s*$/iu, '')
    .trim();
  if (withoutDistrict === '' || /\d/u.test(withoutDistrict)) return undefined;
  let index = 0;
  return withoutDistrict.toLocaleLowerCase('fr-FR').replace(/\p{L}+/gu, (word) => {
    const first = index === 0;
    index += 1;
    if (!first && PLACE_NAME_PARTICLES.has(word)) return word;
    return word.charAt(0).toLocaleUpperCase('fr-FR') + word.slice(1);
  });
}

/**
 * Resolves only facts the catalogue actually contains. `propertyType` keeps
 * the source typology and appends the official rating in words when present;
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
    const stars = candidate.starRating === undefined ? undefined : STAR_WORDS[candidate.starRating];
    siteContext.propertyType =
      stars === undefined
        ? candidate.accommodationType
        : `${candidate.accommodationType} (${stars})`;
    siteContext.sector = 'hospitality';
  }

  const city = candidate.commune === undefined ? undefined : formatCommune(candidate.commune);
  if (city === undefined) {
    unknownReasons.city = 'missing-commune';
  } else {
    siteContext.city = city;
  }

  return { siteContext, unknownReasons };
}
