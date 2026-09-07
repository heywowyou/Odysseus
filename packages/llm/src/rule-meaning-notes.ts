import { ALT_TEXT_QUALITY_HEURISTIC_RULE_ID } from '@odysseus/core';
import type { ReportLanguage } from '@odysseus/core';

/**
 * Plan 028. Audit-rehearsal notes (#67/#68, villasfoch and briketenia)
 * recorded the alt-text-quality-heuristic finding explained with two
 * different meanings across the French and English passes of the same
 * audit - both readable in isolation, but a genuine substantive
 * disagreement, not just a wording difference, when the same client
 * document is read in both languages side by side.
 *
 * The structure pass is shared between languages; only the writing pass
 * diverges, because each language call independently free-describes what
 * a rule means from the finding data alone. For rule IDs with a
 * documented history of that drift, this table gives both language
 * passes the same anchor meaning to ground their prose in, instead of
 * each inventing its own gloss. Start with alt-text-quality-heuristic
 * only; add an entry only when a new drift case is actually observed
 * against real output, same discipline as LIGHTHOUSE_EXCLUDED_AUDITS's
 * "add only overlap confirmed against real output" (trade-off 1).
 *
 * This does not change what the model is allowed to say about a
 * finding - the underlying finding data is unchanged - only removes the
 * chance that two languages describe the same fact differently because
 * neither was given a fixed description to work from.
 */
export const RULE_MEANING_NOTES: Partial<Record<string, Record<ReportLanguage, string>>> = {
  [ALT_TEXT_QUALITY_HEURISTIC_RULE_ID]: {
    fr: 'Le constat associé à la règle "alt-text-quality-heuristic" signale un texte alternatif d\'image présent mais probablement peu utile (par exemple un nom de fichier, un mot générique comme "image", ou une répétition du texte environnant). Ce n\'est ni une absence de texte alternatif, un autre constat couvre ce cas, ni une confirmation automatique que le texte est mauvais : c\'est un signal à vérifier manuellement. Décrivez-le ainsi dans votre prose, quelle que soit la langue de la réponse.',
    en: 'The finding tied to the rule "alt-text-quality-heuristic" flags image alt text that is present but likely low-value (for example a filename, a generic word like "image", or a repeat of the surrounding text). It is not a missing alt attribute, a different finding covers that, and it is not automatic confirmation the text is bad: it is a signal worth checking manually. Describe it this way in your prose, regardless of the response language.',
  },
};

/** Builds the prompt note for whichever rule IDs from RULE_MEANING_NOTES
 *  actually appear among the findings this call is shown, so a report
 *  with no alt-text-quality-heuristic finding gets no note about it. */
export function buildRuleMeaningNote(
  ruleIds: ReadonlySet<string>,
  language: ReportLanguage,
): string {
  const notes = [...ruleIds]
    .map((ruleId) => RULE_MEANING_NOTES[ruleId]?.[language])
    .filter((note): note is string => Boolean(note));

  if (notes.length === 0) return '';
  return `\n\n${notes.join('\n\n')}`;
}
