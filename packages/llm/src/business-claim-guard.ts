import type { ReportLanguage } from '@odysseus/core';
import type { ProseField } from './prose-fields.js';
import type { WritingPassOutput } from './writing-schema.js';

/** The observed fault phrase per language, verbatim from the first live
 *  run. Shared with writing-prompt.ts's instruction so the prompt names
 *  the exact shape of claim the guard rejects. */
export const BUSINESS_CLAIM_EXAMPLES: Record<ReportLanguage, string> = {
  fr: 'la page la plus rentable',
  en: 'the most profitable page',
};

/**
 * The model's input contains no revenue, traffic, or conversion data, so
 * it can never know which page is the most commercially valuable one.
 * The first live run still wrote "la page la plus rentable du site"
 * (sas-fernande.fr, 2026-08-02), a reasonable-sounding ranking asserted
 * as knowledge. docs/llm-layer-rules.md section 6 draws the exact line:
 * the model may say a page appears commercially important, which is
 * inference the client can weigh, but not assert relative page value.
 *
 * The fallbackNote in writing-prompt.ts already forbids this, but only
 * when no intake context was provided, and a prompt instruction is not a
 * guard (the standing reasoning of the language and severity-vocabulary
 * guards). This guard applies with or without site context.
 *
 * Scope is deliberately narrow, calibrated against every stored analysis:
 * only profitability and revenue superlatives are banned. Traffic
 * superlatives are not: real output legitimately uses them as generic
 * advice phrasing ("Prioriser les pages les plus visitées", "high-traffic
 * pages like activities, events"), with no specific page asserted and no
 * data claimed. A hedged sentence is never a violation, matching the
 * doctrine's own escape hatch: "semble être la page la plus rentable" is
 * inference the client can weigh, the unhedged form is a claim they would
 * have to correct.
 */
const BANNED_CLAIM_PATTERNS: Record<ReportLanguage, RegExp[]> = {
  fr: [
    /\bplus\s+rentables?\b/iu,
    /\bplus\s+lucratifs?(?:e|es)?\b/iu,
    /\bg[eéè]n[eéè]r\w*\s+le\s+plus\b/iu,
    /\brapporte(?:nt)?\s+le\s+plus\b/iu,
    /\bmeilleure\s+page\s+de\s+vente\b/iu,
  ],
  en: [
    /\bmost\s+profitable\b/iu,
    /\bmost\s+lucrative\b/iu,
    /\btop[- ]earning\b/iu,
    /\bbest[- ]selling\s+page\b/iu,
    /\bgenerates?\s+the\s+most\b/iu,
    /\bhighest[- ]revenue\b/iu,
  ],
};

/** A hedge anywhere in the same sentence makes the claim inference rather
 *  than assertion, which the doctrine explicitly permits. Sentence-level
 *  rather than "hedge immediately before the match" so both orders work
 *  ("semble être la page la plus rentable", "la page la plus rentable,
 *  vraisemblablement"). */
const HEDGE_MARKERS: Record<ReportLanguage, RegExp[]> = {
  fr: [
    /\bsemble(?:nt)?\b/iu,
    /\bpara[îi]t\b/iu,
    /\bappara[îi]t\b/iu,
    /\bprobablement\b/iu,
    /\bvraisemblablement\b/iu,
    /\bsans\s+doute\b/iu,
    /\bpeut[- ]être\b/iu,
    /\bpourrait\b/iu,
    /\bdevrait\b/iu,
    /\bsusceptible\b/iu,
  ],
  en: [
    /\bappears?\b/iu,
    /\bseems?\b/iu,
    /\bprobably\b/iu,
    /\blikely\b/iu,
    /\bperhaps\b/iu,
    /\bpossibly\b/iu,
    /\bmay\b/iu,
    /\bmight\b/iu,
  ],
};

export interface BusinessClaimViolation {
  field: string;
  text: string;
  matched: string;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/** At most one violation per field, mirroring
 *  findLegalConsequenceViolations' shape. */
export function findBusinessClaimViolationsInFields(
  fields: readonly ProseField[],
  language: ReportLanguage,
): BusinessClaimViolation[] {
  const violations: BusinessClaimViolation[] = [];
  for (const { field, text } of fields) {
    for (const sentence of splitSentences(text)) {
      const claim = BANNED_CLAIM_PATTERNS[language].find((pattern) => pattern.test(sentence));
      if (!claim) continue;
      const hedged = HEDGE_MARKERS[language].some((pattern) => pattern.test(sentence));
      if (hedged) continue;
      violations.push({ field, text, matched: sentence.match(claim)![0] });
      break;
    }
  }
  return violations;
}

/** Same prose-field surface as the legal-consequence and severity
 *  vocabulary guards: executiveSummary, notes, businessImpact,
 *  recommendedActions, and theme titles. Titles were excluded until the
 *  2026-08-30 pass on the reasoning that a label's claim surfaces in the
 *  fields anyway; the reverse leak is just as real (a title asserting a
 *  ranking renders as a heading with no prose beside it to check), and
 *  the measured stored titles matched nothing, so titles are guarded
 *  like every other model-written field. */
export function findBusinessClaimViolations(
  output: WritingPassOutput,
  language: ReportLanguage,
): BusinessClaimViolation[] {
  const fields: ProseField[] = [
    { field: 'executiveSummary', text: output.executiveSummary },
    { field: 'notes', text: output.notes },
    ...output.themes.flatMap((theme, i) => [
      { field: `themes[${i}](${theme.themeKey}).title`, text: theme.title },
      { field: `themes[${i}](${theme.themeKey}).businessImpact`, text: theme.businessImpact },
      ...theme.recommendedActions.map((action, j) => ({
        field: `themes[${i}](${theme.themeKey}).recommendedActions[${j}]`,
        text: action,
      })),
    ]),
  ];

  return findBusinessClaimViolationsInFields(fields, language);
}
