import { compareCriteria, type ReportLanguage } from '@odysseus/core';

/**
 * WCAG 2.2 level A and AA success criterion names, French and English,
 * scoped to the criteria axe-core's WCAG tag set can tag (see
 * @odysseus/core's wcagCriteriaFromAxeTags, which derives criteria
 * generically from any `wcagXYZ` axe tag rather than a fixed list).
 * French names follow the W3C's own French translation phrasing.
 *
 * This table is never the source of a claim about what applies to a
 * client - only of the criterion's official name. A code missing from
 * this table (an axe-core upgrade tagging a criterion not yet added
 * here) falls back to the bare code with no parenthetical name, in
 * buildLegalRelevance below, rather than guessing a name.
 */
const WCAG_CRITERION_NAMES: Record<ReportLanguage, Record<string, string>> = {
  fr: {
    '1.1.1': 'Contenu non textuel',
    '1.2.1': 'Contenu uniquement audio ou uniquement vidéo (enregistré)',
    '1.2.2': 'Sous-titres (enregistré)',
    '1.2.3': 'Audiodescription ou média alternatif (enregistré)',
    '1.2.4': 'Sous-titres (en direct)',
    '1.2.5': 'Audiodescription (enregistré)',
    '1.3.1': 'Information et relations',
    '1.3.2': 'Ordre séquentiel logique',
    '1.3.3': 'Caractéristiques sensorielles',
    '1.3.4': 'Orientation',
    '1.3.5': "Identifier la finalité d'une saisie",
    '1.4.1': 'Utilisation de la couleur',
    '1.4.2': 'Contrôle du son',
    '1.4.3': 'Contraste minimum',
    '1.4.4': 'Redimensionnement du texte',
    '1.4.5': 'Images de texte',
    '1.4.10': 'Redistribution',
    '1.4.11': 'Contraste des éléments non textuels',
    '1.4.12': 'Espacement du texte',
    '1.4.13': 'Contenu au survol ou au focus',
    '2.1.1': 'Clavier',
    '2.1.2': 'Pas de piège au clavier',
    '2.1.4': "Raccourcis clavier n'utilisant qu'un seul caractère",
    '2.2.1': 'Réglage du délai',
    '2.2.2': 'Mettre en pause, arrêter, masquer',
    '2.3.1': 'Pas plus de trois flashs, ou sous le seuil',
    '2.4.1': 'Contournement de blocs',
    '2.4.2': 'Page titrée',
    '2.4.3': 'Ordre de focus',
    '2.4.4': 'Fonction du lien selon le contexte',
    '2.4.5': 'Accès multiples',
    '2.4.6': 'En-têtes et étiquettes',
    '2.4.7': 'Visibilité du focus',
    '2.4.11': 'Visibilité du focus, a minima',
    '2.5.1': 'Gestes du pointeur',
    '2.5.2': 'Annulation du pointeur',
    '2.5.3': 'Label dans le nom',
    '2.5.4': 'Activation par le mouvement',
    '2.5.7': 'Mouvements de glissement',
    '2.5.8': 'Taille de la cible, minimum',
    '3.1.1': 'Langue de la page',
    '3.1.2': 'Langue des passages',
    '3.2.1': 'Au focus',
    '3.2.2': 'À la saisie',
    '3.2.3': 'Navigation cohérente',
    '3.2.4': 'Identification cohérente',
    '3.2.6': 'Aide cohérente',
    '3.3.1': 'Identification des erreurs',
    '3.3.2': 'Étiquettes ou instructions',
    '3.3.3': 'Suggestion après une erreur',
    '3.3.4': 'Prévention des erreurs (juridiques, financières, de données)',
    '3.3.7': 'Saisie redondante',
    '3.3.8': 'Authentification accessible, a minima',
    '4.1.1': 'Analyse syntaxique',
    '4.1.2': 'Nom, rôle et valeur',
    '4.1.3': 'Messages de statut',
  },
  en: {
    '1.1.1': 'Non-text Content',
    '1.2.1': 'Audio-only and Video-only (Prerecorded)',
    '1.2.2': 'Captions (Prerecorded)',
    '1.2.3': 'Audio Description or Media Alternative (Prerecorded)',
    '1.2.4': 'Captions (Live)',
    '1.2.5': 'Audio Description (Prerecorded)',
    '1.3.1': 'Info and Relationships',
    '1.3.2': 'Meaningful Sequence',
    '1.3.3': 'Sensory Characteristics',
    '1.3.4': 'Orientation',
    '1.3.5': 'Identify Input Purpose',
    '1.4.1': 'Use of Color',
    '1.4.2': 'Audio Control',
    '1.4.3': 'Contrast (Minimum)',
    '1.4.4': 'Resize Text',
    '1.4.5': 'Images of Text',
    '1.4.10': 'Reflow',
    '1.4.11': 'Non-text Contrast',
    '1.4.12': 'Text Spacing',
    '1.4.13': 'Content on Hover or Focus',
    '2.1.1': 'Keyboard',
    '2.1.2': 'No Keyboard Trap',
    '2.1.4': 'Character Key Shortcuts',
    '2.2.1': 'Timing Adjustable',
    '2.2.2': 'Pause, Stop, Hide',
    '2.3.1': 'Three Flashes or Below Threshold',
    '2.4.1': 'Bypass Blocks',
    '2.4.2': 'Page Titled',
    '2.4.3': 'Focus Order',
    '2.4.4': 'Link Purpose (In Context)',
    '2.4.5': 'Multiple Ways',
    '2.4.6': 'Headings and Labels',
    '2.4.7': 'Focus Visible',
    '2.4.11': 'Focus Not Obscured (Minimum)',
    '2.5.1': 'Pointer Gestures',
    '2.5.2': 'Pointer Cancellation',
    '2.5.3': 'Label in Name',
    '2.5.4': 'Motion Actuation',
    '2.5.7': 'Dragging Movements',
    '2.5.8': 'Target Size (Minimum)',
    '3.1.1': 'Language of Page',
    '3.1.2': 'Language of Parts',
    '3.2.1': 'On Focus',
    '3.2.2': 'On Input',
    '3.2.3': 'Consistent Navigation',
    '3.2.4': 'Consistent Identification',
    '3.2.6': 'Consistent Help',
    '3.3.1': 'Error Identification',
    '3.3.2': 'Labels or Instructions',
    '3.3.3': 'Error Suggestion',
    '3.3.4': 'Error Prevention (Legal, Financial, Data)',
    '3.3.7': 'Redundant Entry',
    '3.3.8': 'Accessible Authentication (Minimum)',
    '4.1.1': 'Parsing',
    '4.1.2': 'Name, Role, Value',
    '4.1.3': 'Status Messages',
  },
};

