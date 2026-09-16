export interface OutcomesStrings {
  title: string;
  description: string;
  summaryHeading: string;
  lostReasonsHeading: string;
  columns: { prospect: string; outcome: string; setAt: string };
  optOut: string;
  empty: string;
}

export const outcomes = {
  fr: {
    title: 'Résultats',
    description: 'Résultats définis par l’opérateur et agrégats de campagne.',
    summaryHeading: 'Synthèse',
    lostReasonsHeading: 'Motifs de perte',
    columns: { prospect: 'Prospect', outcome: 'Résultat', setAt: 'Défini le' },
    optOut: 'Retirer',
    empty: 'Aucun résultat enregistré pour l’instant.',
  },
  en: {
    title: 'Outcomes',
    description: 'Operator-set outcomes and their campaign aggregates.',
    summaryHeading: 'Summary',
    lostReasonsHeading: 'Lost reasons',
    columns: { prospect: 'Prospect', outcome: 'Outcome', setAt: 'Set at' },
    optOut: 'Opt out',
    empty: 'No outcomes recorded yet.',
  },
} satisfies { fr: OutcomesStrings; en: OutcomesStrings };
