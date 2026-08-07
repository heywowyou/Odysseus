/**
 * Static regime data, deliberately separate from assessObligations.ts's
 * branching logic - the same split severity.ts already uses between
 * CUSTOM_CHECK_SEVERITY (a data table) and severityFromCustom (a lookup
 * function). Adding a regime, or correcting a citation, means editing
 * this file only.
 *
 * name/thresholdDescription are bilingual because they are prose read
 * directly by a client in the report (see packages/report's
 * legalCitation*Template fields). authority and legalCitation are kept
 * as single canonical strings: official body names and law citations are
 * conventionally left in their original French form even inside an
 * English report, the same way a case citation is not translated.
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
export const SIRENE_TURNOVER_RELIABLE_EFFECTIF_CODES: readonly string[] = ['NN', '00', '01', '02', '03'];

interface Bilingual {
  fr: string;
  en: string;
}

function bilingual(fr: string, en: string): Record<ReportLanguage, string> {
  return { fr, en };
}

interface RegimeDefinition extends Omit<Regime, 'name' | 'thresholdDescription' | 'sanctionCeiling'> {
  name: Bilingual;
  thresholdDescription: Bilingual;
  sanctionCeiling: Bilingual;
}

const REGIME_DEFINITIONS: Record<string, RegimeDefinition> = {
  [EAA_REGIME_ID]: {
    id: EAA_REGIME_ID,
    name: bilingual(
      "Obligation d'accessibilité numérique (loi n° 2023-171, transposant l'European Accessibility Act)",
      'Digital accessibility obligation (loi n° 2023-171, transposing the European Accessibility Act)',
    ),
    thresholdDescription: bilingual(
      "S'applique aux entreprises de 10 salariés ou plus, ou dont le chiffre d'affaires ou le total de bilan annuel dépasse 2 000 000 €, lorsque le site propose un parcours transactionnel B2C de premier niveau (réservation, panier, paiement).",
      'Applies to companies with 10 or more employees, or with annual turnover or balance sheet total above EUR 2,000,000, when the site offers a first party B2C transactional flow (booking, cart, checkout).',
    ),
    authority: 'Direction générale de la concurrence, de la consommation et de la répression des fraudes (DGCCRF)',
    sanctionCeiling: bilingual(
      "Jusqu'à 50 000 € d'amende administrative par manquement constaté (à vérifier contre le décret en vigueur avant toute mention client)",
      'Up to EUR 50,000 in administrative fines per confirmed breach (verify against the current decree before any client facing use)',
    ),
    legalCitation: 'Loi n° 2023-171 du 9 mars 2023, articles 16 à 19',
  },
  [ARTICLE_47_REGIME_ID]: {
    id: ARTICLE_47_REGIME_ID,
    name: bilingual(
      "Obligation d'accessibilité des services de communication publique en ligne (article 47, loi n° 2005-102)",
      'Public online communication accessibility obligation (article 47, loi n° 2005-102)',
    ),
    thresholdDescription: bilingual(
      "S'applique aux personnes morales de droit privé dont le chiffre d'affaires annuel dépasse 250 000 000 €, indépendamment de toute autre condition d'effectif ou de secteur.",
      'Applies to private law entities with annual turnover above EUR 250,000,000, independently of any headcount or sector condition.',
    ),
    authority: 'Défenseur des droits',
    sanctionCeiling: bilingual(
      'Sanction administrative dont le montant est fixé par décret (à vérifier avant toute mention client)',
      'Administrative sanction with an amount set by decree (verify before any client facing use)',
    ),
    legalCitation: 'Loi n° 2005-102 du 11 février 2005, article 47',
  },
  [LCEN_MENTIONS_LEGALES_REGIME_ID]: {
    id: LCEN_MENTIONS_LEGALES_REGIME_ID,
    name: bilingual(
      'Obligation de mentions légales (LCEN, article 6-III)',
      'Legal notice disclosure obligation (LCEN, article 6-III)',
    ),
    thresholdDescription: bilingual(
      'Toute personne exerçant une activité professionnelle en ligne doit publier son numéro SIREN ou RCS, indépendamment de sa taille ou de son secteur.',
      'Any person conducting an online professional activity must publish its SIREN or RCS number, independently of its size or sector.',
    ),
    authority: 'Direction générale de la concurrence, de la consommation et de la répression des fraudes (DGCCRF)',
    sanctionCeiling: bilingual(
      "Jusqu'à un an d'emprisonnement et 75 000 € d'amende pour une personne physique, montant porté à cinq fois ce plafond pour une personne morale (à vérifier avant toute mention client)",
      'Up to one year of imprisonment and a EUR 75,000 fine for an individual, up to five times that ceiling for a legal entity (verify before any client facing use)',
    ),
    legalCitation: 'Loi n° 2004-575 du 21 juin 2004, article 6-III et 6-VI-2',
  },
};

export const REGIME_TABLE: Record<string, Regime> = Object.fromEntries(
  Object.entries(REGIME_DEFINITIONS).map(([id, def]) => [
    id,
    {
      id: def.id,
      name: def.name.fr,
      thresholdDescription: def.thresholdDescription.fr,
      authority: def.authority,
      sanctionCeiling: def.sanctionCeiling.fr,
      legalCitation: def.legalCitation,
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
    authority: def.authority,
    sanctionCeiling: def.sanctionCeiling[language],
    legalCitation: def.legalCitation,
  };
}
