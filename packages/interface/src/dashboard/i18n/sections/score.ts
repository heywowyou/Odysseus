export interface ScoreStrings {
  totalLabel: string;
  computedAtLabel: string;
  breakdownHeading: string;
  breakdownColumns: { component: string; value: string };
  componentLabels: Record<
    | 'render-gap'
    | 'booking-failure'
    | 'axe-critical'
    | 'axe-serious'
    | 'console-errors'
    | 'metrics'
    | 'direct-booking'
    | 'star-rating'
    | 'capacity'
    | 'effectif'
    | 'independence',
    string
  >;
  diffHeading: string;
  diffColumns: { field: string; before: string; after: string };
  diffFromLabel: string;
  diffToLabel: string;
  /** Issue #199: shown instead of the score breakdown when a selected
   *  hotel holds no score at the current version (a hand-added hotel
   *  before its first scan). */
  notScoredHeading: string;
  notScoredBody: string;
  /** Issue #201: shown instead of notScoredBody when the hub can offer
   *  the quick-check action directly (no prescan at all yet). */
  notScoredBodyWithAction: string;
  runQuickCheckAction: string;
}

export const score = {
  fr: {
    totalLabel: 'Total',
    computedAtLabel: 'Calculé le',
    breakdownHeading: 'Décomposition',
    breakdownColumns: {
      component: 'Critère',
      value: 'Valeur',
    },
    componentLabels: {
      'render-gap': 'Écart de rendu',
      'booking-failure': 'Échec de réservation',
      'axe-critical': 'Défauts critiques',
      'axe-serious': 'Défauts sérieux',
      'console-errors': 'Erreurs de script',
      metrics: 'Performance mesurée',
      'direct-booking': 'Réservation directe',
      'star-rating': 'Nombre d’étoiles',
      capacity: 'Capacité d’accueil',
      effectif: 'Effectif',
      independence: 'Indépendance',
    },
    diffHeading: 'Différence entre versions',
    diffColumns: { field: 'Champ', before: 'Avant', after: 'Après' },
    diffFromLabel: 'Version de départ',
    diffToLabel: 'Version d’arrivée',
    notScoredHeading: 'Pas encore scoré',
    notScoredBody:
      'Cet hôtel est dans la sélection mais n’a aucun score à la version de scoring courante. Un hôtel reçoit son score dès qu’il a un préscan et une qualification à jour ; pour un hôtel ajouté à la main, lancez d’abord ces passages.',
    notScoredBodyWithAction:
      'Cet hôtel est dans la sélection mais n’a aucun score à la version de scoring courante. Lancez une vérification rapide ci-dessous pour lui donner son premier préscan, ce qui déclenche son score.',
    runQuickCheckAction: 'Lancer une vérification rapide',
  },
  en: {
    totalLabel: 'Total',
    computedAtLabel: 'Computed at',
    breakdownHeading: 'Breakdown',
    breakdownColumns: { component: 'Criterion', value: 'Value' },
    componentLabels: {
      'render-gap': 'Render gap',
      'booking-failure': 'Booking failure',
      'axe-critical': 'Critical defects',
      'axe-serious': 'Serious defects',
      'console-errors': 'Script errors',
      metrics: 'Measured performance',
      'direct-booking': 'Direct booking',
      'star-rating': 'Star rating',
      capacity: 'Guest capacity',
      effectif: 'Staff size',
      independence: 'Independence',
    },
    diffHeading: 'Changes between versions',
    diffColumns: { field: 'Field', before: 'Before', after: 'After' },
    diffFromLabel: 'From version',
    diffToLabel: 'To version',
    notScoredHeading: 'Not scored yet',
    notScoredBody:
      'This hotel is in the selection but holds no score at the current scoring version. A hotel gets its score once it has a current prescan and qualification; run those passes first for a hotel added by hand.',
    notScoredBodyWithAction:
      'This hotel is in the selection but holds no score at the current scoring version. Run a quick check below to give it its first prescan, which starts its score.',
    runQuickCheckAction: 'Run quick check',
  },
} satisfies { fr: ScoreStrings; en: ScoreStrings };
