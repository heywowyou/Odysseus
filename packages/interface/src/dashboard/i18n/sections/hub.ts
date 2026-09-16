export interface HubStrings {
  /** Accessible name of the pipeline strip. */
  pipelineLabel: string;
  steps: Record<
    'fiche' | 'quick-check' | 'audit' | 'report' | 'preview' | 'emails' | 'outcome',
    string
  >;
  stepStates: Record<'done' | 'active' | 'todo' | 'blocked' | 'stale' | 'refreshing', string>;
  /** The header's one primary action, chosen by state (review and the
   *  terminal refusal excepted: review reuses operator.accept, a refusal
   *  is a sentence, not a button). */
  primary: {
    startScan: string;
    seeProgress: string;
    createFirstEmail: string;
    reviewDraft: string;
    prepareFollowUp: string;
    recordOutcome: string;
  };
  /** Where the primary button would sit when the scan stage refused:
   *  one plain sentence per typed reason, untranslated codes never
   *  shown. */
  scanRefusedLabel: string;
  scanRefusals: Record<
    | 'candidate-unknown'
    | 'no-own-domain'
    | 'not-selected'
    | 'cohort-not-approved'
    | 'not-qualified'
    | 'qualification-not-current'
    | 'domain-mismatch'
    | 'suppressed'
    | 'already-in-flight',
    string
  >;
  /** Plan 041 slice B1: the factual "why" shown beside a 'not-selected'
   *  refusal, read from the same selection verdict the list's wave
   *  column uses. Never a client-specific conclusion, only the recorded
   *  criteria and numbers. */
  selectionVerdict: {
    /** {ability}, {abilityCutoff}, {brokenness}, {brokennessCutoff},
     *  {date}: this hotel's own score against the newest cohort's
     *  cutoffs. */
    belowCutoff: string;
    /** No score exists yet for this hotel. */
    notScored: string;
  };
  fiche: {
    starsLabel: string;
    roomsLabel: string;
    capacityLabel: string;
    /** Disclosure holding the internal identifiers and version codes. */
    technicalDetails: string;
    hideTechnicalDetails: string;
    recheckQualificationAction: string;
    recheckQualificationQualified: string;
    /** {reason} interpolates the rejection reason code. */
    recheckQualificationStillRejected: string;
    recheckQualificationFailed: string;
    /** Issue #237. */
    qualificationOverrideBadge: string;
    qualificationOverrideAction: string;
    qualificationOverrideRemoveAction: string;
    qualificationOverrideSucceeded: string;
    qualificationOverrideFailed: string;
    qualificationOverrideRemoveSucceeded: string;
    qualificationOverrideRemoveFailed: string;
  };
  quickCheck: {
    empty: string;
    metricsDisclosure: string;
    hideMetrics: string;
    metricsColumns: {
      page: string;
      lcp: string;
      cls: string;
      blocking: string;
      requests: string;
    };
    /** Issue #217: the stale-pipeline banner and its recovery action,
     *  shown whenever qualification, quick check, or score names an
     *  older pipeline version than the one currently running. */
    staleNotice: string;
    refreshAction: string;
    refreshQueued: string;
    refreshFailed: string;
  };
  audit: {
    empty: string;
    running: string;
    openAudit: string;
    stageLabel: string;
    /** Plan 042 slice 2: the audit picker (shown once the hotel has
     *  more than one audit) and the standalone-view note beside the
     *  open-audit link. */
    pickerLabel: string;
    standaloneHint: string;
    /** Plan 044: the paid deliverable scan's launch on this tab. */
    launchFullAudit: string;
    launchQueued: string;
    launchRefusals: Record<'no-own-domain' | 'already-in-flight', string>;
  };
  /** Plan 042 slice 3: the paid report chain's tab, visible once the
   *  hotel is sold (outcome `won`) or revealed manually from the Audit
   *  tab - view state only, nothing stored. */
  /** Plan 043: the wave roster's controls - the add/remove mutations on
   *  the hub and the list, their dialog copy, and one sentence per typed
   *  refusal the store can answer. */
  wave: {
    addAction: string;
    removeAction: string;
    dialogTitleAdd: string;
    dialogTitleRemove: string;
    /** {hotelName} is never inside these: the dialog shows the name as
     *  its own line above the body. */
    dialogBodyAdd: string;
    dialogBodyRemove: string;
    waveLabel: string;
    confirmAdd: string;
    confirmRemove: string;
    /** {wave} is the wave name the operator confirmed. */
    addedToast: string;
    removedToast: string;
    /** The Fiche line for a roster-sourced hotel: {wave}, {date},
     *  {actor}. */
    rosterLine: string;
    refusals: Record<
      | 'already-on-roster'
      | 'no-cohort'
      | 'no-own-domain'
      | 'domain-unknown'
      | 'candidate-unknown'
      | 'not-on-roster',
      string
    >;
    /** Issue #199: one sentence per add-time scoring outcome, shown as
     *  the added toast's second line. */
    scoring: Record<'scored' | 'alreadyScored' | 'notScoreable', string>;
  };
  emails: {
    /** {n} is the follow-up number: Relance 1, Relance 2. */
    followUpName: string;
    firstEmailName: string;
    /** Badge for a draft that also exists in the operator's mailbox
     *  (approved IA vocabulary: no raw provider code on screen). */
    providerDraft: string;
    needsReviewNotice: string;
    /** Issue #186: clears the reply's needs-review flag; recording an
     *  outcome does not do this on its own. */
    markReviewed: string;
    noPendingDraft: string;
    firstEmailBlockedPendingDraft: string;
    firstEmailBlockedThreadStarted: string;
  };
  outcome: {
    formHeading: string;
    outcomeLabel: string;
    lostReasonLabel: string;
    submit: string;
    recorded: string;
    optOutConfirmTitle: string;
    optOutConfirmBody: string;
    optOutDone: string;
    actionError: string;
    /** Issue #184: the Résultat tab's empty state before a thread exists,
     *  replacing the generic "no outcome" line with the actual reason and
     *  a link to where the operator would start one. */
    noThreadYet: string;
    goToEmails: string;
  };
}

