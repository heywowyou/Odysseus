import type { OutreachProseOutput } from '../outreach-schema.js';
import { outreachProseFields } from '../outreach-schema.js';

/**
 * The model is shown one observation per call (outreach-input.ts withholds
 * everything else about the evidence, including which of the twelve
 * HOTEL_EVIDENCE_OBSERVATIONS keys it is), so it has no legitimate reason to
 * write about a different one. This guard is the check for that: each key
 * owns a short list of trigger terms drawn from its own fixed description
 * text in HOTEL_EVIDENCE_OBSERVATIONS, and a match against any OTHER key's
 * terms is a scope violation.
 *
 * Terms are compared as a set difference (all terms minus the selected key's
 * own terms), not by looking the selected key up and skipping it, because
 * several keys legitimately share vocabulary with their own fixed
 * description text - button-name and link-name both say "nom accessible" /
 * "accessible name", and the two structured-data keys both say "données
 * structurées" / "structured data". Subtracting only the selected key's
 * terms means a shared term stays allowed whichever of its owners was
 * selected, rather than flagging the model for paraphrasing the very
 * sentence it was given.
 *
 * A bare "lien" / "link" or "bouton" / "button" is deliberately not a
 * trigger term for link-name / button-name: touch 1 always carries the
 * preview link and touch prose routinely gestures at UI elements in passing,
 * so a bare noun would false-positive on the email's own required content
 * rather than on a scope leak.
 *
 * The key set below is asserted against HOTEL_EVIDENCE_OBSERVATIONS in
 * observation-scope-guard.test.ts, so a thirteenth observation added to core
 * without a matching entry here fails a test rather than silently going
 * unchecked.
 */
export const OBSERVATION_TRIGGER_TERMS: Readonly<Record<string, readonly string[]>> = {
  'text-missing-from-raw-html': ['javascript'],
  'keyboard-trap': [
    'piège clavier',
    'keyboard trap',
    'bloquée sur un élément',
    'trapped on one element',
  ],
  'form-error-not-associated': [
    'erreur de formulaire',
    'form error',
    "technologies d'assistance",
    'assistive technology',
  ],
  'color-contrast': ['contraste de couleur', 'color contrast'],
  'target-size': [
    'cible interactive',
    'interactive target',
    'trop petite ou trop rapprochée',
    'too small or too closely spaced',
  ],
  'button-name': ['nom accessible', 'accessible name'],
  'link-name': ['nom accessible', 'accessible name'],
  'image-alt': ['texte alternatif', 'alt text', 'alternative text'],
  label: ['libellé accessible', 'accessible label'],
  'html-has-lang': [
    'langue principale de la page',
    "n'est pas déclarée",
    'page language',
    'is not declared',
  ],
  'structured-data-entity-missing': ['données structurées', 'structured data'],
  'entity-data-incomplete': ['données structurées', 'structured data'],
};

export interface ObservationScopeViolation {
  field: string;
  text: string;
  matched: string;
}

function forbiddenTermsFor(selectedKey: string | undefined): string[] {
  const allTerms = new Set(Object.values(OBSERVATION_TRIGGER_TERMS).flat());
  const ownTerms = selectedKey !== undefined ? (OBSERVATION_TRIGGER_TERMS[selectedKey] ?? []) : [];
  for (const term of ownTerms) allTerms.delete(term);
  return [...allTerms];
}

export function findObservationScopeViolations(
  output: OutreachProseOutput,
  selectedObservationKey: string | undefined,
): ObservationScopeViolation[] {
  const violations: ObservationScopeViolation[] = [];
  const forbidden = forbiddenTermsFor(selectedObservationKey);
  if (forbidden.length === 0) return violations;

  for (const { field, text } of outreachProseFields(output)) {
    const lowered = text.toLowerCase();
    for (const term of forbidden) {
      if (lowered.includes(term.toLowerCase())) {
        violations.push({ field, text, matched: term });
        break;
      }
    }
  }

  return violations;
}
