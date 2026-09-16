export interface ProspectsStrings {
  title: string;
  description: string;
  queueLabel: string;
  /** Placeholder and accessible name of the prospect search box. */
  searchPlaceholder: string;
  queues: Record<
    'all' | 'joinReview' | 'parked' | 'rejected' | 'alreadyEngaged' | 'groups',
    string
  >;
  filters: {
    identityStatus: string;
    groupStatus: string;
    reviewState: string;
    qualification: string;
    all: string;
  };
  /** Plan 041 slice B1: the toggle between the actionable wave (the
   *  default) and the whole catalogue. */
  selectionFilter: {
    label: string;
    selected: string;
    all: string;
  };
  columns: {
    name: string;
    city: string;
    identity: string;
    group: string;
    qualification: string;
    review: string;
    contact: string;
    thread: string;
    outcome: string;
    /** Plan 041 slice B1: the wave column, membership only. */
    selection: string;
    actions: string;
  };
  /** Plan 041 slice B1's wave column cell text and its info tip. `rank`
   *  interpolates the selection rank when the record carries one. */
  selectionValues: {
    inSelectionWithRank: string;
    inSelectionNoRank: string;
    notInSelection: string;
  };
  /** {selected}/{scored}/{total} counts above the list, so the
   *  catalogue's size is stated rather than discovered by paging. */
  selectionCountLine: string;
  /** Plan 043 slice 3: the row-level wave add and the read-only
   *  selection overview (the formula's cohorts and the active roster). */
  addRowAction: string;
  /** Issue #199: a selected row without a score states that, instead of
   *  a dash that reads as "no problems". */
  notScoredCell: string;
  selectionOverview: {
    show: string;
    hide: string;
    cohortsTitle: string;
    cohortsEmpty: string;
    rosterTitle: string;
    rosterEmpty: string;
    columns: {
      version: string;
      kind: string;
      date: string;
      population: string;
      selected: string;
      cutoffs: string;
      wave: string;
      hotel: string;
      actor: string;
    };
    kind: Record<'selected' | 'calibration', string>;
  };
  filterEmpty: string;
}

export const prospects = {
  fr: {
    title: 'Prospects',
    description: 'Revue de la liste d’hôtels, des données de contact jusqu’aux emails.',
    queueLabel: 'Listes',
    searchPlaceholder: 'Rechercher par nom, ville ou code postal…',
    queues: {
      all: 'Tous les prospects',
      joinReview: 'Identité à vérifier',
      parked: 'Mis de côté',
      rejected: 'Rejetés',
      alreadyEngaged: 'Déjà démarchés',
      groups: 'Groupes',
    },
    filters: {
      identityStatus: 'Statut d’identité',
      groupStatus: 'Statut de groupe',
      reviewState: 'État de vérification',
      qualification: 'Qualification',
      all: 'Tous',
    },
    selectionFilter: {
      label: 'Sélection',
      selected: 'Dans la sélection',
      all: 'Tout le catalogue',
    },
    columns: {
      name: 'Hôtel',
      city: 'Ville',
      identity: 'Identité',
      group: 'Groupe',
      qualification: 'Qualification',
      review: 'Vérification',
      contact: 'Contact',
      thread: 'Emails',
      outcome: 'Résultat',
      selection: 'Vague',
      actions: 'Actions',
    },
    selectionValues: {
      inSelectionWithRank: 'Dans la sélection (rang {rank})',
      inSelectionNoRank: 'Dans la sélection',
      notInSelection: 'Hors sélection',
    },
    selectionCountLine: '{selected} dans la sélection, {scored} scorés, {total} au catalogue',
    addRowAction: '+ Vague',
    notScoredCell: 'Non scoré',
    selectionOverview: {
      show: 'Voir la sélection',
      hide: 'Masquer la sélection',
      cohortsTitle: 'Dernières sélections',
      cohortsEmpty: "Aucune sélection enregistrée : la formule n'a pas encore été lancée.",
      rosterTitle: 'Vagues actives',
      rosterEmpty: 'Aucune entrée de vague active.',
      columns: {
        version: 'Version',
        kind: 'Type',
        date: 'Date',
        population: 'Population',
        selected: 'Retenus',
        cutoffs: 'Seuils',
        wave: 'Vague',
        hotel: 'Hôtel',
        actor: 'Décidé par',
      },
      kind: {
        selected: 'Retenue',
        calibration: 'Calibrage',
      },
    },
    filterEmpty: 'Aucun prospect ne correspond à ces filtres.',
  },
  en: {
    title: 'Prospects',
    description: 'Review the hotel list, from contact data to emails.',
    queueLabel: 'Lists',
    searchPlaceholder: 'Search by name, city, or postcode…',
    queues: {
      all: 'All prospects',
      joinReview: 'Identity to check',
      parked: 'On hold',
      rejected: 'Rejected',
      alreadyEngaged: 'Already engaged',
      groups: 'Groups',
    },
    filters: {
      identityStatus: 'Identity status',
      groupStatus: 'Group status',
      reviewState: 'Verification status',
      qualification: 'Qualification',
      all: 'All',
    },
    selectionFilter: {
      label: 'Selection',
      selected: 'In selection',
      all: 'Whole catalogue',
    },
    columns: {
      name: 'Hotel',
      city: 'City',
      identity: 'Identity',
      group: 'Group',
      qualification: 'Qualification',
      review: 'Verification',
      contact: 'Contact',
      thread: 'Emails',
      outcome: 'Outcome',
      selection: 'Wave',
      actions: 'Actions',
    },
    selectionValues: {
      inSelectionWithRank: 'In selection (rank {rank})',
      inSelectionNoRank: 'In selection',
      notInSelection: 'Not in selection',
    },
    selectionCountLine: '{selected} in selection, {scored} scored, {total} in catalogue',
    addRowAction: '+ Wave',
    notScoredCell: 'Not scored',
    selectionOverview: {
      show: 'View selection',
      hide: 'Hide selection',
      cohortsTitle: 'Recent selections',
      cohortsEmpty: 'No selection recorded yet: the formula has not been run.',
      rosterTitle: 'Active waves',
      rosterEmpty: 'No active wave entries.',
      columns: {
        version: 'Version',
        kind: 'Kind',
        date: 'Date',
        population: 'Population',
        selected: 'Selected',
        cutoffs: 'Cutoffs',
        wave: 'Wave',
        hotel: 'Hotel',
        actor: 'Decided by',
      },
      kind: {
        selected: 'Selected',
        calibration: 'Calibration',
      },
    },
    filterEmpty: 'No prospects match these filters.',
  },
} satisfies { fr: ProspectsStrings; en: ProspectsStrings };
