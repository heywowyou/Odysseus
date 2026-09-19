import type { ReportLanguage } from '@odysseus/core';
import type { ProseField } from './prose-fields.js';
import type { WritingPassOutput } from './writing-schema.js';

/**
 * Plan 067: the writer has no measured evidence for commercial outcomes such
 * as bookings, conversion, revenue, abandonment, demand, trust, or reputation.
 * Those claims are unsupported whether categorical or hedged. Hedging changes
 * confidence, not evidence, so "may reduce bookings" is rejected just like
 * "reduces bookings".
 *
 * Direct functional consequences remain allowed: a visitor cannot read a
 * label, reach a control, understand an error, or complete an interface step.
 */
const BANNED_CLAIM_PATTERNS: Record<ReportLanguage, RegExp[]> = {
  fr: [
    /\bplus\s+rentables?\b/iu,
    /\bplus\s+lucratifs?(?:e|es)?\b/iu,
    /\bg[eéè]n[eéè]r\w*\s+le\s+plus\b/iu,
    /\brapporte(?:nt)?\s+le\s+plus\b/iu,
    /\bmeilleure\s+page\s+de\s+vente\b/iu,
    /\babandonn\w*\b/iu,
    /\b(?:commercialement\s+important(?:e|es|s)?|commerciale?s?\s+important(?:e|es|s)?|plus\s+important(?:e|es|s)?\s+commercialement)\b/iu,
    /\b(?:confiance|r[ée]putation|demande)\b[^.!?]{0,80}\b(?:entam\w*|d[ée]grad\w*|renforc\w*|am[ée]lior\w*|affect\w*|impact\w*)\b/iu,
    /\bperte\s+(?:de|des|du)\s+(?:r[ée]servations?|ventes?|clients?|conversion|revenus?|chiffre\s+d['’]affaires|demande|confiance|r[ée]putation)\b/iu,
    /\b(?:r[ée]servations?|ventes?|clients?|conversion|revenus?|chiffre\s+d['’]affaires|demande|confiance|r[ée]putation)\s+(?:perdu(?:e|es|s)?|manqu[ée](?:e|es|s)?|en\s+baisse)\b/iu,
    /\b(?:perd\w*|manqu\w*|r[ée]dui\w*|augment\w*|am[ée]lior\w*|d[ée]grad\w*|entam\w*|nui\w*|menac\w*|comprom\w*|affect\w*|impact\w*|d[ée]courag\w*|abandonn\w*)\b[^.!?]{0,100}\b(?:r[ée]servations?|ventes?|clients?|conversion|revenus?|chiffre\s+d['’]affaires|demande|confiance|r[ée]putation)\b/iu,
    /\b(?:r[ée]servations?|ventes?|clients?|conversion|revenus?|chiffre\s+d['’]affaires|demande|confiance|r[ée]putation)\b[^.!?]{0,100}\b(?:baiss\w*|augment\w*|diminu\w*|souffr\w*|p[âa]ti\w*|d[ée]grad\w*|menac\w*|comprom\w*)\b/iu,
  ],
  en: [
    /\bmost\s+profitable\b/iu,
    /\bmost\s+lucrative\b/iu,
    /\btop[- ]earning\b/iu,
    /\bbest[- ]selling\s+page\b/iu,
    /\bgenerates?\s+the\s+most\b/iu,
    /\bhighest[- ]revenue\b/iu,
    /\b(?:abandon|abandons|abandoned|abandonment|drop\s*out|drops\s*out)\b/iu,
    /\bcommercially\s+important\b/iu,
    /\b(?:trust|reputation|demand)\b[^.!?]{0,80}\b(?:damage|damages|improve|improves|increase|increases|decline|declines|suffer|suffers|affect|affects|impact|impacts)\b/iu,
    /\bloss\s+of\s+(?:bookings?|sales?|customers?|conversion|revenue|demand|trust|reputation)\b/iu,
    /\b(?:lost|missed)\s+(?:bookings?|sales?|customers?|revenue|demand|trust)\b/iu,
    /\b(?:lose|loses|lost|reduce|reduces|lower|lowers|increase|increases|improve|improves|harm|harms|hurt|hurts|erode|erodes|threaten|threatens|damage|damages|affect|affects|impact|impacts|discourage|discourages|abandon|abandons)\b[^.!?]{0,100}\b(?:bookings?|sales?|customers?|conversion|revenue|demand|trust|reputation)\b/iu,
    /\b(?:bookings?|sales?|customers?|conversion|revenue|demand|trust|reputation)\b[^.!?]{0,100}\b(?:drop|drops|fall|falls|decline|declines|suffer|suffers|improve|improves|increase|increases)\b/iu,
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
