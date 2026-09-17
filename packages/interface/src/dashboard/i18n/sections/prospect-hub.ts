export interface ProspectHubStrings {
  filters: {
    searchPlaceholder: string;
    searchAria: string;
    advanced: string;
    activeFilters: string;
    removeFilter: string;
    clearAll: string;
    sectorPlaceholder: string;
    sectorAria: string;
    starsAria: string;
    allStars: string;
    starOption: string;
    groupAria: string;
    allGroups: string;
    websiteAria: string;
    allWebsiteKinds: string;
    departmentPlaceholder: string;
    departmentAria: string;
    communePlaceholder: string;
    communeAria: string;
    postcodePlaceholder: string;
    postcodeAria: string;
    roomsMinPlaceholder: string;
    roomsMinAria: string;
    roomsMaxPlaceholder: string;
    roomsMaxAria: string;
    scanAria: string;
    allScans: string;
    withScan: string;
    withoutScan: string;
    activityAria: string;
    allActivity: string;
    activeOnly: string;
    inactiveOnly: string;
  };
  list: {
    eyebrow: string;
    title: string;
    description: string;
    newAction: string;
    addFromDirectory: string;
    newTitle: string;
    namePlaceholder: string;
    sectorPlaceholder: string;
    websitePlaceholder: string;
    emailPlaceholder: string;
    nameAria: string;
    sectorAria: string;
    websiteAria: string;
    emailAria: string;
    createAction: string;
    searchPlaceholder: string;
    searchAria: string;
    sectorFilterAria: string;
    statusFilterAria: string;
    starsFilterAria: string;
    groupFilterAria: string;
    websiteFilterAria: string;
    departmentPlaceholder: string;
    departmentAria: string;
    roomsMinPlaceholder: string;
    roomsMinAria: string;
    roomsMaxPlaceholder: string;
    roomsMaxAria: string;
    scanFilterAria: string;
    activityFilterAria: string;
    allStatuses: string;
    allStars: string;
    allGroups: string;
    allWebsiteKinds: string;
    allScans: string;
    withScan: string;
    withoutScan: string;
    allActivity: string;
    activeOnly: string;
    inactiveOnly: string;
    errorTitle: string;
    emptyTitle: string;
    emptyDescription: string;
    openDirectory: string;
    columns: { name: string; site: string; location: string; status: string; activity: string };
    unknown: string;
    notProvided: string;
    count: string;
    previous: string;
    next: string;
    starOption: string;
    viewAria: string;
    allView: string;
    resultsView: string;
    archivedView: string;
    archivedEmptyTitle: string;
    archivedEmptyDescription: string;
  };
  directory: {
    eyebrow: string;
    title: string;
    description: string;
    backToProspects: string;
    searchPlaceholder: string;
    searchAria: string;
    sectorAria: string;
    starsAria: string;
    groupAria: string;
    websiteAria: string;
    departmentPlaceholder: string;
    departmentAria: string;
    roomsMinPlaceholder: string;
    roomsMinAria: string;
    roomsMaxPlaceholder: string;
    roomsMaxAria: string;
    allStars: string;
    allGroups: string;
    allWebsiteKinds: string;
    columns: { select: string; name: string; site: string; location: string; property: string };
    count: string;
    addSelected: string;
    addOne: string;
    alreadyAdded: string;
    openProspect: string;
    archivedProspect: string;
    restoreProspect: string;
    notProvided: string;
    noFacets: string;
    errorTitle: string;
    previous: string;
    next: string;
    starOption: string;
    roomsOption: string;
    groupLabels: Record<string, string>;
    websiteKindLabels: Record<string, string>;
  };
  results: {
    eyebrow: string;
    title: string;
    description: string;
    errorTitle: string;
    emptyTitle: string;
    emptyDescription: string;
    columns: { prospect: string; status: string; outcome: string; site: string };
    statusAria: string;
    outcomeAria: string;
    outcomePlaceholder: string;
    statusLabels: Record<string, string>;
    outcomeLabels: Record<string, string>;
    unknownSite: string;
  };
  detail: {
    back: string;
    missing: string;
    missingDescription: string;
    emailPlaceholder: string;
    actorLabels: Record<string, string>;
    return: string;
    loading: string;
    record: string;
    origin: string;
    site: string;
    noSite: string;
    saveSite: string;
    email: string;
    addEmail: string;
    contactSuggestion: string;
    contactSuggestionSource: string;
    contactSuggestionAccept: string;
    actions: string;
    summary: string;
    editRecord: string;
    allActions: string;
    recommended: string;
    completed: string;
    noRecommendation: string;
    recommendationActions: Record<string, string>;
    recommendationReasons: Record<string, string>;
    quick: string;
    fullAudit: string;
    outcome: string;
    history: string;
    fullHistory: string;
    recentActivity: string;
    statusCorrection: string;
    statusCorrectionHint: string;
    websites: string;
    addWebsite: string;
    addWebsitePlaceholder: string;
    /** Issues #270/#271: contact correction controls. {url} / {address}. */
    contacts: {
      removeWebsite: string;
      setPrimaryWebsite: string;
      removeWebsiteTitle: string;
      removeWebsiteDescription: string;
      removeWebsitePrimaryNote: string;
      removeEmail: string;
      removeAndBlacklistEmail: string;
      useForOutreach: string;
      outreachRecipient: string;
      removeEmailTitle: string;
      removeEmailDescription: string;
      removeAndBlacklistTitle: string;
      removeAndBlacklistDescription: string;
      confirmRemove: string;
      confirmRemoveAndBlacklist: string;
      /** Named people at the business, with their position. */
      stakeholders: string;
      stakeholderName: string;
      stakeholderPosition: string;
      addStakeholder: string;
      /** {name} is replaced with the person's name. */
      editStakeholder: string;
      removeStakeholder: string;
      removeStakeholderTitle: string;
      removeStakeholderDescription: string;
      saveStakeholder: string;
    };
    emailList: string;
    notProvided: string;
    roomsSummary: string;
    archive: string;
    restore: string;
    archivedBadge: string;
    archivedNotice: string;
    archivedNoRecommendation: string;
    archiveTitle: string;
    archiveKeeps: string;
    archiveDeletes: string;
    archiveDeletesCounts: string;
    archiveRestoreNote: string;
    archiveBlockedByJob: string;
    archiveCleanupIncomplete: string;
    archiveCleanupPending: string;
    finishArchiveCleanup: string;
    dangerZone: string;
    deletePermanently: string;
    deletePermanentlyHint: string;
    deletePermanentlyTitle: string;
    deletePermanentlyIntro: string;
    deletePermanentlyWith: string;
    deletePermanentlyKeeps: string;
    deleteBlockedByJob: string;
    deletionImpactLabels: {
      audits: string;
      findings: string;
      analyses: string;
      reports: string;
      reportApprovals: string;
      previews: string;
      drafts: string;
      threads: string;
      outcomes: string;
      events: string;
      jobs: string;
      directoryEntries: string;
    };
    info: string;
    outreach: string;
    identity: string;
    name: string;
    sector: string;
    address: string;
    postcode: string;
    commune: string;
    department: string;
    phone: string;
    notes: string;
    /** Issue #289: prospect-level company identity, shown in the summary
     *  and editable in the record before any scan exists. */
    siren: string;
    tradingName: string;
    legalName: string;
    sirenInvalidError: string;
    saveDetails: string;
    preview: string;
    firstEmail: string;
    followUp: string;
    publishPreview: string;
    statusAria: string;
    ready: string;
    blocked: string;
    emailSection: string;
    noThread: string;
    threadState: string;
    draftLabel: string;
    draftCreated: string;
    previewPublished: string;
    previewLink: string;
    previewLinkUnavailable: string;
    copyPreviewLink: string;
    previewLinkCopied: string;
    previewExpires: string;
    revokePreview: string;
    confirmRevokePreview: string;
    previewRevoked: string;
    draftRecipient: string;
    draftBody: string;
    openPreview: string;
    openInMailbox: string;
    discardDraft: string;
    confirmDiscardDraft: string;
    draftDiscarded: string;
    noDraft: string;
    auditState: string;
    scanDate: string;
    olderDataVersion: string;
    eventLabel: string;
    noEvents: string;
    actionFailed: string;
    actionRefused: string;
    firstEmailCreated: string;
    followUpCreated: string;
    outcomeSaved: string;
    outreachLanguage: string;
    outreachLanguageHint: string;
    languageLabels: Record<'fr' | 'en', string>;
    outcomeRefused: string;
    optOutWithdrawn: string;
    detachAudit: string;
    confirmDetachAudit: string;
    auditDetached: string;
    originLabels: Record<string, string>;
    auditKindLabels: Record<string, string>;
    previewStatusLabels: Record<string, string>;
    refusalLabels: Record<string, string>;
    statusLabels: Record<string, string>;
    outcomeLabels: Record<string, string>;
    eventLabels: Record<string, string>;
    auditStateLabels: Record<string, string>;
  };
}

