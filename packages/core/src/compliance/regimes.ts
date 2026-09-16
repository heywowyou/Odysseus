/**
 * Static regime data, deliberately separate from assessObligations.ts's
 * branching logic - the same split severity.ts already uses between
 * CUSTOM_CHECK_SEVERITY (a data table) and severityFromCustom (a lookup
 * function). Adding a regime, or correcting a citation, means editing
 * this file only.
 *
 * Every client-read field is bilingual (see packages/report's
 * legalCitation*Template fields). Issue #306: authority and legalCitation
 * used to be single French strings on the reasoning that official names
 * and citations are not translated, which left "Loi n° 2023-171 du 9 mars
 * 2023, articles 16 à 19" and "Direction générale de la concurrence..."
 * in the middle of English sentences. English now describes the body and
 * the law in English and keeps the official French name only as a
 * parenthetical. The same issue removed the citation from `name`: the
 * report's legal paragraph printed the law once inside the name and again
 * as the citation, in one sentence. `name` is the obligation alone, and
 * `legalCitation` is the one place the law is cited.
 *
 * sanctionCeiling figures below are a starting reference, not verified
 * against the current decree text for this milestone - and per the
 * report plan they are never interpolated into any client-facing
 * template. Spot-check them against the live decree before any future
 * work surfaces them in a paid report body.
 */

import type { ReportLanguage } from '../types/llm-output.js';
import type { Regime } from '../types/compliance.js';

export const EAA_REGIME_ID = 'eaa-loi-2023-171';
export const ARTICLE_47_REGIME_ID = 'loi-2005-102-article-47';
export const LCEN_MENTIONS_LEGALES_REGIME_ID = 'lcen-mentions-legales';

export const SME_EXEMPTION_TURNOVER_THRESHOLD_EUR = 2_000_000;
export const ARTICLE_47_TURNOVER_THRESHOLD_EUR = 250_000_000;

/** Sirene's financial fields are only reliable for these
 *  tranche_effectif_salarie bands (see docs handed down with this
 *  milestone). Above this range, turnover must come from another source
 *  and Sirene's value is not used. Shared between assessObligations
 *  (core) and the Sirene client (interface) so the two can never
 *  disagree about which bands are trustworthy. */
export const SIRENE_TURNOVER_RELIABLE_EFFECTIF_CODES: readonly string[] = [
  'NN',
  '00',
  '01',
  '02',
  '03',
];

interface Bilingual {
  fr: string;
  en: string;
}

function bilingual(fr: string, en: string): Record<ReportLanguage, string> {
  return { fr, en };
}

interface RegimeDefinition extends Omit<
  Regime,
  'name' | 'thresholdDescription' | 'sanctionCeiling' | 'authority' | 'legalCitation'
> {
  name: Bilingual;
  thresholdDescription: Bilingual;
  authority: Bilingual;
  sanctionCeiling: Bilingual;
  legalCitation: Bilingual;
}

