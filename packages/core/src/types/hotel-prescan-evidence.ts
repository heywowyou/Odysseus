import { z } from 'zod';
import type { Severity } from './findings.js';
import type { HotelPrescanPageRole } from './hotel-prescan.js';

export const HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION = 1 as const;
export const HOTEL_EVIDENCE_MAX_ASSET_BYTES = 1024 * 1024;
export const HOTEL_EVIDENCE_MAX_TOTAL_BYTES = 2 * 1024 * 1024;
export const HOTEL_EVIDENCE_MIN_SUMMARIES = 3;
export const HOTEL_EVIDENCE_MAX_SUMMARIES = 5;

export type HotelEvidenceStatus = 'complete' | 'incomplete';

export type HotelEvidenceOmissionReason =
  | 'no-material-render-gap'
  | 'no-eligible-failure'
  | 'source-screenshot-missing'
  | 'target-unresolved'
  | 'image-too-large'
  | 'capture-failed';

export type HotelEvidenceSelectionReason =
  | 'material-render-gap'
  | 'booking-keyboard-trap'
  | 'booking-form-error'
  | 'booking-call-to-action'
  | 'booking-severe-element-failure'
  | 'generic-element-failure';

export interface HotelEvidenceBilingualText {
  fr: string;
  en: string;
}

export const HOTEL_EVIDENCE_OBSERVATIONS: Readonly<Record<string, HotelEvidenceBilingualText>> = {
  'text-missing-from-raw-html': {
    fr: 'Une partie importante du contenu visible dépend de JavaScript.',
    en: 'A material part of the visible content depends on JavaScript.',
  },
  'keyboard-trap': {
    fr: 'La navigation au clavier reste bloquée sur un élément.',
    en: 'Keyboard navigation remains trapped on one element.',
  },
  'form-error-not-associated': {
    fr: "Une erreur de formulaire visible n'est pas annoncée aux technologies d'assistance.",
    en: 'A visible form error is not exposed to assistive technology.',
  },
  'color-contrast': {
    fr: 'Un élément présente un contraste de couleur insuffisant.',
    en: 'An element has insufficient color contrast.',
  },
  'target-size': {
    fr: 'Une cible interactive est trop petite ou trop rapprochée.',
    en: 'An interactive target is too small or too closely spaced.',
  },
  'button-name': {
    fr: "Un bouton n'a pas de nom accessible.",
    en: 'A button has no accessible name.',
  },
  'link-name': {
    fr: "Un lien n'a pas de nom accessible.",
    en: 'A link has no accessible name.',
  },
  'image-alt': {
    fr: "Une image informative n'a pas de texte alternatif.",
    en: 'An informative image has no alternative text.',
  },
  label: {
    fr: "Un champ de formulaire n'a pas de libellé accessible.",
    en: 'A form field has no accessible label.',
  },
  'html-has-lang': {
    fr: "La langue principale de la page n'est pas déclarée.",
    en: 'The page language is not declared.',
  },
  'structured-data-entity-missing': {
    fr: "Aucune donnée structurée ne décrit clairement l'établissement.",
    en: 'No structured data clearly identifies the property.',
  },
  'entity-data-incomplete': {
    fr: "Les données structurées de l'établissement sont incomplètes.",
    en: "The property's structured data is incomplete.",
  },
};

export interface HotelEvidenceCapturedAsset {
  state: 'captured';
  ref: string;
  sha256: string;
  mimeType: 'image/png';
  byteSize: number;
  width: number;
  height: number;
  pageRole: HotelPrescanPageRole;
  /** Stable, opaque reference to the measured fact. It is not a finding id. */
  factRef: string;
  altText: HotelEvidenceBilingualText;
  selectionReason: HotelEvidenceSelectionReason;
}

export interface HotelEvidenceOmittedAsset {
  state: 'omitted';
  reason: HotelEvidenceOmissionReason;
}

export type HotelEvidenceAsset = HotelEvidenceCapturedAsset | HotelEvidenceOmittedAsset;

export interface HotelEvidencePublicSummary {
  observation: HotelEvidenceBilingualText;
  severity: Severity;
  wcagCriteria: string[];
  pageRole: HotelPrescanPageRole;
}

