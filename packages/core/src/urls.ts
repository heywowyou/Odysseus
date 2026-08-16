/**
 * URL heuristics shared by more than one package. Kept in core, not
 * duplicated, since packages/llm's diversion logic and the scanner's
 * mentions-legales check both need the exact same definition of "this
 * looks like a legal page" - letting the two drift would mean a page
 * diverted from the LLM as legal could disagree with the page the
 * scanner treats as the mentions-legales page.
 */
export const LEGAL_PATH_PATTERN =
  /(cgu|cgv|conditions|mentions?-legales?|cookies|confidentialite|privacy|terms|legal)/i;