const REGIME_DEFINITIONS: Record<string, RegimeDefinition> = {
  [EAA_REGIME_ID]: {
    id: EAA_REGIME_ID,
    name: bilingual(
      "Obligation d'accessibilité numérique issue de l'European Accessibility Act",
      'Digital accessibility obligation under the European Accessibility Act',
    ),
    thresholdDescription: bilingual(
      "S'applique aux entreprises de 10 salariés ou plus, ou dont le chiffre d'affaires ou le total de bilan annuel dépasse 2 000 000 €, lorsque le site propose un parcours transactionnel B2C de premier niveau (réservation, panier, paiement).",
      'Applies to companies with 10 or more employees, or with annual turnover or balance sheet total above EUR 2,000,000, when the site offers a first party B2C transactional flow (booking, cart, checkout).',
    ),
    authority: bilingual(
      'Direction générale de la concurrence, de la consommation et de la répression des fraudes (DGCCRF)',
      "France's consumer protection authority (DGCCRF, Direction générale de la concurrence, de la consommation et de la répression des fraudes)",
    ),
    authorityPrefixFr: 'de la',
    sanctionCeiling: bilingual(
      "Jusqu'à 50 000 € d'amende administrative par manquement constaté (à vérifier contre le décret en vigueur avant toute mention client)",
      'Up to EUR 50,000 in administrative fines per confirmed breach (verify against the current decree before any client facing use)',
    ),
    legalCitation: bilingual(
      'loi n° 2023-171 du 9 mars 2023, articles 16 à 19',
      'French Law No. 2023-171 of 9 March 2023, articles 16 to 19',
    ),
  },
  [ARTICLE_47_REGIME_ID]: {
    id: ARTICLE_47_REGIME_ID,
    name: bilingual(
      "Obligation d'accessibilité des services de communication au public en ligne",
      'Accessibility obligation for online public communication services',
    ),
    thresholdDescription: bilingual(
      "S'applique aux personnes morales de droit privé dont le chiffre d'affaires annuel dépasse 250 000 000 €, indépendamment de toute autre condition d'effectif ou de secteur.",
      'Applies to private law entities with annual turnover above EUR 250,000,000, independently of any headcount or sector condition.',
    ),
    authority: bilingual(
      'Défenseur des droits',
      'the French Defender of Rights (Défenseur des droits)',
    ),
    authorityPrefixFr: 'du',
    sanctionCeiling: bilingual(
      'Sanction administrative dont le montant est fixé par décret (à vérifier avant toute mention client)',
      'Administrative sanction with an amount set by decree (verify before any client facing use)',
    ),
    legalCitation: bilingual(
      'loi n° 2005-102 du 11 février 2005, article 47',
      'French Law No. 2005-102 of 11 February 2005, article 47',
    ),
  },
  /** 2026-08-24: the citation here read "article 6-III et 6-VI-2" from the
   *  day this entry was written until it was first checked against
   *  Legifrance. Loi n. 2024-449 du 21 mai 2024 (SREN) restructured the LCEN
   *  and moved the identification obligation to article 1-1, I, 2. Most
   *  commercial sources online still give the old number. Nothing had ever
   *  rendered this regime, which is the only reason the wrong citation never
   *  reached a client. Full verified text and reasoning:
   *  docs/rules/obligation-basis.md section 8bis.
   *
   *  sanctionCeiling stays deliberately unverified and has no render path.
   *  The pre-SREN penalty sat in article 6-VI-2 and this pass did not
   *  confirm where it now sits; docs/rules/obligation-basis.md section 9 tracks
   *  that. Stating a sanction amount for a specific client is separately
   *  forbidden by CLAUDE.md rule 6 regardless, so nothing is blocked on it. */
  [LCEN_MENTIONS_LEGALES_REGIME_ID]: {
    id: LCEN_MENTIONS_LEGALES_REGIME_ID,
    name: bilingual(
      "Obligation d'identification de l'éditeur d'un site",
      'Website publisher identification obligation',
    ),
    thresholdDescription: bilingual(
      "Toute personne dont l'activité est d'éditer un service de communication au public en ligne met à la disposition du public sa dénomination ou sa raison sociale, son siège social, son numéro de téléphone et, si elle est inscrite au registre du commerce et des sociétés ou au registre national des entreprises, son numéro d'inscription. Cette obligation ne dépend ni de la taille ni du secteur de l'entreprise.",
      'Any person whose activity is to publish an online public communication service must make available to the public its company name, registered office, telephone number and, if it is entered in the trade and companies register or the national business register, its registration number. This obligation depends on neither the size nor the sector of the business.',
    ),
    authority: bilingual(
      'Direction générale de la concurrence, de la consommation et de la répression des fraudes (DGCCRF)',
      "France's consumer protection authority (DGCCRF, Direction générale de la concurrence, de la consommation et de la répression des fraudes)",
    ),
    authorityPrefixFr: 'de la',
    sanctionCeiling: bilingual(
      'Non vérifié après la restructuration de la LCEN par la loi n. 2024-449 (ne pas citer)',
      'Not verified following the restructuring of the LCEN by loi n. 2024-449 (do not cite)',
    ),
    legalCitation: bilingual(
      'loi n° 2004-575 du 21 juin 2004 (LCEN), article 1-1, I, 2° (version en vigueur depuis le 23 mai 2024)',
      'French Law No. 2004-575 of 21 June 2004 (LCEN), article 1-1, I, 2° (version in force since 23 May 2024)',
    ),
  },
};

export const REGIME_TABLE: Record<string, Regime> = Object.fromEntries(
  Object.entries(REGIME_DEFINITIONS).map(([id, def]) => [
    id,
    {
      id: def.id,
      name: def.name.fr,
      thresholdDescription: def.thresholdDescription.fr,
      authority: def.authority.fr,
      authorityPrefixFr: def.authorityPrefixFr,
      sanctionCeiling: def.sanctionCeiling.fr,
      legalCitation: def.legalCitation.fr,
    },
  ]),
);

/** Language-aware accessor. packages/report reads regime text through
 *  this, never through REGIME_TABLE directly, so a new language only
 *  needs a change here plus a new column in REGIME_DEFINITIONS. */
export function getRegime(regimeId: string, language: ReportLanguage): Regime | undefined {
  const def = REGIME_DEFINITIONS[regimeId];
  if (!def) return undefined;
  return {
    id: def.id,
    name: def.name[language],
    thresholdDescription: def.thresholdDescription[language],
    authority: def.authority[language],
    authorityPrefixFr: def.authorityPrefixFr,
    sanctionCeiling: def.sanctionCeiling[language],
    legalCitation: def.legalCitation[language],
  };
}
