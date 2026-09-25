/**
 * The approved bilingual observation vocabulary, first written for the
 * hotel prescan evidence contract. Issue #530 removed that contract with the
 * v1 outreach preview it fed; the proof-card copy still reuses these
 * sentences verbatim, so the two public documents name a defect the same way.
 */

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