/** Exported for packages/report's conformance rollup (docs/archive/report-v2-refactor.md
 *  3.5), which needs the same official criterion name shown per row -
 *  one canonical table, not a second copy in another package. Returns
 *  undefined for an unmapped code rather than a guess. */
export function getCriterionName(code: string, language: ReportLanguage): string | undefined {
  return WCAG_CRITERION_NAMES[language][code];
}

function formatCriterion(code: string, language: ReportLanguage): string {
  const name = getCriterionName(code, language);
  return name ? `${code} (${name})` : code;
}

function joinWithConjunction(parts: readonly string[], conjunction: string): string {
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} ${conjunction} ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} ${conjunction} ${parts[parts.length - 1]}`;
}

/**
 * The fixed-shape legalRelevance sentence, built entirely in code from
 * deterministic wcagCriteria data. The model never sees or writes any
 * part of this - see docs/archive/report-v2-refactor.md 4.3 ("The model chooses
 * no part of this sentence"). Fixes C19 (the legal framing is invisible)
 * without inviting the model to overstate a legal obligation, which
 * CLAUDE.md rule 6 forbids outright.
 *
 * Returns '' for an empty criteria list; callers (merge.ts) only call
 * this for accessibility themes with at least one WCAG criterion.
 */
export function buildLegalRelevance(
  wcagCriteria: readonly string[],
  language: ReportLanguage,
): string {
  const sorted = [...new Set(wcagCriteria)].sort(compareCriteria);
  if (sorted.length === 0) return '';

  const formatted = sorted.map((code) => formatCriterion(code, language));

  if (language === 'fr') {
    const label = sorted.length > 1 ? 'Critères' : 'Critère';
    const verb = sorted.length > 1 ? 'référencés' : 'référencé';
    return `${label} ${joinWithConjunction(formatted, 'et')}, WCAG 2.2 niveau AA, ${verb} par la norme EN 301 549.`;
  }

  const label = sorted.length > 1 ? 'Criteria' : 'Criterion';
  return `${label} ${joinWithConjunction(formatted, 'and')}, WCAG 2.2 level AA, referenced by the EN 301 549 standard.`;
}
