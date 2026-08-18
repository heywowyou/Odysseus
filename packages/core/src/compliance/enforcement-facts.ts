/**
 * Fixed, deterministic enforcement facts for the EAA/SMB route (regime 1
 * in docs/obligation-basis.md), spliced into the report the same way
 * regimes.ts's Regime rows are - never generated, never asked of the
 * LLM (CLAUDE.md rule 6, trade-off 11).
 *
 * report-feedback-palais-gallien.md item 18: the "Exposition légale"
 * section stated which obligation applies but never the actual exposure
 * (the consequence of non-compliance) - no fine amount, no case-law
 * state. Both facts below are checked against docs/obligation-basis.md
 * section 5 and carry only status `primary` content, per that doc's own
 * rule ("only these may reach a client or a prospect").
 *
 * Deliberately excluded: a description of the "mise en demeure"
 * procedure the acceptance check also asked for. docs/obligation-basis.md
 * documents mise en demeure only as one fact about one case (Picard
 * Surgelés), status secondary - it does not describe the mechanism
 * itself with primary sourcing, so stating a generic procedural
 * description here would be exactly the kind of unchecked fact rule 1
 * forbids. Add it once section 5 (or a future revision) documents the
 * mechanism with primary status, not before.
 */

import type { ReportLanguage } from '../types/llm-output.js';

/** Art. R451-4 code de la consommation: the fine for a contravention de
 *  5e classe applied to breaches of the D412-49 et seq. provisions,
 *  EUR 7,500 for a legal person, cumulable. Status: primary
 *  (docs/obligation-basis.md section 5). Distinct from, and never
 *  conflated with, the EUR 50,000 ARCOM figure that belongs to route 2
 *  (article 47) alone - obligation-basis.md is explicit that this
 *  figure "is quoted throughout this market as though it applied to an
 *  SMB under route 1" and that Odysseus never uses it in an EAA
 *  context. */
export const EAA_SANCTION_FIGURE_EUR = 7500;

interface Bilingual {
  fr: string;
  en: string;
}

function bilingual(fr: string, en: string): Bilingual {
  return { fr, en };
}

/** Neutral case-law state naming both 2026 référé outcomes
 *  (docs/obligation-basis.md section 5), never only the one favorable to
 *  urgency: Lille dismissed the claim (appeal pending), Caen granted an
 *  injunction the same reasoning would not obviously extend to an SMB
 *  under the EAA/SMB route rather than article 47. Mirrors the doc's own
 *  "Consequence" paragraph almost verbatim: the text creates the
 *  obligation, its application at this scale is contested at first
 *  instance, and an appeal is pending - never presented as settled. */
const CASE_LAW_STATE = bilingual(
  "Deux décisions de référé rendues en 2026 sur des sites différents sont allées en sens opposés : le tribunal de Lille a rejeté une action similaire le 5 mai 2026 (appel en cours), tandis que le tribunal de Caen a prononcé une injonction le 4 juin 2026 dans une affaire distincte. L'application de cette obligation à ce niveau fait donc l'objet d'un contentieux non tranché ; aucune conclusion ne peut en être tirée pour un cas particulier.",
  'Two 2026 référé decisions on different sites went opposite ways: the Lille court dismissed a similar action on 5 May 2026 (appeal pending), while the Caen court granted an injunction on 4 June 2026 in a separate case. Whether this obligation applies at this scale is therefore contested and unsettled at first instance; no conclusion can be drawn from it for any particular case.',
);

/** French thousands grouping uses a narrow no-break space (U+202F), the
 *  same D27 rule packages/report's formatNumber applies - duplicated
 *  here rather than imported, since core has no dependency on report and
 *  this is the only number this file ever formats. */
function formatEur(amount: number, language: ReportLanguage): string {
  const formatted = new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-US').format(amount);
  return language === 'fr' ? `${formatted} €` : `EUR ${formatted}`;
}

export function eaaSanctionFigureSentence(language: ReportLanguage): string {
  const amount = formatEur(EAA_SANCTION_FIGURE_EUR, language);
  return language === 'fr'
    ? `Le non-respect des obligations documentées à l'article D412-49 et suivants du code de la consommation est sanctionné par l'amende prévue pour une contravention de 5e classe, soit jusqu'à ${amount} par manquement constaté pour une personne morale, cumulable (art. R451-4 du code de la consommation).`
    : `Non-compliance with the obligations documented at article D412-49 et seq. of the consumer code is sanctioned by the fine for a 5th-class contravention, up to ${amount} per confirmed breach for a legal person, cumulable (art. R451-4 of the consumer code).`;
}

export function eaaCaseLawStateSentence(language: ReportLanguage): string {
  return CASE_LAW_STATE[language];
}