export const hub = {
  fr: {
    pipelineLabel: 'Parcours',
    steps: {
      fiche: 'Fiche',
      'quick-check': 'Contrôle rapide',
      audit: 'Audit',
      report: 'Rapport client',
      preview: 'Aperçu',
      emails: 'Emails',
      outcome: 'Résultat',
    },
    stepStates: {
      done: 'Fait',
      active: 'En cours',
      todo: 'À faire',
      blocked: 'Bloqué',
      stale: 'Pas à jour',
      refreshing: 'Actualisation…',
    },
    primary: {
      startScan: "Lancer l'audit de prospection",
      seeProgress: 'Voir la progression',
      createFirstEmail: 'Créer le premier email',
      reviewDraft: 'Relire le brouillon',
      prepareFollowUp: 'Préparer la relance',
      recordOutcome: 'Enregistrer le résultat',
    },
    scanRefusedLabel: "Impossible de lancer l'analyse pour le moment :",
    scanRefusals: {
      'candidate-unknown': "Ce prospect n'existe plus dans le catalogue.",
      'no-own-domain': "Aucun site propre n'est rattaché à cet hôtel.",
      'not-selected': 'Cet hôtel ne fait pas partie de la sélection actuelle.',
      'cohort-not-approved': "La sélection n'a pas encore été approuvée.",
      'not-qualified': "Cet hôtel n'est pas qualifié pour la campagne.",
      'qualification-not-current':
        "La qualification n'est plus à jour ; relancez-la avant l'audit.",
      'domain-mismatch':
        'Ce site a changé de propriétaire ; la sélection ne correspond plus à cet hôtel.',
      suppressed: 'Cet hôtel est sur la liste de ne pas contacter.',
      'already-in-flight': 'Une analyse est déjà en cours pour cet hôtel.',
    },
    selectionVerdict: {
      belowCutoff:
        'Score de capacité {ability} (seuil {abilityCutoff}), score de casse {brokenness} (seuil {brokennessCutoff}), sélection du {date}.',
      notScored: 'Pas encore scoré.',
    },
    fiche: {
      starsLabel: 'Étoiles',
      roomsLabel: 'Chambres',
      capacityLabel: 'Capacité',
      technicalDetails: 'Détails techniques',
      hideTechnicalDetails: 'Masquer les détails techniques',
      recheckQualificationAction: 'Vérifier à nouveau',
      recheckQualificationQualified: 'Nouvelle vérification : hôtel désormais qualifié.',
      recheckQualificationStillRejected:
        "Nouvelle vérification effectuée : l'hôtel reste rejeté ({reason}).",
      recheckQualificationFailed: 'Impossible de relancer la vérification',
      qualificationOverrideBadge: 'Qualifié manuellement',
      qualificationOverrideAction: 'Qualifier manuellement',
      qualificationOverrideRemoveAction: "Retirer l'override",
      qualificationOverrideSucceeded: 'Hôtel qualifié manuellement.',
      qualificationOverrideFailed: 'Impossible de qualifier manuellement cet hôtel',
      qualificationOverrideRemoveSucceeded:
        'Override retiré : la vérification automatique fait à nouveau foi.',
      qualificationOverrideRemoveFailed: "Impossible de retirer l'override",
    },
    quickCheck: {
      empty: 'Pas encore de contrôle rapide pour cet hôtel.',
      metricsDisclosure: 'Métriques complètes',
      hideMetrics: 'Masquer les métriques complètes',
      metricsColumns: {
        page: 'Page',
        lcp: 'LCP',
        cls: 'CLS',
        blocking: 'Blocage',
        requests: 'Requêtes',
      },
      staleNotice:
        'Ces données ne sont plus à jour. Actualisez-les pour voir le résultat du pipeline actuel.',
      refreshAction: 'Actualiser les données du prospect',
      refreshQueued: 'Actualisation lancée',
      refreshFailed: "Impossible d'actualiser ce prospect",
    },
    audit: {
      empty: "Pas encore d'audit de prospection.",
      running: "L'audit de prospection est en cours.",
      openAudit: "Ouvrir l'audit",
      stageLabel: 'Étape du rapport client',
      pickerLabel: 'Audit affiché',
      standaloneHint:
        "Vue autonome : la page d'audit complète reste disponible, sans rien refaire ici.",
      launchFullAudit: 'Lancer un audit complet',
      launchQueued: 'Audit complet lancé.',
      launchRefusals: {
        'no-own-domain': "Aucun site propre n'est rattaché à cet hôtel.",
        'already-in-flight': 'Un scan de ce site est déjà en cours.',
      },
    },
    wave: {
      addAction: 'Ajouter à une vague',
      removeAction: 'Retirer de la vague',
      dialogTitleAdd: 'Ajouter à une vague',
      dialogTitleRemove: 'Retirer de la vague',
      dialogBodyAdd:
        "L'hôtel sera autorisé pour un audit de prospection dans cette vague, en plus de la sélection de la formule. La décision reste révocable à tout moment.",
      dialogBodyRemove:
        "L'hôtel ne sera plus autorisé par cette vague. La sélection de la formule, si elle le concerne, reste en vigueur.",
      waveLabel: 'Vague',
      confirmAdd: 'Ajouter',
      confirmRemove: 'Retirer',
      addedToast: 'Hôtel ajouté à la vague {wave}.',
      removedToast: 'Hôtel retiré de la vague {wave}.',
      rosterLine: 'Ajouté à la vague {wave} le {date} (par {actor}).',
      refusals: {
        'already-on-roster': "Cet hôtel est déjà sur la vague d'un actif.",
        'no-cohort':
          "Aucune sélection n'a encore été calculée : une sélection doit d'abord être calculée en dehors du tableau de bord, avant d'autoriser à la main.",
        'no-own-domain': "Aucun site propre n'est rattaché à cet hôtel.",
        'domain-unknown': "Cet hôtel n'existe plus dans le catalogue.",
        'candidate-unknown': "Cet hôtel n'existe plus dans le catalogue.",
        'not-on-roster': "Cet hôtel n'est pas sur cette vague.",
      },
      scoring: {
        scored: "Il vient d'être scoré.",
        alreadyScored: 'Il avait déjà un score courant.',
        notScoreable:
          "Il n'est pas encore scoré : il n'a ni préscan ni qualification à jour ; lancez d'abord ces passages.",
      },
    },
    emails: {
      firstEmailName: 'Premier email',
      followUpName: 'Relance {n}',
      providerDraft: 'Dans Gmail',
      needsReviewNotice: 'Une réponse est arrivée et attend votre relecture.',
      markReviewed: 'Marquer comme relue',
      noPendingDraft: 'Aucun brouillon en attente de relecture.',
      firstEmailBlockedPendingDraft: 'Un brouillon attend déjà d’être relu ci-dessous.',
      firstEmailBlockedThreadStarted: 'Le fil a déjà dépassé son premier contact.',
    },
    outcome: {
      formHeading: 'Enregistrer un résultat',
      outcomeLabel: 'Résultat',
      lostReasonLabel: 'Motif de la perte',
      submit: 'Enregistrer le résultat',
      recorded: 'Résultat enregistré.',
      optOutConfirmTitle: 'Ne plus contacter cet hôtel ?',
      optOutConfirmBody:
        "L'adresse rejoint la liste de ne pas contacter, chaque aperçu en ligne de cet hôtel est retiré immédiatement, et la conversation est fermée. Cette action est définitive.",
      optOutDone: 'Hôtel retiré des contacts.',
      actionError: "L'action a échoué. Essayez à nouveau.",
      noThreadYet: "Aucun email envoyé pour l'instant.",
      goToEmails: 'Aller à l’onglet Emails',
    },
  },
  en: {
    pipelineLabel: 'Pipeline',
    steps: {
      fiche: 'Record',
      'quick-check': 'Quick check',
      audit: 'Audit',
      report: 'Client report',
      preview: 'Preview',
      emails: 'Emails',
      outcome: 'Outcome',
    },
    stepStates: {
      done: 'Done',
      active: 'In progress',
      todo: 'To do',
      blocked: 'Blocked',
      stale: 'Out of date',
      refreshing: 'Refreshing',
    },
    primary: {
      startScan: 'Start the prospecting audit',
      seeProgress: 'View progress',
      createFirstEmail: 'Create the first email',
      reviewDraft: 'Review the draft',
      prepareFollowUp: 'Prepare the follow-up',
      recordOutcome: 'Record the outcome',
    },
    scanRefusedLabel: 'A scan cannot start right now:',
    scanRefusals: {
      'candidate-unknown': 'This prospect no longer exists in the catalogue.',
      'no-own-domain': 'No website of its own is attached to this hotel.',
      'not-selected': 'This hotel is not part of the current selection.',
      'cohort-not-approved': 'The selection has not been approved yet.',
      'not-qualified': 'This hotel does not qualify for the campaign.',
      'qualification-not-current':
        'The qualification is out of date; run it again before the audit.',
      'domain-mismatch': 'This site changed hands; the selection no longer matches this hotel.',
      suppressed: 'This hotel is on the do-not-contact list.',
      'already-in-flight': 'An audit is already running for this hotel.',
    },
    selectionVerdict: {
      belowCutoff:
        'Ability score {ability} (cutoff {abilityCutoff}), brokenness score {brokenness} (cutoff {brokennessCutoff}), selection of {date}.',
      notScored: 'Not scored yet.',
    },
    fiche: {
      starsLabel: 'Stars',
      roomsLabel: 'Rooms',
      capacityLabel: 'Capacity',
      technicalDetails: 'Technical details',
      hideTechnicalDetails: 'Hide technical details',
      recheckQualificationAction: 'Check again',
      recheckQualificationQualified: 'Rechecked: the hotel now qualifies.',
      recheckQualificationStillRejected: 'Rechecked: the hotel is still rejected ({reason}).',
      recheckQualificationFailed: 'Could not rerun the check',
      qualificationOverrideBadge: 'Manually qualified',
      qualificationOverrideAction: 'Mark as qualified',
      qualificationOverrideRemoveAction: 'Remove override',
      qualificationOverrideSucceeded: 'Hotel marked as qualified.',
      qualificationOverrideFailed: 'Could not mark this hotel as qualified',
      qualificationOverrideRemoveSucceeded:
        'Override removed: the automatic verdict is authoritative again.',
      qualificationOverrideRemoveFailed: 'Could not remove the override',
    },
    quickCheck: {
      empty: 'No quick check yet for this hotel.',
      metricsDisclosure: 'Full metrics',
      hideMetrics: 'Hide full metrics',
      metricsColumns: {
        page: 'Page',
        lcp: 'LCP',
        cls: 'CLS',
        blocking: 'Blocking',
        requests: 'Requests',
      },
      staleNotice: 'This data is out of date. Refresh it to see the current pipeline result.',
      refreshAction: 'Refresh prospect data',
      refreshQueued: 'Refresh started',
      refreshFailed: 'Could not refresh this prospect',
    },
    audit: {
      empty: 'No prospecting audit yet.',
      running: 'The prospecting audit is running.',
      openAudit: 'Open the audit',
      stageLabel: 'Client report stage',
      pickerLabel: 'Audit shown',
      standaloneHint:
        'Standalone view: the full audit page remains available; nothing here duplicates it.',
      launchFullAudit: 'Launch a full audit',
      launchQueued: 'Full audit launched.',
      launchRefusals: {
        'no-own-domain': 'No website of its own is attached to this hotel.',
        'already-in-flight': 'A scan of this site is already running.',
      },
    },
    wave: {
      addAction: 'Add to a wave',
      removeAction: 'Remove from the wave',
      dialogTitleAdd: 'Add to a wave',
      dialogTitleRemove: 'Remove from the wave',
      dialogBodyAdd:
        'The hotel will be authorized for a prospecting audit in this wave, beside the formula selection. The decision stays revocable at any time.',
      dialogBodyRemove:
        'The hotel will no longer be authorized by this wave. The formula selection, if it covers the hotel, stays in force.',
      waveLabel: 'Wave',
      confirmAdd: 'Add',
      confirmRemove: 'Remove',
      addedToast: 'Hotel added to wave {wave}.',
      removedToast: 'Hotel removed from wave {wave}.',
      rosterLine: 'Added to wave {wave} on {date} (by {actor}).',
      refusals: {
        'already-on-roster': 'This hotel is already on the wave as an active entry.',
        'no-cohort':
          'No selection has been computed yet: a selection must first be computed outside the dashboard, then authorize by hand.',
        'no-own-domain': 'No website of its own is attached to this hotel.',
        'domain-unknown': 'This hotel no longer exists in the catalogue.',
        'candidate-unknown': 'This hotel no longer exists in the catalogue.',
        'not-on-roster': 'This hotel is not on that wave.',
      },
      scoring: {
        scored: 'It was scored just now.',
        alreadyScored: 'It already held a current score.',
        notScoreable:
          'It is not scored yet: it has no current prescan or qualification, so run those passes first.',
      },
    },
    emails: {
      firstEmailName: 'First email',
      followUpName: 'Follow-up {n}',
      providerDraft: 'In Gmail',
      needsReviewNotice: 'A reply arrived and waits for your review.',
      markReviewed: 'Mark as reviewed',
      noPendingDraft: 'No draft is waiting for review.',
      firstEmailBlockedPendingDraft: 'A draft is already waiting for review below.',
      firstEmailBlockedThreadStarted: 'The thread has already moved past its first touch.',
    },
    outcome: {
      formHeading: 'Record an outcome',
      outcomeLabel: 'Outcome',
      lostReasonLabel: 'Reason lost',
      submit: 'Record the outcome',
      recorded: 'Outcome recorded.',
      optOutConfirmTitle: 'Opt this hotel out?',
      optOutConfirmBody:
        'The address joins the do-not-contact list, every live preview of this hotel is withdrawn immediately, and the conversation is closed. This cannot be undone.',
      optOutDone: 'Hotel opted out.',
      actionError: 'The action failed. Try again.',
      noThreadYet: 'No email sent yet.',
      goToEmails: 'Go to the Emails tab',
    },
  },
} satisfies { fr: HubStrings; en: HubStrings };
