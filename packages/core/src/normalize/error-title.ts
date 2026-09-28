/**
 * A title or heading that announces a missing page, in the languages this
 * tool sells in plus the bare code. Anchored at the start: a page titled
 * « Nos chambres | Erreur 404 possible » is not a shape any CMS emits.
 * Shared by the scanner's soft-404 classifier (issue #302) and the rule that
 * reports a content page carrying such a title (plan 075 K4).
 */
export const ERROR_TITLE_PATTERN =
  /^\s*(?:erreur\s*(?:http\s*)?)?404\b|^\s*(?:page\s+)?(?:not\s+found|introuvable|non\s+trouv[ée]e?|no\s+encontrada|non\s+trovata)\b|^\s*(?:page|pagina|página)\s+(?:not\s+found|introuvable|non\s+trouv[ée]e?|no\s+encontrada|non\s+trovata)\b/i;

export function announcesMissingPage(text: string | null | undefined): boolean {
  return text !== null && text !== undefined && ERROR_TITLE_PATTERN.test(text);
}
