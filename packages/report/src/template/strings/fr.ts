import type { ReportStrings } from './types.js';

export const fr: ReportStrings = {
  toc: {
    eyebrow: 'Sommaire',
    heading: 'Contenu du rapport',
  },
  statistics: {
    eyebrow: "L'audit en chiffres",
    heading: "Ce que l'analyse a relevé",
    introTemplate:
      '{pages} pages analysées, {findings} constats distincts après regroupement des répétitions. Un constat présent sur plusieurs pages compte une seule fois.',
    pagesTileLabel: 'pages analysées',
    findingsTileLabel: 'constats distincts',
    accessibilityOccurrencesTileLabel: "occurrences d'accessibilité",
    pagesWithCriticalTileLabel: 'pages avec au moins un constat critique',
    criticalTileLabel: 'critiques',
    seriousTileLabel: 'sérieux',
    moderateTileLabel: 'modérés',
    minorTileLabel: 'mineurs',
    wcagFailingDescriptionTemplate: 'critères WCAG 2.2 AA en échec sur {pages} pages',
    wcagFailingHeading: 'Conformité WCAG',
    severityBreakdownHeading: 'Répartition par sévérité',
    categoryBreakdownHeading: 'Répartition par catégorie',
    belowThresholdRenderGapNote:
      "La catégorie « Rendu » affiche 0 constat, mais un écart de rendu réel a été mesuré sur au moins une page, en dessous du seuil à partir duquel un constat est généré (voir la section « Preuve de rendu »).",
    legendCriticalText: "bloque des visiteurs ou l'indexation",
    legendSeriousText: "dégrade fortement l'usage ou la conformité",
    legendModerateText: 'à corriger, sans urgence',
    legendMinorText: 'optimisation',
  },
  conformanceSummary: {
    eyebrow: 'Conformité accessibilité',
    heading: 'Critères WCAG 2.2 niveau AA en échec',
    bodyIntro:
      "Un critère en échec est un écart de conformité, pas une préférence esthétique. Cette page peut être transmise directement à un développeur, une agence ou un conseil juridique.",
    scopeNote:
      "Cette liste de critères techniques n'implique pas, à elle seule, une conclusion sur l'obligation légale de ce site : elle est technique, pas juridique, et ne contredit pas le statut d'obligation établi section 2.",
    criterionColumnLabel: 'Critère',
    criterionNameColumnLabel: 'Intitulé',
    findingsColumnLabel: 'Constats',
    occurrencesColumnLabel: 'Occurrences',
    pagesMaxColumnLabel: 'Pages (max)',
    emptyState: "Aucun critère WCAG 2.2 niveau AA en échec n'a été détecté sur ce site.",
    heuristicSectionHeading: 'Signaux à vérifier',
    heuristicSectionNote:
      "Ces lignes proviennent d'un signal heuristique sur la qualité des textes alternatifs, pas d'un test de conformité déterministe : elles indiquent un texte alternatif potentiellement peu utile (générique, nom de fichier brut, ou dupliqué), sans se prononcer sur une non-conformité confirmée. Une vérification manuelle est nécessaire avant de les traiter comme des écarts de conformité.",
  },
  observations: {
    eyebrow: 'Observations',
    heading: 'Constats hors classement',
    wrapperTitle: "Pages d'intégration de contenu tiers",
    wrapperBodyTemplate:
      "Ces pages sont des enveloppes qui affichent du contenu d'une plateforme tierce : leur contenu est quasiment absent du HTML brut. Les corrections classiques ne s'appliquent pas à du contenu tiers. La décision utile est de choisir entre un lien direct vers la plateforme, un noindex assumé, ou la suppression de ces pages. Constats concernés : {findingIds}.",
    legalTitle: "Pages légales exclues de l'indexation",
    legalBodyTemplate:
      "Ces pages (conditions générales, politique de cookies, politique de confidentialité, ou similaire) portent une directive noindex. C'est une configuration fréquente et souvent volontaire pour ce type de page : aucune action corrective n'est recommandée par défaut, vérifiez simplement que ce choix est assumé. Constats concernés : {findingIds}.",
  },
  cover: {
    kicker: 'Odysseus · Audit numérique',
    reportTitle: "Rapport d'audit",
    subtitle: "Audit de visibilité et d'accessibilité",
    siteLabel: 'Site audité',
    dateLabel: "Date de l'audit",
    pagesScannedLabel: 'Périmètre analysé',
    pagesScannedValueTemplate: '{count} pages scannées',
    languageLabel: 'Langue du rapport',
    wcagReferentialLabel: 'Référentiel audité',
    riskSmallLabel: 'Niveau de criticité des constats',
    riskLevels: { low: 'Faible', medium: 'Moyen', high: 'Élevé' },
    riskBasisTemplate: 'Basé sur {critical} constats critiques et {serious} constats sérieux',
    recipientLabel: 'Préparé pour',
    legalNameLabel: 'Dénomination sociale',
  },
  executiveSummary: {
    eyebrow: 'Résumé',
    heading: "Ce qu'il faut retenir",
    startHereKicker: 'Par où commencer',
    jumpLinkLabelTemplate: 'Voir priorité {rank} : {title}',
    topPriorityIsNotLegalWithPointerTemplate:
      "La priorité 1 ci-dessus est un enjeu commercial, pas un enjeu de conformité légale : elle a été classée en premier sur la base de son rapport effort/impact. Les priorités liées à la conformité légale figurent en position {legalRank}.",
    topPriorityIsNotLegalNoPointer:
      "La priorité 1 ci-dessus est un enjeu commercial, pas un enjeu de conformité légale : elle a été classée en premier sur la base de son rapport effort/impact. Aucune des priorités retenues dans ce rapport n'est directement liée à la conformité légale ; voir la section « Exposition légale » pour le détail.",
  },
  legalExposure: {
    eyebrow: 'Exposition légale',
    heading: 'Exposition légale',
    eaaDeadlineLabel: 'En application depuis',
    eaaDeadlineValue: '28 juin 2025',
    eaaDeadlineNoteTemplate:
      "Date d'entrée en application des obligations de l'EAA, fixée par la directive elle-même. Les obligations sont donc déjà en vigueur, depuis {duration}, pas à venir.",
    obligationStatusLabel: "Statut d'obligation",
    statusLabels: {
      in_scope: 'Confirmé',
      likely_in_scope: 'Probable',
      out_of_scope: 'Hors champ',
      undetermined: 'Indéterminé',
    },
    statusShortDescriptions: {
      in_scope: "Ce site relève d'une obligation d'accessibilité numérique confirmée par les éléments disponibles.",
      likely_in_scope:
        "Les éléments disponibles indiquent que ce site relève probablement d'une obligation d'accessibilité numérique, sans confirmation complète.",
      out_of_scope:
        "Sur la base des éléments disponibles, ce site ne relève pas de l'obligation d'accessibilité numérique prévue par la loi n° 2023-171.",
      undetermined:
        "Le statut d'obligation n'a pas pu être établi avec certitude : l'identifiant d'entreprise (SIREN/RCS) est absent du site, ce qui empêche de confirmer le palier réglementaire applicable.",
    },
    exposureHeading: 'Exposition en cas de manquement',
    sirenLabel: 'SIREN',
    sirenTemplate: 'SIREN {siren}, tel que constaté lors de cet audit ({date}).',
    sirenUnavailable: "Aucun numéro SIREN n'a pu être identifié pour ce site lors de cet audit.",
    disclaimerNote:
      "Généré à partir de l'évaluation d'obligations existante ; aucune interprétation juridique supplémentaire n'a été ajoutée. Une revue par un conseil juridique reste nécessaire.",
    undeterminedActionNote:
      "Ce statut se précisera si le numéro SIREN de l'entreprise est publié sur le site ou communiqué à l'équipe Odysseus.",
    transactionalFlowOnSiteTemplate:
      "Le parcours transactionnel identifié a été relevé directement sur les pages suivantes du périmètre audité : {pages}.",
    transactionalFlowDelegatedTemplate:
      "Le parcours transactionnel identifié est délégué à un prestataire tiers ({domain}). Ce domaine n'a pas été exploré dans le cadre de cet audit, qui reste circonscrit au domaine du site audité.",
  },
  checklist: {
    eyebrow: 'Check-list imprimable',
    heading: 'Check-list des priorités',
    intro: "Page pensée pour être imprimée ou capturée seule, sans prose, uniquement l'essentiel.",
    rankColumnLabel: '#',
    priorityColumnLabel: 'Priorité',
    effortColumnLabel: 'Effort',
    impactColumnLabel: 'Impact',
    pagesColumnLabel: 'Pages',
    findingsColumnLabel: 'Constats',
    wcagColumnLabel: 'WCAG',
    statusDateColumnLabel: 'Statut / Date',
  },
  themes: {
    eyebrow: 'Priorités',
    headingTemplate: '{count} chantiers, classés par effort et par impact',
    effortLabel: 'Effort',
    impactLabel: 'Impact commercial',
    affectedPagesLabel: 'Pages affectées',
    conformityLabel: 'Conformité',
    conformityNotApplicable: 'Sans objet',
    conformityNonConformant: 'Non conforme',
    legalTagLabel: 'Exigence de conformité',
    impactCitationLabel: 'Repère chiffré',
    measuredLcpGapTemplate:
      "Écart mesuré sur ce site : LCP médian à {value} s, soit {gap} s au-dessus du seuil « bon » ({threshold} s), à ne pas confondre avec les 0,1 s de la statistique ci-dessus.",
    quickWinBadgeLabel: 'Gain rapide',
    recommendedActionsLabel: 'Actions recommandées',
    effortImpactLevels: { low: 'Faible', medium: 'Moyen', high: 'Élevé' },
    pagesOfTotalTemplate: '{pages} {pageWord} sur {totalPages}',
    refsLabel: 'Constats',
  },
  renderDiffEvidence: {
    eyebrow: 'Preuve de rendu',
    heading: "Ce que reçoit un moteur de recherche avant JavaScript",
    intro:
      "Chaque page est chargée deux fois : une fois sans JavaScript, comme le fait un robot d'indexation basique, une fois dans un navigateur complet. La différence mesure le contenu invisible pour les moteurs.",
    rawBarLabelTemplate: 'HTML brut - {chars} caractères',
    renderedBarLabelTemplate: 'Page rendue - {chars} caractères',
    missingCaptionTemplate: 'Manquant : {percent}% du texte visible absent du HTML brut, sur {selector}.',
    missingCaptionNoSelectorTemplate: 'Manquant : {percent}% du texte visible absent du HTML brut.',
    overflowTextTemplate:
      '{count} autres pages présentent le même écart, détail dans l\'export technique.',
    positiveStatementTemplate:
      'Les pages commerciales de ce site conservent leur texte dans le HTML brut : aucun écart de rendu significatif n\'a été mesuré.',
    positiveStatementWrapperNote:
      'Seules les pages d\'intégration de contenu tiers font exception à ce constat, voir la section Observations.',
  },
  coreWebVitals: {
    eyebrow: 'Performance',
    heading: 'Mesures de performance',
    introTemplate:
      'Valeurs médianes agrégées sur les {pages} pages. Simulation mobile avec limitation réseau, passage unique, données de laboratoire (Lighthouse) et non de terrain.',
    metricColumnLabel: 'Métrique',
    valueColumnLabel: 'Valeur médiane',
    thresholdColumnLabel: 'Seuil "bon"',
    statusColumnLabel: 'Statut',
    lcpLabel: 'LCP, contenu principal',
    tbtLabel: 'TBT, temps de blocage',
    fcpLabel: 'FCP, premier affichage',
    speedIndexLabel: 'Speed Index',
    clsLabel: 'CLS, stabilité visuelle',
    notMeasured: 'Non mesuré',
    ratingGoodLabel: 'bon',
    ratingNeedsImprovementLabel: 'à améliorer',
    ratingPoorLabel: 'insuffisant',
  },
  accessibilityStatement: {
    eyebrow: "Déclaration",
    heading: "Projet de déclaration d'accessibilité",
    intro: "Squelette généré à partir des constats, à compléter par le client avant publication.",
    criterionColumnLabel: 'Critère',
    statusColumnLabel: 'Statut de conformité',
    nonConformantLabel: 'Non conforme',
    contactHeading: 'Contact',
    contactBody: '[Adresse e-mail de contact à compléter par le client] - processus de signalement à définir.',
    contactEmailToConfirmTemplate: '{email} (détecté automatiquement, à confirmer avant publication)',
    remediationPlanHeading: 'Plan de remédiation',
    remediationPlanBodyTemplate: 'Voir la section « {section} » ci-dessus pour le plan.',
    firstPublicationDateLabel: 'Date de première publication',
    technologiesLabel: 'Technologies utilisées',
    testEnvironmentLabel: "Environnement de test",
    nonAccessibleContentLabel: 'Contenus non accessibles connus',
    feedbackProcedureLabel: 'Modalités de signalement',
    recoursePathLabel: 'Recours (Défenseur des droits)',
    toCompletePlaceholder: 'À compléter par le client',
  },
  glossary: {
    eyebrow: 'Glossaire',
    heading: 'Glossaire',
    terms: [
      {
        id: 'wcag',
        term: 'WCAG 2.2',
        definition:
          "Le référentiel international de critères d'accessibilité numérique publié par le W3C, niveaux A / AA / AAA.",
      },
      {
        id: 'eaa',
        term: 'EAA',
        definition:
          "Directive européenne imposant l'accessibilité numérique à de nombreux produits et services à partir du 28 juin 2025.",
      },
      {
        id: 'rgaa',
        term: 'RGAA',
        definition:
          "Référentiel Général d'Amélioration de l'Accessibilité, la déclinaison française opérationnelle des critères WCAG.",
      },
      {
        id: 'en301549',
        term: 'EN 301 549',
        definition:
          "Norme européenne d'accessibilité des TIC, référence technique citée par l'EAA et les marchés publics.",
      },
      {
        id: 'critical',
        term: 'Critique',
        definition: 'Sévérité la plus haute : bloque une tâche essentielle pour une partie des utilisateurs.',
      },
      {
        id: 'serious',
        term: 'Sérieux',
        definition: "Gêne fortement l'usage du site sans l'empêcher totalement.",
      },
      {
        id: 'moderate',
        term: 'Modéré',
        definition: "Complique l'usage pour certains profils ou contextes d'usage.",
      },
      {
        id: 'minor',
        term: 'Mineur',
        definition: 'Écart de faible impact, non bloquant.',
      },
      {
        id: 'quick-win',
        term: 'Gain rapide',
        definition: 'Correctif à faible effort et fort impact, à traiter en priorité.',
      },
      {
        id: 'lcp',
        term: 'LCP (Largest Contentful Paint)',
        definition: "Temps d'affichage du plus grand élément visible de la page, un indicateur de vitesse perçue.",
      },
      {
        id: 'fcp',
        term: 'FCP (First Contentful Paint)',
        definition: 'Temps avant le premier affichage de contenu à l\'écran.',
      },
      {
        id: 'tbt',
        term: 'TBT (Total Blocking Time)',
        definition: "Temps de blocage total : durée pendant laquelle la page ne répond pas aux interactions de l'utilisateur.",
      },
      {
        id: 'cls',
        term: 'CLS (Cumulative Layout Shift)',
        definition: "Stabilité visuelle : mesure les déplacements inattendus d'éléments pendant le chargement de la page.",
      },
      {
        id: 'speed-index',
        term: 'Speed Index',
        definition: "Vitesse à laquelle le contenu visible d'une page se remplit pendant le chargement.",
      },
      {
        id: 'seo',
        term: 'SEO',
        definition: "Référencement naturel : optimisation pour la visibilité dans les résultats des moteurs de recherche.",
      },
      {
        id: 'geo',
        term: 'GEO',
        definition:
          "Optimisation pour les moteurs d'intelligence artificielle générative (ex. réponses IA), une visibilité distincte du référencement classique.",
      },
      {
        id: 'constat-vs-occurrence',
        term: 'Constat / Occurrence',
        definition:
          "Un constat est un problème distinct après regroupement ; une occurrence est chacune de ses apparitions individuelles sur le site. Un même constat peut compter plusieurs occurrences.",
      },
      {
        id: 'selecteur',
        term: 'Sélecteur',
        definition: "Expression technique identifiant précisément l'élément concerné dans le code de la page.",
      },
      {
        id: 'dgccrf',
        term: 'DGCCRF',
        definition:
          "Direction générale de la concurrence, de la consommation et de la répression des fraudes, l'autorité de contrôle du marché citée dans ce rapport.",
      },
      {
        id: 'parcours-transactionnel',
        term: 'Parcours transactionnel',
        definition:
          'Fonctionnalité du site permettant de réserver, ajouter au panier ou payer directement en ligne - le critère qui déclenche l\'obligation EAA.',
      },
    ],
  },
  nextSteps: {
    eyebrow: 'Suite',
    heading: 'Prochaines étapes & contact',
    questionTitle: 'Une question ?',
    questionBodyTemplate:
      "Toute demande de clarification sur un constat ou une priorité peut être adressée à l'équipe Odysseus à {email}, en citant l'identifiant du constat concerné.",
    reauditTitle: 'Ré-audits',
    reauditBody:
      'Un ré-audit relance le même périmètre et compare les résultats au rapport précédent, constat par constat, pour mesurer la progression.',
    postFixTitle: 'Vérification post-correctifs',
    postFixBody:
      'Une fois les priorités traitées, une vérification ciblée confirme que les constats corrigés le sont bien, sans relancer un audit complet.',
    authorshipTemplate:
      'Rapport produit par {producer}, généré le {date} (outil version {version}), identifiant de rapport {reportId}.',
    liabilityStatement:
      "Ce rapport reproduit des constats techniques détectés par des outils automatisés, accompagnés d'explications et de priorisations. Il ne constitue pas un avis juridique ; voir la section « Exposition légale » et la méthodologie pour les limites de couverture. Odysseus ne saurait être tenu responsable des décisions prises sur la seule base de ce document.",
  },
  findingsAppendix: {
    eyebrow: 'Annexe',
    heading: 'Liste complète des constats',
    intro:
      'Chaque constat détecté par les outils automatisés, y compris ceux jugés mineurs et non repris dans les priorités ci-dessus.',
    categoryLabels: {
      accessibility: 'Accessibilité',
      seo: 'Référencement (SEO)',
      geo: 'Visibilité dans les moteurs d\'IA (GEO)',
      performance: 'Performance',
      rendering: 'Rendu',
    },
    geoEmergingLabel: 'Recherche émergente',
    severityLabels: {
      critical: 'Critique',
      serious: 'Sérieux',
      moderate: 'Modéré',
      minor: 'Mineur',
    },
    findingIdColumnLabel: 'Constat',
    pagesColumnLabel: 'Pages',
    pagesMaxColumnLabel: 'Pages max',
    occurrencesColumnLabel: 'Occurrences',
    selectorColumnLabel: 'Sélecteur type',
    findingSingular: 'constat',
    findingPlural: 'constats',
    occurrenceSingular: 'occurrence',
    occurrencePlural: 'occurrences',
    pageSingular: 'page',
    pagePlural: 'pages',
    upToLabel: "jusqu'à",
    wcagLabel: 'WCAG',
    observationsCrossRefLabel: 'voir Observations',
    crawledPagesHeadingTemplate: 'Pages explorées ({count})',
  },
  methodology: {
    eyebrow: 'Méthodologie et limites',
    heading: 'Comment cet audit a été réalisé',
    toolingParagraphTemplate:
      "L'audit combine des outils de détection automatisée, tous déterministes : aucun constat n'est inventé ou deviné. Moteur d'accessibilité axe-core {axeVersion}, moteur de performance Lighthouse {lighthouseVersion} sur profil mobile simulé, comparaison de rendu par double chargement de chaque page, JavaScript désactivé puis activé. Référentiel audité : WCAG 2.2, niveau AA. Périmètre : {pages} pages explorées le {date} à partir de la page d'accueil.",
    automatedCoverageCaveat:
      "Les outils automatisés détectent une part reconnue mais limitée des problèmes d'accessibilité, une estimation généralement admise dans le secteur situant cette part entre 30 et 40 pour cent des critères (estimation générale, sans source unique attribuable, à la différence des chiffres cités ailleurs dans ce rapport). C'est une propriété de tout audit automatisé, pas une réserve sur celui-ci : elle garantit que chaque constat listé est vérifiable. Cet audit inclut une passe d'accessibilité étendue couvrant la navigation au clavier, l'ordre de focus, la gestion des erreurs de formulaire, la présence de sous-titres vidéo, et un signal heuristique sur la qualité des textes alternatifs. Cet audit est entièrement automatisé : certaines propriétés d'accessibilité ne peuvent pas être évaluées de manière fiable par des outils automatisés seuls et ne font l'objet d'aucun constat dans ce rapport.",
    legalCitationInScopeTemplate:
      "Ce site relève de l'obligation suivante : {regimeName}, sous le contrôle de {authority} ({legalCitation}). {facts}",
    legalCitationLikelyInScopeTemplate:
      "Les éléments disponibles indiquent que ce site relève probablement de l'obligation suivante : {regimeName}, sous le contrôle de {authority} ({legalCitation}). {facts} Cette évaluation n'a pas pu être confirmée faute d'une vérification complète du parcours du site.",
    legalCitationOutOfScopeParagraph:
      "Sur la base des éléments disponibles (taille de l'entreprise et absence de parcours de réservation, panier ou paiement en ligne), ce site ne relève pas de l'obligation d'accessibilité numérique prévue par la loi n° 2023-171.",
    legalCitationUndeterminedParagraph:
      "Ce rapport cite les critères techniques concernés (WCAG 2.2, EN 301 549) sans se prononcer sur l'applicabilité d'une obligation légale particulière à votre entreprise, laquelle dépend de sa taille et de son secteur d'activité.",
    legalCitationEffectifFactTemplate: "L'entreprise compte {label} d'après le répertoire Sirene.",
    legalCitationTurnoverFactTemplate: "Le chiffre d'affaires annuel déclaré dépasse le seuil de {threshold}.",
    legalCitationTransactionalFlowFactTemplate: 'Le site propose un parcours de {flowType} directement en ligne.',
    legalCitationTransactionalFlowUnknownFact:
      "La présence d'un parcours de réservation, panier ou paiement en ligne n'a pas pu être confirmée sur l'ensemble du site.",
    transactionalFlowTypeLabels: {
      booking: 'réservation',
      cartOrPayment: 'panier ou de paiement',
      both: 'réservation, panier ou paiement',
    },
    legalCitationExemptionRouteSentence:
      "La seule voie documentée pour s'exempter de cette obligation est une demande de dérogation pour charge disproportionnée, déposée sur Démarche Simplifiée.",
    legalCitationManualSirenWithFindingTemplate:
      "Le numéro SIREN utilisé pour cette détermination a été fourni manuellement, ce site ne le publie pas lui-même (voir constat {findingId}).",
    legalCitationManualSirenNoFindingSentence:
      "Le numéro SIREN utilisé pour cette détermination a été fourni manuellement, ce site ne publie pas ce numéro lui-même.",
    legalCitationSirenMismatchTemplate:
      "Le numéro SIREN fourni manuellement ({manualSiren}) diffère de celui publié sur le site ({extractedSiren}). Cette détermination retient le numéro fourni manuellement.",
    legalCitationPointerSentence: 'Le détail de l\'exposition légale figure dans la section « Exposition légale ».',
    socialExclusionDisclosureTemplate:
      "{count} page(s) ont été exclues de ce scan car elles redirigent vers un réseau social tiers, selon la liste d'exclusion par défaut d'Odysseus.",
    sirenSourceResolvedTemplate: 'Le numéro SIREN a été confirmé comme affiché sur cette page du site : {url}.',
  },
  footer: {
    confidentialityLabel: 'Rapport confidentiel',
    pageLabel: 'Page',
  },
};