export interface HotelPrescanEvidence {
  schemaVersion: typeof HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION;
  status: HotelEvidenceStatus;
  renderComparison: HotelEvidenceAsset;
  specificFailure: HotelEvidenceAsset;
  summaries: HotelEvidencePublicSummary[];
}

const bilingualTextSchema = z.object({ fr: z.string().min(1), en: z.string().min(1) }).strict();
const fixedObservationSchema = bilingualTextSchema.superRefine((observation, context) => {
  const allowed = Object.values(HOTEL_EVIDENCE_OBSERVATIONS).some(
    (candidate) => candidate.fr === observation.fr && candidate.en === observation.en,
  );
  if (!allowed) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'observation must come from the fixed bilingual allowlist',
    });
  }
});
const pageRoleSchema = z.enum(['homepage', 'booking', 'content']);
const severitySchema = z.enum(['critical', 'serious', 'moderate', 'minor']);
const omissionReasonSchema = z.enum([
  'no-material-render-gap',
  'no-eligible-failure',
  'source-screenshot-missing',
  'target-unresolved',
  'image-too-large',
  'capture-failed',
]);
const selectionReasonSchema = z.enum([
  'material-render-gap',
  'booking-keyboard-trap',
  'booking-form-error',
  'booking-call-to-action',
  'booking-severe-element-failure',
  'generic-element-failure',
]);

const capturedAssetSchema = z
  .object({
    state: z.literal('captured'),
    ref: z.string().regex(/^evidence\/[0-9a-f]{64}\.png$/),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    mimeType: z.literal('image/png'),
    byteSize: z.number().int().positive().max(HOTEL_EVIDENCE_MAX_ASSET_BYTES),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    pageRole: pageRoleSchema,
    factRef: z.string().regex(/^fact_[0-9a-f]{24}$/),
    altText: bilingualTextSchema,
    selectionReason: selectionReasonSchema,
  })
  .strict()
  .superRefine((asset, context) => {
    if (asset.ref !== `evidence/${asset.sha256}.png`) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'ref must match sha256' });
    }
  });

const omittedAssetSchema = z
  .object({ state: z.literal('omitted'), reason: omissionReasonSchema })
  .strict();

const assetSchema = z.union([capturedAssetSchema, omittedAssetSchema]);

const summarySchema = z
  .object({
    observation: fixedObservationSchema,
    severity: severitySchema,
    wcagCriteria: z.array(z.string().regex(/^\d+\.\d+\.\d+$/)),
    pageRole: pageRoleSchema,
  })
  .strict();

export const hotelPrescanEvidenceSchema: z.ZodType<HotelPrescanEvidence> = z
  .object({
    schemaVersion: z.literal(HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION),
    status: z.enum(['complete', 'incomplete']),
    renderComparison: assetSchema,
    specificFailure: assetSchema,
    summaries: z.array(summarySchema).max(HOTEL_EVIDENCE_MAX_SUMMARIES),
  })
  .strict()
  .superRefine((evidence, context) => {
    const bothCaptured =
      evidence.renderComparison.state === 'captured' &&
      evidence.specificFailure.state === 'captured';
    const enoughSummaries = evidence.summaries.length >= HOTEL_EVIDENCE_MIN_SUMMARIES;
    if (evidence.status === 'complete' && (!bothCaptured || !enoughSummaries)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'complete evidence requires both assets and at least three summaries',
      });
    }
    if (evidence.status === 'incomplete' && bothCaptured && enoughSummaries) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'evidence-complete input cannot be marked incomplete',
      });
    }
    const bytes = [evidence.renderComparison, evidence.specificFailure].reduce(
      (sum, asset) => sum + (asset.state === 'captured' ? asset.byteSize : 0),
      0,
    );
    if (bytes > HOTEL_EVIDENCE_MAX_TOTAL_BYTES) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'evidence exceeds total byte cap' });
    }
    if (
      evidence.renderComparison.state === 'captured' &&
      (evidence.renderComparison.width > 1200 || evidence.renderComparison.height > 900)
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'render comparison is oversized' });
    }
    if (
      evidence.specificFailure.state === 'captured' &&
      (evidence.specificFailure.width > 800 || evidence.specificFailure.height > 600)
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'specific failure is oversized' });
    }
  });
