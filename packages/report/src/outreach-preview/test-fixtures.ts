/**
 * A valid preview input, and the pieces to build variants of it.
 *
 * Kept beside the renderer rather than in `src/test-fixtures.ts`: that file
 * builds paid-report inputs, and putting the two in one module is the first
 * step towards someone spreading one into the other.
 */

import {
  HOTEL_EVIDENCE_OBSERVATIONS,
  buildOutreachFactsBlock,
  type OutreachPreviewImage,
  type OutreachPreviewInput,
} from '@odysseus/core';

/** A one-pixel PNG. The renderer only ever base64s and embeds it, so a real
 *  screenshot would make the fixtures large without testing anything more. */
export const PREVIEW_TEST_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const PNG_BYTES = Buffer.from(PREVIEW_TEST_PNG_BASE64, 'base64').byteLength;

const OBSERVATIONS = Object.values(HOTEL_EVIDENCE_OBSERVATIONS);

export function previewTestImage(
  overrides: Partial<OutreachPreviewImage> = {},
): OutreachPreviewImage {
  return {
    kind: 'specific-failure',
    base64: PREVIEW_TEST_PNG_BASE64,
    byteSize: PNG_BYTES,
    width: 1,
    height: 1,
    altText: {
      fr: "Capture de la page d'accueil",
      en: 'Capture of the homepage',
    },
    ...overrides,
  };
}

export function previewTestInput(
  overrides: Partial<OutreachPreviewInput> = {},
): OutreachPreviewInput {
  return {
    language: 'fr',
    businessName: 'Hôtel Exemple',
    links: {
      offer: 'https://odysseusaudit.com/offre',
      privacy: 'https://odysseusaudit.com/confidentialite',
      optOut: 'https://odysseusaudit.com/desinscription',
    },
    dataOrigins: ['public-hotel-catalogue', 'public-website'],
    summaries: [0, 1, 2].map((index) => ({
      observation: OBSERVATIONS[index] as { fr: string; en: string },
      severity: 'serious' as const,
      wcagCriteria: ['1.4.3'],
      pageRole: 'homepage' as const,
    })),
    images: [previewTestImage()],
    facts: buildOutreachFactsBlock({
      assessment: undefined,
      language: overrides.language ?? 'fr',
      capabilities: { argumentB: true },
    }),
    observedAt: new Date('2026-08-29T09:00:00Z'),
    ...overrides,
  };
}