export const prospectHub = {
  fr: {
    filters: {
      searchPlaceholder: 'Rechercher',
      searchAria: 'Rechercher',
      advanced: 'Filtres ({count})',
      activeFilters: 'Filtres actifs',
      removeFilter: 'Retirer le filtre {filter}',
      clearAll: 'Tout effacer',
      sectorPlaceholder: 'Secteur',
      sectorAria: 'Filtrer par secteur',
      starsAria: 'Filtrer par étoiles',
      allStars: 'Toutes les étoiles',
      starOption: '{count} étoile(s)',
      groupAria: 'Filtrer par groupe',
      allGroups: 'Tous les groupes',
      websiteAria: 'Filtrer par type de site',
      allWebsiteKinds: 'Tous les sites',
      departmentPlaceholder: 'Département',
      departmentAria: 'Filtrer par département',
      communePlaceholder: 'Commune',
      communeAria: 'Filtrer par commune',
      postcodePlaceholder: 'Code postal',
      postcodeAria: 'Filtrer par code postal',
      roomsMinPlaceholder: 'Chambres min.',
      roomsMinAria: 'Nombre minimum de chambres',
      roomsMaxPlaceholder: 'Chambres max.',
      roomsMaxAria: 'Nombre maximum de chambres',
      scanAria: 'Filtrer par analyse',
      allScans: 'Toutes les analyses',
      withScan: 'Avec analyse',
      withoutScan: 'Sans analyse',
      activityAria: 'Filtrer par activité',
      allActivity: 'Actifs et inactifs',
      activeOnly: 'Actifs seulement',
      inactiveOnly: 'Inactifs seulement',
    },
    list: {
      eyebrow: 'Prospects',
      title: 'Prospects',
      description:
        'Les entreprises ajoutées à votre portefeuille, avec leur activité et leur historique.',
      newAction: 'Nouveau prospect',
      addFromDirectory: 'Ajouter depuis l’annuaire',
      newTitle: 'Nouveau prospect',
      namePlaceholder: 'Nom',
      sectorPlaceholder: 'Secteur',
      websitePlaceholder: 'https://exemple.fr',
      emailPlaceholder: 'contact@exemple.fr',
      nameAria: 'Nom du prospect',
      sectorAria: 'Secteur du prospect',
      websiteAria: 'Site du prospect',
      emailAria: 'Email du prospect',
      createAction: 'Créer le prospect',
      searchPlaceholder: 'Rechercher un prospect',
      searchAria: 'Rechercher un prospect',
      sectorFilterAria: 'Filtrer par secteur',
      statusFilterAria: 'Filtrer par statut',
      starsFilterAria: 'Filtrer par étoiles',
      groupFilterAria: 'Filtrer par groupe',
      websiteFilterAria: 'Filtrer par type de site',
      departmentPlaceholder: 'Département',
      departmentAria: 'Filtrer par département',
      roomsMinPlaceholder: 'Chambres min.',
      roomsMinAria: 'Nombre minimum de chambres',
      roomsMaxPlaceholder: 'Chambres max.',
      roomsMaxAria: 'Nombre maximum de chambres',
      scanFilterAria: 'Filtrer par analyse',
      activityFilterAria: 'Filtrer par activité',
      allStatuses: 'Tous les statuts',
      allStars: 'Toutes les étoiles',
      allGroups: 'Tous les groupes',
      allWebsiteKinds: 'Tous les sites',
      allScans: 'Toutes les analyses',
      withScan: 'Avec analyse',
      withoutScan: 'Sans analyse',
      allActivity: 'Actifs et inactifs',
      activeOnly: 'Actifs seulement',
      inactiveOnly: 'Inactifs seulement',
      errorTitle: 'Impossible de charger les prospects',
      emptyTitle: 'Aucun prospect',
      emptyDescription: 'Ajoutez une fiche depuis l’annuaire ou créez-la manuellement.',
      openDirectory: 'Ouvrir l’annuaire',
      columns: {
        name: 'Nom',
        site: 'Site',
        location: 'Lieu',
        status: 'Statut',
        activity: 'Activité',
      },
      unknown: 'Inconnu',
      notProvided: 'Non renseigné',
      count: '{count} prospect(s)',
      previous: 'Précédent',
      next: 'Suivant',
      starOption: '{count} étoile(s)',
      viewAria: 'Vue des prospects',
      allView: 'Tous les prospects',
      resultsView: 'Résultats',
      archivedView: 'Archivés',
      archivedEmptyTitle: 'Aucun prospect archivé',
      archivedEmptyDescription:
        'Un prospect archivé quitte le travail en cours. Ses coordonnées, son identité, ses notes et l’historique des échanges sont conservés ; ses fichiers de scan et ses rapports sont supprimés.',
    },
    directory: {
      eyebrow: 'Annuaire',
      title: 'Annuaire',
      description:
        'Le catalogue Atout France. Ajoutez les établissements qui deviennent vos prospects.',
      backToProspects: 'Prospects',
      searchPlaceholder: 'Rechercher dans l’annuaire',
      searchAria: 'Rechercher dans l’annuaire',
      sectorAria: 'Filtrer par secteur',
      starsAria: 'Filtrer par étoiles',
      groupAria: 'Filtrer par groupe',
      websiteAria: 'Filtrer par type de site',
      departmentPlaceholder: 'Département',
      departmentAria: 'Filtrer par département',
      roomsMinPlaceholder: 'Chambres min.',
      roomsMinAria: 'Nombre minimum de chambres',
      roomsMaxPlaceholder: 'Chambres max.',
      roomsMaxAria: 'Nombre maximum de chambres',
      allStars: 'Toutes les étoiles',
      allGroups: 'Tous les groupes',
      allWebsiteKinds: 'Tous les sites',
      columns: {
        select: 'Ajouter',
        name: 'Nom',
        site: 'Site',
        location: 'Lieu',
        property: 'Établissement',
      },
      count: '{count} établissement(s)',
      addSelected: 'Ajouter aux prospects ({count})',
      addOne: 'Ajouter {name}',
      alreadyAdded: 'Déjà ajouté',
      openProspect: 'Ouvrir le prospect',
      archivedProspect: 'Prospect archivé',
      restoreProspect: 'Restaurer le prospect',
      notProvided: 'Non renseigné',
      noFacets: 'Facettes non renseignées',
      errorTitle: 'Impossible de charger l’annuaire',
      previous: 'Précédent',
      next: 'Suivant',
      starOption: '{count} étoile(s)',
      roomsOption: '{count} chambres',
      groupLabels: {
        independent: 'Indépendant',
        'group-member': 'Membre d’un groupe',
        'vendor-hosted': 'Hébergé par un prestataire',
        unknown: 'Groupe inconnu',
      },
      websiteKindLabels: {
        own: 'Site propre',
        'vendor-hosted': 'Hébergé par un prestataire',
        unknown: 'Inconnu',
      },
    },
    results: {
      eyebrow: 'Prospects',
      title: 'Résultats',
      description: 'Un statut et un historique de résultat par prospect.',
      errorTitle: 'Impossible de charger les résultats',
      emptyTitle: 'Aucun prospect',
      emptyDescription: 'Ajoutez d’abord un prospect depuis l’annuaire.',
      columns: { prospect: 'Prospect', status: 'Statut', outcome: 'Résultat', site: 'Site' },
      statusAria: 'Statut de {name}',
      outcomeAria: 'Résultat de {name}',
      outcomePlaceholder: 'Enregistrer…',
      statusLabels: {
        new: 'Nouveau',
        audited: 'Audité',
        contacted: 'Contacté',
        'follow-up': 'Relance',
        replied: 'Réponse',
        call: 'Appel',
        quoted: 'Devis',
        won: 'Gagné',
        lost: 'Perdu',
        'opted-out': 'Désinscrit',
      },
      outcomeLabels: {
        'no-reply': 'Aucune réponse',
        'reply-positive': 'Réponse positive',
        'reply-not-now': 'Pas maintenant',
        'reply-negative': 'Réponse négative',
        'opt-out': 'Ne plus contacter',
        call: 'Appel',
        quoted: 'Devis',
        won: 'Gagné',
        lost: 'Perdu',
      },
      unknownSite: '—',
    },
    detail: {
      back: 'Prospects',
      missing: 'Prospect introuvable',
      missingDescription: 'Ce prospect n’existe pas ou a été supprimé.',
      emailPlaceholder: 'contact@exemple.fr',
      actorLabels: {
        operator: 'Opérateur',
        scanner: 'Analyse du site',
        automation: 'Automatisation',
        'public-opt-out': 'Demande d’opposition',
      },
      return: 'Retour aux prospects',
      loading: 'Chargement…',
      record: 'Fiche prospect',
      origin: 'Origine',
      site: 'Site principal',
      noSite: 'Aucun site rattaché',
      saveSite: 'Enregistrer le site',
      email: 'Email de contact',
      addEmail: 'Ajouter un email',
      contactSuggestion: 'Adresse publiée sur le site : {address}.',
      contactSuggestionSource: 'Voir la page source',
      contactSuggestionAccept: 'Utiliser cette adresse',
      actions: 'Actions',
      summary: 'Résumé',
      editRecord: 'Modifier la fiche',
      allActions: 'Toutes les actions',
      recommended: 'Prochaine action recommandée',
      completed: 'Prospect traité',
      noRecommendation: 'Aucune action recommandée pour le moment.',
      recommendationActions: {
        'review-audit': 'Confirmer les informations',
        'regenerate-report': 'Régénérer le rapport',
        'review-draft': 'Relire le brouillon',
        'record-outcome': 'Enregistrer le résultat',
        'create-follow-up': 'Rédiger la relance',
        'create-first-email': 'Rédiger le premier email',
        'prepare-audit': 'Lancer un scan complet',
        'review-prospect': 'Vérifier la fiche',
      },
      recommendationReasons: {
        'no-audit': 'Aucun scan complet exploitable n’est encore rattaché.',
        'audit-incomplete': 'Le dernier audit rattaché ne contient pas encore toutes ses données.',
        'audit-not-outreach-grade':
          'Le dernier audit rattaché est un contrôle rapide : il ne suffit pas pour prospecter. Lancez un scan complet.',
        suppressed: 'La prospection est bloquée par une adresse ou un domaine supprimé.',
        'no-contact': 'Ajoutez un email utilisable pour continuer.',
      },
      quick: 'Lancer un contrôle rapide',
      fullAudit: 'Lancer un scan complet',
      outcome: 'Enregistrer un résultat',
      history: 'Historique',
      fullHistory: 'Afficher tout l’historique',
      recentActivity: 'Activité récente',
      statusCorrection: 'Corriger manuellement le statut',
      statusCorrectionHint:
        'Cette correction manuelle ne remplace pas l’enregistrement d’un résultat.',
      websites: 'Sites rattachés',
      addWebsite: 'Ajouter un site',
      addWebsitePlaceholder: 'https://exemple.fr',
      contacts: {
        removeWebsite: 'Retirer le site {url}',
        setPrimaryWebsite: 'Définir comme site principal',
        removeWebsiteTitle: 'Retirer ce site ?',
        removeWebsiteDescription:
          '{url} ne sera plus rattaché à ce prospect. Les audits déjà rattachés restent liés ; détachez-les depuis leur page si besoin.',
        removeWebsitePrimaryNote: 'C’est le site principal : le site suivant le remplacera.',
        removeEmail: 'Retirer l’email {address}',
        removeAndBlacklistEmail: 'Retirer et bloquer',
        useForOutreach: 'Utiliser pour la prospection',
        outreachRecipient: 'Destinataire de la prospection',
        removeEmailTitle: 'Retirer cet email ?',
        removeEmailDescription:
          '{address} ne sera plus utilisé. Les brouillons non envoyés à cette adresse seront retirés ; l’historique envoyé reste intact. Retirer n’est pas bloquer : l’adresse pourra être ajoutée à nouveau.',
        removeAndBlacklistTitle: 'Retirer et bloquer cet email ?',
        removeAndBlacklistDescription:
          '{address} sera retiré et ajouté à la liste d’opposition : plus aucune prospection ne lui sera adressée. À utiliser quand la personne s’y est opposée.',
        confirmRemove: 'Retirer',
        confirmRemoveAndBlacklist: 'Retirer et bloquer',
        stakeholders: 'Interlocuteurs',
        stakeholderName: 'Nom',
        stakeholderPosition: 'Poste',
        addStakeholder: 'Ajouter un interlocuteur',
        editStakeholder: 'Modifier {name}',
        removeStakeholder: 'Retirer {name}',
        removeStakeholderTitle: 'Retirer cet interlocuteur ?',
        removeStakeholderDescription: '{name} ne sera plus rattaché à ce prospect.',
        saveStakeholder: 'Enregistrer',
      },
      emailList: 'Emails rattachés',
      notProvided: 'Non renseigné',
      roomsSummary: '{count} chambres',
      archive: 'Archiver le prospect',
      restore: 'Restaurer le prospect',
      archivedBadge: 'Archivé',
      archivedNotice:
        'Prospect archivé le {date}. Ses contacts, notes et échanges sont conservés, ses scans et rapports ont été supprimés ; restaurez-le pour le remettre dans le travail en cours.',
      archivedNoRecommendation: 'Prospect archivé : aucune action recommandée.',
      archiveTitle: 'Archiver ce prospect ?',
      archiveKeeps:
        'Les coordonnées, l’identité de l’entreprise, les notes et l’historique des échanges sont conservés.',
      archiveDeletes:
        'Ses scans, constats, rapports et fichiers associés seront définitivement supprimés.',
      archiveDeletesCounts:
        'Ses scans, constats, rapports et fichiers associés seront définitivement supprimés : {impact}.',
      archiveRestoreNote: 'Restaurer le prospect plus tard ne restaurera pas ces audits.',
      archiveBlockedByJob:
        'Un scan de ce prospect est encore en cours. Annulez-le ou attendez sa fin, puis archivez.',
      archiveCleanupIncomplete:
        'Le prospect est archivé, mais certains fichiers de scan n’ont pas pu être supprimés. Relancez la suppression pour terminer.',
      archiveCleanupPending:
        'Ce prospect archivé conserve encore des scans : leur suppression ne s’est pas terminée.',
      finishArchiveCleanup: 'Terminer la suppression des scans',
      dangerZone: 'Suppression définitive',
      deletePermanentlyHint:
        'Réservée aux doublons, fiches de test et imports erronés. Pour retirer un prospect du travail en cours, archivez-le plutôt.',
      deletePermanently: 'Supprimer définitivement',
      deletePermanentlyTitle: 'Supprimer définitivement ce prospect ?',
      deletePermanentlyIntro: 'Cette action est irréversible et supprime la fiche du prospect',
      deletePermanentlyWith: 'ainsi que',
      deletePermanentlyKeeps:
        'Les aperçus en ligne sont retirés et le lien avec l’annuaire est rompu. La liste d’exclusion est conservée.',
      deleteBlockedByJob:
        'Un scan de ce prospect est encore en cours. Annulez-le ou attendez sa fin, puis supprimez.',
      deletionImpactLabels: {
        audits: '{count} scan(s)',
        findings: '{count} constat(s)',
        analyses: '{count} analyse(s)',
        reports: '{count} rapport(s)',
        reportApprovals: '{count} validation(s) de rapport',
        previews: '{count} aperçu(s)',
        drafts: '{count} brouillon(s)',
        threads: '{count} fil(s) d’échange',
        outcomes: '{count} résultat(s) enregistré(s)',
        events: '{count} événement(s) d’historique',
        jobs: '{count} tâche(s)',
        directoryEntries: '{count} lien(s) d’annuaire retiré(s)',
      },
      info: 'Le type de site, les étoiles et le groupe sont des badges informatifs. Les contrôles de sécurité et de suppression restent actifs.',
      outreach: 'Préparation de la prospection',
      identity: 'Informations modifiables',
      name: 'Nom',
      sector: 'Secteur',
      address: 'Adresse',
      postcode: 'Code postal',
      commune: 'Commune',
      department: 'Département',
      phone: 'Téléphone',
      notes: 'Notes',
      siren: 'SIREN',
      tradingName: 'Nom commercial',
      legalName: 'Dénomination sociale',
      sirenInvalidError: 'Ce SIREN n’est pas valide (il échoue au contrôle officiel de l’INSEE).',
      saveDetails: 'Enregistrer les informations',
      preview: 'Aperçu',
      firstEmail: 'Premier email',
      followUp: 'Relance',
      publishPreview: 'Publier l’aperçu',
      statusAria: 'Statut du prospect',
      ready: 'Prêt',
      blocked: 'Bloqué',
      emailSection: 'Emails et actions',
      noThread: 'Aucun fil de conversation ouvert.',
      threadState: 'État du fil',
      draftLabel: 'Brouillon {touch}',
      draftCreated: 'Créé le {date}',
      previewPublished: 'Aperçu publié. Le premier email réutilisera ce lien.',
      previewLink: 'Lien public de l’aperçu :',
      previewLinkUnavailable:
        'Le lien de cet aperçu, publié avant son enregistrement, n’est plus affichable. Retirez-le puis republiez pour en obtenir un.',
      copyPreviewLink: 'Copier le lien',
      previewLinkCopied: 'Lien copié.',
      previewExpires: 'expire le {date}',
      revokePreview: 'Retirer l’aperçu',
      confirmRevokePreview: 'Retirer cet aperçu ? Le lien public cessera de fonctionner.',
      previewRevoked: 'Aperçu retiré.',
      draftRecipient: 'Destinataire',
      draftBody: 'Afficher le texte de l’email',
      openPreview: 'Ouvrir l’aperçu',
      openInMailbox: 'Ouvrir dans la boîte mail',
      discardDraft: 'Supprimer le brouillon',
      confirmDiscardDraft:
        'Supprimer ce brouillon ici et dans la boîte mail ? Vous pourrez en rédiger un nouveau.',
      draftDiscarded: 'Brouillon supprimé. Vous pouvez en rédiger un nouveau.',
      noDraft: 'Aucun brouillon en attente.',
      auditState: 'État de l’audit : {state}',
      scanDate: 'Scanné le {date}, il y a {days} jour(s)',
      olderDataVersion:
        'Ce scan a été produit avec une version antérieure des données d’Odysseus. Ses résultats enregistrés restent utilisables.',
      eventLabel: 'Événement',
      noEvents: 'Aucun événement enregistré.',
      actionFailed: 'Impossible de terminer cette action.',
      actionRefused: 'Action refusée : {reason}',
      firstEmailCreated: 'Premier email préparé. Relisez-le dans cette section.',
      followUpCreated: 'Relance préparée. Relisez-la dans cette section.',
      outcomeSaved: 'Résultat enregistré : {outcome}.',
      outreachLanguage: 'Langue des emails et de l’aperçu',
      outreachLanguageHint:
        'Langue utilisée pour le client, indépendante de la langue du tableau de bord.',
      languageLabels: { fr: 'Français', en: 'Anglais' },
      outcomeRefused:
        'Résultat non enregistré : aucun email n’a encore été envoyé à ce prospect, ou ce résultat contredit son statut actuel.',
      optOutWithdrawn:
        'Désinscription enregistrée. Retirés : {drafts} brouillon(s) de la boîte mail, {previews} aperçu(s) public(s) ; le fil est clos.',
      detachAudit: 'Détacher',
      confirmDetachAudit:
        'Détacher cet audit du prospect ? L’audit restera disponible dans les scans.',
      auditDetached: 'Audit détaché.',
      originLabels: {
        'atout-france': 'Atout France',
        'site-discovery': 'Découvert sur le site',
        sirene: 'SIRENE',
        operator: 'Opérateur',
      },
      auditKindLabels: {
        audit: 'Audit',
        'full-audit': 'Scan complet',
        'quick-check': 'Contrôle rapide',
        'prospecting-audit': 'Scan de prospection (ancien)',
        'outreach-full-scan': 'Scan de prospection (ancien)',
      },
      previewStatusLabels: {
        live: 'En ligne',
        revoked: 'Retiré',
        expired: 'Expiré',
      },
      refusalLabels: {
        'invalid-url': 'adresse de site invalide',
        'host-busy': 'un autre scan utilise déjà ce site',
        'prospect-unavailable': 'ce prospect est archivé ; restaurez-le pour lancer un scan',
        suppressed: 'contact supprimé de la prospection ; aucune action n’est possible',
        'no-contact': 'aucun email disponible ; ajoutez une adresse dans la fiche',
        'no-complete-audit': 'aucun scan complet exploitable ; lancez un scan complet',
        'report-not-ready':
          'les rapports client de l’audit ne sont pas prêts ; régénérez le rapport depuis la page de l’audit',
        'candidate-unknown': 'prospect introuvable',
        'thread-unknown':
          'aucun premier email n’a encore été rédigé ; commencez par le premier email',
        'thread-already-started': 'le premier email a déjà été envoyé ; passez par la relance',
        'draft-already-live':
          'un brouillon est déjà en attente ; relisez-le et envoyez-le depuis la boîte mail',
        'no-preview-bucket-configured': 'stockage de l’aperçu non configuré',
        'no-mailbox-configured': 'boîte mail non configurée',
        'insufficient-safe-cards': 'preuves sûres insuffisantes',
        'no-usable-contact': 'aucun contact utilisable',
        'evidence-incomplete': 'preuves incomplètes',
        'preview-not-published': 'aperçu non publié',
        'preview-revoked': 'aperçu retiré',
        'preview-expired': 'aperçu expiré',
        'preview-wrong-audit': 'aperçu rattaché à un autre audit',
        'thread-not-eligible':
          'la relance n’est possible qu’après l’envoi confirmé du premier email ; envoyez le brouillon depuis la boîte mail puis synchronisez-la',
        'thread-closed':
          'le fil de conversation est clos (réponse, désinscription ou séquence terminée)',
        'prospect-unknown': 'prospect introuvable ; rechargez la page',
        'previous-draft-missing':
          'le brouillon précédent est introuvable ; rédigez à nouveau le premier email',
        'assembly-refused':
          'l’email n’a pas pu être composé à partir des preuves ; lancez un nouveau scan complet',
        'suppressed-before-provider':
          'le contact a été supprimé pendant la rédaction ; rien n’a été créé',
        'provider-draft-unrecorded': 'la boîte mail n’a pas confirmé le brouillon ; réessayez',
        'domain-mismatch':
          'l’aperçu ne correspond pas au site du prospect ; publiez un nouvel aperçu',
        'nothing-sent': 'aucun email n’a encore été envoyé à ce prospect',
      },
      statusLabels: {
        new: 'Nouveau',
        audited: 'Audité',
        contacted: 'Contacté',
        'follow-up': 'Relance',
        replied: 'Réponse',
        call: 'Appel',
        quoted: 'Devis',
        won: 'Gagné',
        lost: 'Perdu',
        'opted-out': 'Désinscrit',
      },
      outcomeLabels: {
        'no-reply': 'Aucune réponse',
        'reply-positive': 'Réponse positive',
        'reply-not-now': 'Pas maintenant',
        'reply-negative': 'Réponse négative',
        'opt-out': 'Ne plus contacter',
        call: 'Appel',
        quoted: 'Devis',
        won: 'Gagné',
        lost: 'Perdu',
      },
      eventLabels: {
        'status-changed': 'Statut modifié',
        'field-edited': 'Fiche modifiée',
        'scan-attached': 'Audit rattaché',
        'scan-detached': 'Audit détaché',
        'preview-published': 'Aperçu publié',
        'draft-created': 'Brouillon créé',
        'outcome-recorded': 'Résultat enregistré',
        'opted-out': 'Prospect retiré',
        'prospect-archived': 'Prospect archivé',
        'prospect-restored': 'Prospect restauré',
      },
      auditStateLabels: {
        missing: 'absent',
        'not-outreach-grade': 'contrôle rapide uniquement',
        incomplete: 'incomplet',
        qualifying: 'qualifiant',
      },
    },
  },
  en: {
    filters: {
      searchPlaceholder: 'Search',
      searchAria: 'Search',
      advanced: 'Filters ({count})',
      activeFilters: 'Active filters',
      removeFilter: 'Remove filter {filter}',
      clearAll: 'Clear all',
      sectorPlaceholder: 'Sector',
      sectorAria: 'Filter by sector',
      starsAria: 'Filter by stars',
      allStars: 'All star ratings',
      starOption: '{count} star(s)',
      groupAria: 'Filter by group',
      allGroups: 'All groups',
      websiteAria: 'Filter by website type',
      allWebsiteKinds: 'All websites',
      departmentPlaceholder: 'Department',
      departmentAria: 'Filter by department',
      communePlaceholder: 'Commune',
      communeAria: 'Filter by commune',
      postcodePlaceholder: 'Postcode',
      postcodeAria: 'Filter by postcode',
      roomsMinPlaceholder: 'Min rooms',
      roomsMinAria: 'Minimum room count',
      roomsMaxPlaceholder: 'Max rooms',
      roomsMaxAria: 'Maximum room count',
      scanAria: 'Filter by scan',
      allScans: 'All scans',
      withScan: 'With scan',
      withoutScan: 'Without scan',
      activityAria: 'Filter by activity',
      allActivity: 'Active and inactive',
      activeOnly: 'Active only',
      inactiveOnly: 'Inactive only',
    },
    list: {
      eyebrow: 'Prospects',
      title: 'Prospects',
      description: 'Companies added to your portfolio, with their activity and history.',
      newAction: 'New prospect',
      addFromDirectory: 'Add from directory',
      newTitle: 'New prospect',
      namePlaceholder: 'Name',
      sectorPlaceholder: 'Sector',
      websitePlaceholder: 'https://example.com',
      emailPlaceholder: 'contact@example.com',
      nameAria: 'Prospect name',
      sectorAria: 'Prospect sector',
      websiteAria: 'Prospect website',
      emailAria: 'Prospect email',
      createAction: 'Create prospect',
      searchPlaceholder: 'Search prospects',
      searchAria: 'Search prospects',
      sectorFilterAria: 'Filter by sector',
      statusFilterAria: 'Filter by status',
      starsFilterAria: 'Filter by stars',
      groupFilterAria: 'Filter by group',
      websiteFilterAria: 'Filter by website type',
      departmentPlaceholder: 'Department',
      departmentAria: 'Filter by department',
      roomsMinPlaceholder: 'Min rooms',
      roomsMinAria: 'Minimum room count',
      roomsMaxPlaceholder: 'Max rooms',
      roomsMaxAria: 'Maximum room count',
      scanFilterAria: 'Filter by scan',
      activityFilterAria: 'Filter by activity',
      allStatuses: 'All statuses',
      allStars: 'All star ratings',
      allGroups: 'All groups',
      allWebsiteKinds: 'All websites',
      allScans: 'All scans',
      withScan: 'With scan',
      withoutScan: 'Without scan',
      allActivity: 'Active and inactive',
      activeOnly: 'Active only',
      inactiveOnly: 'Inactive only',
      errorTitle: 'Could not load prospects',
      emptyTitle: 'No prospects',
      emptyDescription: 'Add a record from the directory or create one manually.',
      openDirectory: 'Open directory',
      columns: {
        name: 'Name',
        site: 'Website',
        location: 'Location',
        status: 'Status',
        activity: 'Activity',
      },
      unknown: 'Unknown',
      notProvided: 'Not provided',
      count: '{count} prospect(s)',
      previous: 'Previous',
      next: 'Next',
      starOption: '{count} star(s)',
      viewAria: 'Prospect view',
      allView: 'All prospects',
      resultsView: 'Results',
      archivedView: 'Archived',
      archivedEmptyTitle: 'No archived prospects',
      archivedEmptyDescription:
        'An archived prospect leaves active work. Contact details, identity, notes, and outreach history are kept; scan and report files are removed.',
    },
    directory: {
      eyebrow: 'Directory',
      title: 'Directory',
      description: 'The Atout France catalogue. Add establishments that become your prospects.',
      backToProspects: 'Prospects',
      searchPlaceholder: 'Search the directory',
      searchAria: 'Search the directory',
      sectorAria: 'Filter by sector',
      starsAria: 'Filter by stars',
      groupAria: 'Filter by group',
      websiteAria: 'Filter by website type',
      departmentPlaceholder: 'Department',
      departmentAria: 'Filter by department',
      roomsMinPlaceholder: 'Min rooms',
      roomsMinAria: 'Minimum room count',
      roomsMaxPlaceholder: 'Max rooms',
      roomsMaxAria: 'Maximum room count',
      allStars: 'All star ratings',
      allGroups: 'All groups',
      allWebsiteKinds: 'All websites',
      columns: {
        select: 'Add',
        name: 'Name',
        site: 'Website',
        location: 'Location',
        property: 'Establishment',
      },
      count: '{count} establishment(s)',
      addSelected: 'Add to prospects ({count})',
      addOne: 'Add {name}',
      alreadyAdded: 'Already added',
      openProspect: 'Open prospect',
      archivedProspect: 'Archived prospect',
      restoreProspect: 'Restore prospect',
      notProvided: 'Not provided',
      noFacets: 'No facets provided',
      errorTitle: 'Could not load the directory',
      previous: 'Previous',
      next: 'Next',
      starOption: '{count} star(s)',
      roomsOption: '{count} rooms',
      groupLabels: {
        independent: 'Independent',
        'group-member': 'Group member',
        'vendor-hosted': 'Vendor-hosted',
        unknown: 'Group unknown',
      },
      websiteKindLabels: {
        own: 'Own website',
        'vendor-hosted': 'Vendor-hosted',
        unknown: 'Unknown',
      },
    },
    results: {
      eyebrow: 'Prospects',
      title: 'Results',
      description: 'A status and outcome history for each prospect.',
      errorTitle: 'Could not load results',
      emptyTitle: 'No prospects',
      emptyDescription: 'Add a prospect from the directory first.',
      columns: { prospect: 'Prospect', status: 'Status', outcome: 'Outcome', site: 'Website' },
      statusAria: 'Status for {name}',
      outcomeAria: 'Outcome for {name}',
      outcomePlaceholder: 'Record…',
      statusLabels: {
        new: 'New',
        audited: 'Audited',
        contacted: 'Contacted',
        'follow-up': 'Follow-up',
        replied: 'Reply',
        call: 'Call',
        quoted: 'Quoted',
        won: 'Won',
        lost: 'Lost',
        'opted-out': 'Opted out',
      },
      outcomeLabels: {
        'no-reply': 'No reply',
        'reply-positive': 'Positive reply',
        'reply-not-now': 'Not now',
        'reply-negative': 'Negative reply',
        'opt-out': 'Do not contact',
        call: 'Call',
        quoted: 'Quoted',
        won: 'Won',
        lost: 'Lost',
      },
      unknownSite: '—',
    },
    detail: {
      back: 'Prospects',
      missing: 'Prospect not found',
      missingDescription: 'This prospect does not exist or was deleted.',
      emailPlaceholder: 'contact@example.com',
      actorLabels: {
        operator: 'Operator',
        scanner: 'Site scan',
        automation: 'Automation',
        'public-opt-out': 'Opt-out request',
      },
      return: 'Back to prospects',
      loading: 'Loading…',
      record: 'Prospect record',
      origin: 'Origin',
      site: 'Primary website',
      noSite: 'No website attached',
      saveSite: 'Save website',
      email: 'Contact email',
      addEmail: 'Add email',
      contactSuggestion: 'Address published on the site: {address}.',
      contactSuggestionSource: 'View source page',
      contactSuggestionAccept: 'Use this address',
      actions: 'Actions',
      summary: 'Summary',
      editRecord: 'Edit record',
      allActions: 'All actions',
      recommended: 'Recommended next action',
      completed: 'Prospect handled',
      noRecommendation: 'No recommended action at this time.',
      recommendationActions: {
        'review-audit': 'Confirm the details',
        'regenerate-report': 'Regenerate the report',
        'review-draft': 'Review the draft',
        'record-outcome': 'Record the outcome',
        'create-follow-up': 'Draft the follow-up',
        'create-first-email': 'Draft the first email',
        'prepare-audit': 'Run full scan',
        'review-prospect': 'Check the record',
      },
      recommendationReasons: {
        'no-audit': 'No usable full scan is attached yet.',
        'audit-incomplete': 'The latest attached audit does not have all of its data yet.',
        'audit-not-outreach-grade':
          'The latest attached audit is a quick check, which is not enough for outreach. Run a full scan.',
        suppressed: 'Outreach is blocked by a suppressed address or domain.',
        'no-contact': 'Add a usable email address to continue.',
      },
      quick: 'Run quick check',
      fullAudit: 'Run full scan',
      outcome: 'Record outcome',
      history: 'History',
      fullHistory: 'Show full history',
      recentActivity: 'Recent activity',
      statusCorrection: 'Correct status manually',
      statusCorrectionHint: 'This manual correction does not replace recording an outcome.',
      websites: 'Attached websites',
      addWebsite: 'Add website',
      addWebsitePlaceholder: 'https://example.co.uk',
      contacts: {
        removeWebsite: 'Remove website {url}',
        setPrimaryWebsite: 'Set as primary website',
        removeWebsiteTitle: 'Remove this website?',
        removeWebsiteDescription:
          '{url} will no longer be attached to this prospect. Audits already attached stay linked; detach them from their page if needed.',
        removeWebsitePrimaryNote: 'This is the primary website: the next one will replace it.',
        removeEmail: 'Remove email {address}',
        removeAndBlacklistEmail: 'Remove and block',
        useForOutreach: 'Use for outreach',
        outreachRecipient: 'Outreach recipient',
        removeEmailTitle: 'Remove this email?',
        removeEmailDescription:
          '{address} will no longer be used. Unsent drafts to this address are withdrawn; sent history stays intact. Removing is not blocking: the address can be added again.',
        removeAndBlacklistTitle: 'Remove and block this email?',
        removeAndBlacklistDescription:
          '{address} will be removed and added to the opt-out list: no outreach will be sent to it again. Use this when the person objected.',
        confirmRemove: 'Remove',
        confirmRemoveAndBlacklist: 'Remove and block',
        stakeholders: 'Contacts',
        stakeholderName: 'Name',
        stakeholderPosition: 'Position',
        addStakeholder: 'Add a contact',
        editStakeholder: 'Edit {name}',
        removeStakeholder: 'Remove {name}',
        removeStakeholderTitle: 'Remove this contact?',
        removeStakeholderDescription: '{name} will no longer be attached to this prospect.',
        saveStakeholder: 'Save',
      },
      emailList: 'Attached emails',
      notProvided: 'Not provided',
      roomsSummary: '{count} rooms',
      archive: 'Archive prospect',
      restore: 'Restore prospect',
      archivedBadge: 'Archived',
      archivedNotice:
        'Prospect archived on {date}. Its contacts, notes, and correspondence are kept, and its scans and reports were deleted; restore it to return it to active work.',
      archivedNoRecommendation: 'Archived prospect: no recommended action.',
      archiveTitle: 'Archive this prospect?',
      archiveKeeps:
        'The prospect’s contact details, company identity, notes, and outreach history will be kept.',
      archiveDeletes:
        'Its scans, findings, reports, and associated files will be permanently deleted.',
      archiveDeletesCounts:
        'Its scans, findings, reports, and associated files will be permanently deleted: {impact}.',
      archiveRestoreNote: 'Restoring the prospect later will not restore those audits.',
      archiveBlockedByJob:
        'A scan for this prospect is still running. Cancel it or wait for it to finish, then archive.',
      archiveCleanupIncomplete:
        'The prospect is archived, but some scan files could not be deleted. Retry the cleanup to finish.',
      archiveCleanupPending:
        'This archived prospect still has scans: their deletion did not finish.',
      finishArchiveCleanup: 'Finish deleting scans',
      dangerZone: 'Permanent deletion',
      deletePermanentlyHint:
        'For duplicates, test records, and bad imports only. To take a prospect out of active work, archive it instead.',
      deletePermanently: 'Delete permanently',
      deletePermanentlyTitle: 'Delete this prospect permanently?',
      deletePermanentlyIntro: 'This cannot be undone and removes the prospect record',
      deletePermanentlyWith: 'along with',
      deletePermanentlyKeeps:
        'Live previews are taken down and the directory link is cleared. The suppression list is kept.',
      deleteBlockedByJob:
        'A scan for this prospect is still running. Cancel it or wait for it to finish, then delete.',
      deletionImpactLabels: {
        audits: '{count} scan(s)',
        findings: '{count} finding(s)',
        analyses: '{count} analysis record(s)',
        reports: '{count} report(s)',
        reportApprovals: '{count} report approval(s)',
        previews: '{count} preview(s)',
        drafts: '{count} draft(s)',
        threads: '{count} conversation thread(s)',
        outcomes: '{count} recorded outcome(s)',
        events: '{count} history event(s)',
        jobs: '{count} job(s)',
        directoryEntries: '{count} directory link(s) removed',
      },
      info: 'Website kind, stars, and group are informational badges. Safety and suppression checks still apply.',
      outreach: 'Outreach preparation',
      identity: 'Editable details',
      name: 'Name',
      sector: 'Sector',
      address: 'Address',
      postcode: 'Postcode',
      commune: 'Commune',
      department: 'Department',
      phone: 'Phone',
      notes: 'Notes',
      siren: 'SIREN',
      tradingName: 'Trading name',
      legalName: 'Legal name',
      sirenInvalidError: 'This SIREN number is not valid (it fails the official INSEE check).',
      saveDetails: 'Save details',
      preview: 'Preview',
      firstEmail: 'First email',
      followUp: 'Follow-up',
      publishPreview: 'Publish preview',
      statusAria: 'Prospect status',
      ready: 'Ready',
      blocked: 'Blocked',
      emailSection: 'Emails and actions',
      noThread: 'No conversation thread is open.',
      threadState: 'Thread state',
      draftLabel: 'Draft {touch}',
      draftCreated: 'Created {date}',
      previewPublished: 'Preview published. The first email will reuse this link.',
      previewLink: 'Public preview link:',
      previewLinkUnavailable:
        'This preview was published before its link was kept, so it cannot be shown. Revoke it and publish again to get one.',
      copyPreviewLink: 'Copy link',
      previewLinkCopied: 'Link copied.',
      previewExpires: 'expires {date}',
      revokePreview: 'Revoke the preview',
      confirmRevokePreview: 'Revoke this preview? The public link will stop working.',
      previewRevoked: 'Preview revoked.',
      draftRecipient: 'Recipient',
      draftBody: 'Show the email text',
      openPreview: 'Open the preview',
      openInMailbox: 'Open in the mailbox',
      discardDraft: 'Discard the draft',
      confirmDiscardDraft: 'Discard this draft here and in the mailbox? You can draft a new one.',
      draftDiscarded: 'Draft discarded. You can draft a new one.',
      noDraft: 'No pending draft.',
      auditState: 'Audit state: {state}',
      scanDate: 'Scanned {date}, {days} day(s) ago',
      olderDataVersion:
        'This scan was produced with an older Odysseus data version. Its stored results remain usable.',
      eventLabel: 'Event',
      noEvents: 'No events recorded.',
      actionFailed: 'Could not complete this action.',
      actionRefused: 'Action refused: {reason}',
      firstEmailCreated: 'First email prepared. Review it in this section.',
      followUpCreated: 'Follow-up prepared. Review it in this section.',
      outcomeSaved: 'Outcome saved: {outcome}.',
      outreachLanguage: 'Email and preview language',
      outreachLanguageHint: 'Language used for the client, independent of the dashboard language.',
      languageLabels: { fr: 'French', en: 'English' },
      outcomeRefused:
        'Outcome not saved: no email has been sent to this prospect yet, or this outcome contradicts its current status.',
      optOutWithdrawn:
        'Opt-out saved. Withdrawn: {drafts} mailbox draft(s), {previews} public preview(s); the thread is closed.',
      detachAudit: 'Detach',
      confirmDetachAudit:
        'Detach this audit from the prospect? The audit will remain available in scans.',
      auditDetached: 'Audit detached.',
      originLabels: {
        'atout-france': 'Atout France',
        'site-discovery': 'Found on site',
        sirene: 'SIRENE',
        operator: 'Operator',
      },
      auditKindLabels: {
        audit: 'Audit',
        'full-audit': 'Full scan',
        'quick-check': 'Quick check',
        'prospecting-audit': 'Outreach scan (legacy)',
        'outreach-full-scan': 'Outreach scan (legacy)',
      },
      previewStatusLabels: {
        live: 'Live',
        revoked: 'Revoked',
        expired: 'Expired',
      },
      refusalLabels: {
        'invalid-url': 'site URL is invalid',
        'host-busy': 'another scan is already using this site',
        'prospect-unavailable': 'this prospect is archived; restore it to start a scan',
        suppressed: 'contact is suppressed from outreach; no action is possible',
        'no-contact': 'no email available; add an address on the record',
        'no-complete-audit': 'no usable full scan; run a full scan',
        'report-not-ready':
          'the audit’s client reports are not ready; regenerate the report from the audit page',
        'candidate-unknown': 'prospect not found',
        'thread-unknown': 'no first email has been drafted yet; start with the first email',
        'thread-already-started': 'the first email was already sent; use the follow-up',
        'draft-already-live': 'a draft is already waiting; review it and send it from the mailbox',
        'no-preview-bucket-configured': 'preview storage is not configured',
        'no-mailbox-configured': 'mailbox is not configured',
        'insufficient-safe-cards': 'not enough safe proof cards',
        'no-usable-contact': 'no usable contact',
        'evidence-incomplete': 'evidence is incomplete',
        'preview-not-published': 'preview is not published',
        'preview-revoked': 'preview was taken down',
        'preview-expired': 'preview expired',
        'preview-wrong-audit': 'preview belongs to another audit',
        'thread-not-eligible':
          'a follow-up is only possible once the first email is confirmed sent; send the draft from the mailbox, then sync it',
        'thread-closed': 'the conversation is closed (reply, opt-out or finished sequence)',
        'prospect-unknown': 'prospect not found; reload the page',
        'previous-draft-missing': 'the previous draft is missing; draft the first email again',
        'assembly-refused':
          'the email could not be composed from the evidence; run a new full scan',
        'suppressed-before-provider':
          'the contact was suppressed while drafting; nothing was created',
        'provider-draft-unrecorded': 'the mailbox did not confirm the draft; try again',
        'domain-mismatch':
          'the preview does not match the prospect’s website; publish a new preview',
        'nothing-sent': 'no email has been sent to this prospect yet',
      },
      statusLabels: {
        new: 'New',
        audited: 'Audited',
        contacted: 'Contacted',
        'follow-up': 'Follow-up',
        replied: 'Reply',
        call: 'Call',
        quoted: 'Quoted',
        won: 'Won',
        lost: 'Lost',
        'opted-out': 'Opted out',
      },
      outcomeLabels: {
        'no-reply': 'No reply',
        'reply-positive': 'Positive reply',
        'reply-not-now': 'Not now',
        'reply-negative': 'Negative reply',
        'opt-out': 'Do not contact',
        call: 'Call',
        quoted: 'Quoted',
        won: 'Won',
        lost: 'Lost',
      },
      eventLabels: {
        'status-changed': 'Status changed',
        'field-edited': 'Record edited',
        'scan-attached': 'Audit attached',
        'scan-detached': 'Audit detached',
        'preview-published': 'Preview published',
        'draft-created': 'Draft created',
        'outcome-recorded': 'Outcome recorded',
        'opted-out': 'Prospect opted out',
        'prospect-archived': 'Prospect archived',
        'prospect-restored': 'Prospect restored',
      },
      auditStateLabels: {
        missing: 'missing',
        'not-outreach-grade': 'quick check only',
        incomplete: 'incomplete',
        qualifying: 'qualifying',
      },
    },
  },
} satisfies { fr: ProspectHubStrings; en: ProspectHubStrings };
