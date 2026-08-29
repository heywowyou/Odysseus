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
