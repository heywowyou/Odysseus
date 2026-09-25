import type { ObligationAssessment, ReportLanguage } from '@odysseus/core';

const EFFECTIF_BAND_LABELS_EN: Readonly<Record<string, string>> = {
  NN: 'an unreported headcount',
  '00': '0 employees',
  '01': '1 to 2 employees',
  '02': '3 to 5 employees',
  '03': '6 to 9 employees',
  '11': '10 to 19 employees',
  '12': '20 to 49 employees',
  '21': '50 to 99 employees',
  '22': '100 to 199 employees',
  '31': '200 to 249 employees',
  '32': '250 to 499 employees',
  '41': '500 to 999 employees',
  '42': '1,000 to 1,999 employees',
  '51': '2,000 to 4,999 employees',
  '52': '5,000 to 9,999 employees',
  '53': '10,000 employees or more',
};

/** INSEE's French wording per code, hand-synced with packages/interface's
 *  sirene-client.ts for the same reason the English table above is. */
const EFFECTIF_BAND_LABELS_FR: Readonly<Record<string, string>> = {
  '00': '0 salarié',
  '01': '1 à 2 salariés',
  '02': '3 à 5 salariés',
  '03': '6 à 9 salariés',
  '11': '10 à 19 salariés',
  '12': '20 à 49 salariés',
  '21': '50 à 99 salariés',
  '22': '100 à 199 salariés',
  '31': '200 à 249 salariés',
  '32': '250 à 499 salariés',
  '41': '500 à 999 salariés',
  '42': '1 000 à 1 999 salariés',
  '51': '2 000 à 4 999 salariés',
  '52': '5 000 à 9 999 salariés',
  '53': '10 000 salariés et plus',
};

/** The headcount as a noun phrase for a registry-fact sentence. A real
 *  report printed "la tranche d'effectif 00" to a hotel director: the INSEE
 *  code means nothing to a lay reader, its label does. */
export function effectifPhrase(code: string, language: ReportLanguage): string {
  if (language === 'fr') {
    if (code === 'NN') return 'un effectif non renseigné';
    const label = EFFECTIF_BAND_LABELS_FR[code];
    return label === undefined ? `la tranche d’effectif ${code}` : `un effectif de ${label}`;
  }
  if (code === 'NN') return 'an unreported headcount';
  const label = EFFECTIF_BAND_LABELS_EN[code];
  return label === undefined ? `headcount band ${code}` : `a headcount of ${label}`;
}

export function translateEffectifLabel(
  code: string | undefined,
  frenchLabel: string | null | undefined,
  language: ReportLanguage,
): string {
  if (language === 'fr') return frenchLabel ?? 'tranche d’effectif déclarée dans Sirene';
  if (code !== undefined) return EFFECTIF_BAND_LABELS_EN[code] ?? 'a Sirene headcount band';
  return 'a Sirene headcount band';
}

export function effectifCodeFromAssessment(
  assessment: ObligationAssessment | undefined,
): string | undefined {
  for (const basis of assessment?.basis ?? []) {
    const fact = basis.facts.find((item) => item.kind === 'effectif-band');
    if (fact?.kind === 'effectif-band') return fact.code;
  }
  return undefined;
}
