import type { ReportStrings } from './types.js';

export const fr: ReportStrings = {
  accessibilityStatementGuidance: {
    heading: "Déclaration d'accessibilité",
    notFoundObservation:
      "Aucune déclaration d'accessibilité n'a été trouvée sur les pages visitées.",
    article47Recommendation:
      "Pour le régime de l'article 47 enregistré dans cette analyse, publiez la déclaration et ajoutez un lien vers celle-ci depuis le pied de page.",
    optionalRecommendation:
      "En dehors du régime de l'article 47, cette publication est une bonne pratique facultative : vous pouvez publier une déclaration et ajouter un lien depuis le pied de page.",
  },
  toc: {
    eyebrow: 'Sommaire',
    heading: 'Contenu du rapport',
    executiveContextGroupLabel: 'Contexte exécutif',
    decisionsActionsGroupLabel: 'Décisions et actions',
    detailedEvidenceGroupLabel: 'Preuves détaillées',
    legalReferenceGroupLabel: 'Référence légale',
    methodVocabularyGroupLabel: 'Méthode et vocabulaire',
    technicalAppendixGroupLabel: 'Annexe technique',
  },
  reportIntro: {
    eyebrow: 'À propos de ce rapport',
    heading: 'Situation, constats et question',
    situationHeading: 'La situation',
    situationBody:
      "Ce rapport répond à un besoin simple : disposer d'un état des lieux factuel du site, établi par des tests automatisés et reproductibles, pour décider quoi corriger et dans quel ordre. Des outils déterministes ont visité le périmètre analysé et comparé chaque page à des critères publics : accessibilité (WCAG 2.2 niveau AA), référencement naturel (SEO), visibilité auprès des assistants IA (GEO), et rendu sans JavaScript. Chaque constat listé dans ce rapport provient d'un de ces tests : rien n'est inventé, rien n'est deviné.",
    complicationHeading: 'Ce que le diagnostic relève',
    complicationBodyTemplate:
      "L'analyse a relevé {findings} constats distincts, dont {criticalSerious} critiques ou sérieux, présents sur au moins {pages} pages du périmètre analysé. Ces constats sont regroupés en {priorities} priorités classées, qui indiquent par où commencer.",
    consequenceRegulatory:
      "Des obligations légales peuvent s'appliquer à votre établissement : la section « {legalSection} » décrit les critères publiés et les faits enregistrés, à faire confirmer par votre conseil juridique.",
    notALegalOpinionNote:
      "Ce que ce rapport n'est pas : un avis juridique (voir la section « {legalSection} ») ; un audit exhaustif, la détection automatique couvrant environ 30 à 40 % des critères d'accessibilité (voir « {methodologySection} »).",
    questionHeading: 'La question à laquelle ce rapport répond',
    audienceHeading: 'Qui utilise ce rapport',
    journeysHeading: 'Parcours visiteurs vérifiés',
    roleManagementLabel: 'La direction',
    roleTechnicalLabel: 'Prestataire technique ou service informatique',
    roleCommunicationsLabel: 'Communication',
    roleLegalLabel: 'Juridique',
    nextActionsHeading: 'Vos trois prochaines actions',
    nextActionItemTemplate: '{title}, à transmettre à : {contact}.',
    contactAgency: 'votre agence',
    contactAgencyAndVendor: "votre agence et l'éditeur du composant tiers concerné",
    contactUnknownVendor: "l'éditeur du composant tiers concerné",
  },
  statistics: {
    eyebrow: "L'audit en chiffres",
    heading: "Ce que l'analyse a relevé",
    introTemplate:
      '{pages} pages analysées, {findings} constats distincts après regroupement des répétitions. Un constat présent sur plusieurs pages compte une seule fois.',
    pagesTileLabel: 'pages analysées',
    findingsTileLabel: 'constats distincts',
    accessibilityOccurrencesTileLabel: "occurrences d'accessibilité",
    heuristicOccurrencesExcludedNoteTemplate:
      "Ce chiffre exclut {count} occurrences supplémentaires provenant d'un signal heuristique sur la qualité des textes alternatifs, qui n'est pas un test de conformité déterministe (voir la section « Signaux à vérifier »).",
    criticalDriverNoteTemplate: 'Ces constats critiques proviennent uniquement de : {rules}.',
    // P1.2 (2026-08-21 La Corniche feedback pass): this fact determines
    // who the client calls tomorrow morning - it used to be buried on
    // page 21 of 27. Template: {percent}, the share of
    // accessibilityOccurrences (already heuristic-excluded) traceable to
    // a third-party component.
    thirdPartyOccurrencesNoteTemplate:
      // B6 (2026-08-24 three-site review): this used to say "voir la
      // section « À traiter avec vos prestataires tiers »". That block is
      // real, but it is a sub-heading inside the technical annex, not a
      // numbered section, so it has no table-of-contents entry and no
      // page number - in a real La Corniche report the reader was sent
      // looking for a section that appeared nowhere in the contents, 55
      // pages further on. Naming the numbered section that contains it is
      // the difference between a reference and a dead end.
      "{percent} % de ces occurrences proviennent de composants tiers (formulaires, fenêtres modales, widget de réservation) - voir « À traiter avec vos prestataires tiers », dans l'annexe technique.",
    priorityOwnershipTemplate:
      'Priorités : {firstParty} constats à corriger directement, {thirdParty} à transmettre à un tiers, {verifyIntent} à vérifier selon le contexte.',
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
      'La catégorie « Rendu » affiche 0 constat, mais un écart de rendu réel a été mesuré sur au moins une page, en dessous du seuil de {threshold} % à partir duquel un constat est généré (voir la section « Preuve de rendu »).',
    legendCriticalText: "bloque des visiteurs ou l'indexation",
    legendSeriousText: "dégrade fortement l'usage ou la conformité",
    legendModerateText: 'à corriger, sans urgence',
    legendMinorText: 'optimisation',
  },
  conformanceSummary: {
    eyebrow: 'Conformité accessibilité',
    heading: 'Critères WCAG 2.2 niveau AA en échec',
    bodyIntro:
      'Un critère en échec est un écart de conformité, pas une préférence esthétique. Cette page peut être transmise directement à un développeur, une agence ou un conseil juridique.',
    scopeNote:
      "Cette liste décrit des écarts de conformité technique, indépendamment de toute question d'obligation légale : le statut d'obligation de ce site est traité séparément, section « {section} ».",
    criterionColumnLabel: 'Critère',
    criterionNameColumnLabel: 'Intitulé',
    findingsColumnLabel: 'Constats',
    occurrencesColumnLabel: 'Occurrences',
    pagesMaxColumnLabel: 'Pages concernées',
    emptyState: "Aucun critère WCAG 2.2 niveau AA en échec n'a été détecté sur ce site.",
    heuristicSectionHeading: 'Signaux à vérifier',
    heuristicSectionNote:
      "Ces lignes proviennent d'un signal heuristique sur la qualité des textes alternatifs, pas d'un test de conformité déterministe : elles indiquent un texte alternatif potentiellement peu utile (générique, nom de fichier brut, ou dupliqué), sans se prononcer sur une non-conformité confirmée. Une vérification manuelle est nécessaire avant de les traiter comme des écarts de conformité.",
    // item 1.2: rendered only when at least one finding maps to more than
    // one WCAG criterion, so the occurrence column's total legitimately
    // exceeds the accessibility-occurrences tile elsewhere in the report.
    multiCriterionNote:
      "Un constat associé à plusieurs critères WCAG est compté dans chaque ligne concernée : la somme de la colonne « Occurrences » peut donc dépasser le nombre total d'occurrences d'accessibilité indiqué ailleurs dans ce rapport.",
  },
  coverage: {
    summaryTemplate:
      '{inventory} URL inventoriées ; résultats sensibles au contenu sur {content} pages ({contentCompleted} terminés, {contentPartial} partiels, {contentFailed} en échec) ; Lighthouse : {lighthouse} mesurées, {lighthousePartial} partielles, {lighthouseFailed} en échec, {lighthouseNotPlanned} non planifiées.',
    legacyUnknownTemplate:
      '{inventory} URL inventoriées. La couverture passe par passe n’est pas disponible pour cet audit historique.',
    withoutContentTemplate: 'Pages sans analyse du contenu : {reasons}.',
    guardedOmissionsTemplate:
      '{count} URL de continuation supplémentaires ont été omises par le garde-fou de répétition.',
    reasonLabels: {
      'discovered-not-scanned': 'découvertes mais non analysées',
      'skipped-robots': 'bloquées par robots.txt',
      'skipped-non-html': 'ressources non HTML',
      'skipped-external-redirect': 'redirections externes',
      error: 'erreurs d’exploration',
      'coverage-missing': 'données de couverture indisponibles',
    },
  },
  observations: {
    eyebrow: 'Observations',
    heading: 'Constats hors classement',
    wrapperTitle: "Pages d'intégration de contenu tiers",
    wrapperBodyTemplate:
      "Ces pages sont des enveloppes qui affichent du contenu d'une plateforme tierce : leur contenu est quasiment absent du HTML brut. Les corrections classiques ne s'appliquent pas à du contenu tiers. La décision utile est de choisir entre un lien direct vers la plateforme, un noindex assumé, ou la suppression de ces pages. Constats concernés : {findingIds}.",
    legalTitle: "Pages légales exclues de l'indexation",
    legalBodyTemplate:
      "Ces pages (conditions générales, politique de cookies, politique de confidentialité, ou similaire) sont d'un type généralement exclu de l'indexation (noindex). C'est une configuration fréquente et souvent volontaire pour ce type de page : aucune action corrective n'est recommandée par défaut, vérifiez simplement que ce choix est assumé et que la directive noindex est bien en place. Constats concernés : {findingIds}.",
  },
  remainingWork: {
    eyebrow: 'Reste \u00e0 traiter',
    heading: 'Les autres constats, group\u00e9s par th\u00e8me',
    introTemplate:
      "Les priorit\u00e9s class\u00e9es de la section {prioritiesSection} couvrent les corrections \u00e0 mener en premier. Les {count} constats restants sont regroup\u00e9s ci-dessous par domaine et par r\u00e8gle, avec l'action correspondante. Chaque ligne renvoie aux num\u00e9ros de constats de l'annexe.",
    nothingRemaining:
      "Tous les constats de cet audit sont couverts par les priorit\u00e9s class\u00e9es. Cette section n'a rien \u00e0 ajouter.",
    findingSingular: 'constat',
    findingPlural: 'constats',
    occurrenceSingular: 'occurrence',
    occurrencePlural: 'occurrences',
    pageSingular: 'page',
    pagePlural: 'pages',
    findingRefsTemplate: 'Constats : {findingIds}',
    scopeNote:
      "Les actions indiqu\u00e9es d\u00e9crivent la correction attendue par la r\u00e8gle d\u00e9tect\u00e9e. Elles ne remplacent pas l'appr\u00e9ciation de la personne qui interviendra sur le site.",
  },
  cover: {
    kicker: 'Odysseus · Audit numérique',
    reportTitle: "Rapport d'audit",
    // Report-type line (plan 018 step 4). Same convention as the
    // referential value below: a no-break space after each separator (never
    // before), so wrapping can only happen between complete terms.
    reportType: 'Accessibilité · Performance · SEO · GEO',
    reportTypeNoPerformance: 'Accessibilité · SEO · GEO',
    recipientLabel: 'Préparé pour',
  },
  metadata: {
    eyebrow: "Métadonnées de l'audit",
    heading: "Fiche d'audit et échelle de sévérité",
    siteLabel: 'Site audité',
    dateLabel: "Date de l'audit",
    pagesScannedLabel: 'Périmètre analysé',
    pagesScannedValueTemplate: '{count} pages analysées',
    languageLabel: 'Langue du rapport',
    wcagReferentialLabel: 'Référentiel audité',
    // item 2.5 (La Corniche pass): a plain space after "·" let the old
    // cover's narrow value column wrap right after the separator, leaving
    // it dangling alone at the end of a line with the next term starting a
    // new one ("WCAG 2.2 AA · Performance · SEO ·" / "GEO"). A non-
    // breaking space after "·" (not before) keeps each "· Term" pair
    // together, so wrapping can only happen between complete terms.
    wcagReferentialValue: 'WCAG 2.2 AA · Performance · SEO · GEO · Vie privée · Sécurité',
    wcagReferentialValueNoPerformance: 'WCAG 2.2 AA · SEO · GEO · Vie privée · Sécurité',
    legalNameLabel: 'Dénomination sociale',
    riskSmallLabel: 'Niveau de criticité des constats',
    riskLevels: { low: 'Faible', medium: 'Moyen', high: 'Élevé' },
    riskBasisTemplate: 'Basé sur {critical} {criticalWord} et {serious} {seriousWord}',
    // item P4 (La Corniche pass, raised across three passes without a
    // fix): the scale had no stated basis for what separates one level
    // from the next. overallRisk is a holistic judgment from the
    // structure pass (severity mix and reach across the site), not a
    // single numeric cutoff - stated honestly as that, rather than
    // inventing specific thresholds that don't actually exist in how the
    // level is decided.
    riskScaleBasisNote:
      "Ce niveau reflète une évaluation d'ensemble de la gravité et de la portée des constats sur le site, pas un seuil numérique unique.",
    criticalFindingSingular: 'constat critique',
    criticalFindingPlural: 'constats critiques',
    seriousFindingSingular: 'constat sérieux',
    seriousFindingPlural: 'constats sérieux',
  },
  executiveSummary: {
    eyebrow: 'Résumé',
    heading: "Ce qu'il faut retenir",
    priorityOwnershipTemplate:
      'Dans les priorités : {firstParty} constats à corriger directement, {thirdParty} à transmettre à un tiers et {verifyIntent} à vérifier selon votre contexte.',
    startHereKicker: 'Par où commencer',
    glossaryPointerSentence:
      'Les termes techniques utilisés dans ce rapport sont définis dans la section « Glossaire ».',
    thirdPartySplitSentenceTemplate:
      "{percent} % des occurrences d'accessibilité proviennent de composants tiers (formulaires, fenêtres modales, widget de réservation), et non du site lui-même.",
    // P2.4 (2026-08-21 La Corniche feedback pass): sets the expectation
    // up front rather than letting the reader discover, 20 pages in,
    // that the SEO/GEO pillars have little to say relative to
    // accessibility.
    categoryImbalanceNote:
      "Ce site présente peu de constats SEO et GEO significatifs par rapport à l'accessibilité : l'essentiel des priorités ci-dessous concerne l'accessibilité.",
    jumpLinkLabelTemplate: 'Voir priorité {rank}',
    topPriorityIsNotLegalWithPointerTemplate:
      "La priorité 1 ci-dessus n'est rattachée à aucun critère d'accessibilité : elle a été classée en premier sur la base de son rapport complexité/impact. Les priorités rattachées à un critère d'accessibilité figurent en position {legalRank}. D'autres obligations, sans lien avec l'accessibilité, peuvent s'appliquer par ailleurs : voir la section « Exposition légale ».",
    topPriorityIsNotLegalNoPointer:
      "La priorité 1 ci-dessus n'est rattachée à aucun critère d'accessibilité : elle a été classée en premier sur la base de son rapport complexité/impact. Aucune des priorités retenues dans ce rapport n'est rattachée à un critère d'accessibilité. D'autres obligations, sans lien avec l'accessibilité, peuvent s'appliquer par ailleurs : voir la section « Exposition légale » pour le détail.",
    summaryCountsTemplate:
      "L'audit a identifié {total} constats au total, dont {actionable} critiques ou sérieux ({critical} critiques et {serious} sérieux).",
    coveredByPrioritiesTemplate:
      'Parmi eux, {covered} sont couverts par les priorités ci-dessous ; les autres sont listés par sévérité dans « {remainingSection} ».',
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
      in_scope: 'Effectif et parcours observés',
      likely_in_scope: 'Parcours à confirmer',
      out_of_scope: 'Seuil ou parcours non observé',
      undetermined: 'Données insuffisantes',
    },
    statusShortDescriptions: {
      in_scope:
        "Le répertoire Sirene et les pages visitées ont fourni les données d'effectif et de parcours transactionnel détaillées ci-dessous.",
      likely_in_scope:
        "Le répertoire Sirene a fourni les données d'entreprise, mais le parcours transactionnel reste à vérifier.",
      out_of_scope:
        "Les données vérifiées indiquent soit un effectif et un chiffre d'affaires sous les seuils cités, soit qu'aucun parcours transactionnel n'a été trouvé sur les pages visitées.",
      undetermined:
        "L'identifiant d'entreprise ou les données Sirene nécessaires n'étaient pas disponibles pour comparer les faits observés aux seuils cités.",
    },
    exposureHeading: 'Exposition en cas de manquement',
    generalEaaReferenceHeading: 'Référence légale générale',
    sirenLabel: 'SIREN',
    sirenTemplate: 'SIREN {siren}, tel que constaté lors de cet audit ({date}).',
    sirenUnavailable: "Aucun numéro SIREN n'a pu être identifié pour ce site lors de cet audit.",
    // item 0.1/1.11 (La Corniche pass): "report, don't conclude" requires
    // printing every registry input relied on, not just the SIREN -
    // effectifsBand is the label already, may be absent when Sirene's
    // headcount field itself is unreliable for this entity's band.
    registrySnapshotTemplate:
      'Données du répertoire Sirene : {denomination}, SIREN {siren}, {effectifs}, consultées le {date}.',
    registrySnapshotEffectifsUnavailable: 'effectif non disponible',
    // P2.1 (2026-08-21 La Corniche feedback pass): a real registry
    // denomination rendered with an unbalanced parenthesis ("(O! DE LA
    // DUNE"), read at first glance as a parsing error - checked directly
    // against sirene-client.ts, which passes the Sirene API's own
    // nom_complet field through unmodified, no truncation or regex
    // involved. Reproduced verbatim rather than corrected, since altering
    // a company's own registry name would misstate a fact the report is
    // supposed to only reproduce - this note explains why instead.
    lcenKicker: 'Autre obligation applicable',
    lcenObserved:
      "Le scan n'a trouvé aucun numéro SIREN, RCS ou TVA publié sur les pages visitées de ce site.",
    lcenSourceTemplate: 'Source : {citation}. Autorité compétente : {authority}.',
    lcenScanLimitNote:
      "Un scan ne visite qu'un nombre limité de pages et peut manquer une page où ces informations figurent. Cette obligation ne dépend pas du résultat de l'analyse d'accessibilité ci-dessus. Faites confirmer votre situation par un conseil juridique.",
    registrySnapshotVerbatimNote:
      "Cette dénomination est reproduite telle qu'elle figure au répertoire Sirene, associée au SIREN ci-dessus, pas déduite du nom de domaine.",
    // item 0.1: when a manual hasTransactionalFlow override disagrees
    // with what the scanner detected, the report must say so plainly
    // rather than silently trusting the override - a confirmed fact from
    // a person still deserves a visible caveat when it contradicts
    // machine evidence, since it can mean either is wrong.
    transactionalFlowConflictTemplate:
      'Signal contradictoire : la détection automatisée a identifié un parcours transactionnel sur ce site, mais une confirmation manuelle indique {manualValue}. À vérifier avant toute décision fondée sur ce statut.',
    transactionalFlowConflictManualAbsent: "l'absence d'un tel parcours",
    transactionalFlowConflictManualPresent: 'sa présence',
    disclaimerNote:
      'Cette section reproduit des critères réglementaires et des données publiques de votre entreprise, sans interprétation juridique supplémentaire. Une confirmation par un conseil juridique reste nécessaire avant toute décision.',
    undeterminedActionNote:
      "Ce statut se précisera si le numéro SIREN de l'entreprise est publié sur le site ou communiqué à l'équipe Odysseus.",
    // P0.3 (2026-08-21 La Corniche feedback pass): this used to list every
    // non-homepage URL in the crawl, including legal-notice pages like
    // /cookies/ or /politique-de-confidentialite/, implying the booking
    // funnel itself lived on those pages - it doesn't; the booking widget
    // is a site-wide layout component. States the mechanism and names the
    // actual detected component instead of dumping the whole page list.
    transactionalFlowOnSiteTemplate:
      "Un moteur de réservation est intégré via un composant présent sur l'ensemble du périmètre analysé ({vendors}). Exemples de pages où il a été relevé : {examplePages}.",
    transactionalFlowOnSiteNoVendorTemplate:
      'Le parcours transactionnel identifié est intégré directement sur le site, via un composant présent sur plusieurs pages du périmètre analysé. Exemples de pages où il a été relevé : {examplePages}.',
    transactionalFlowDelegatedTemplate:
      "Le parcours transactionnel identifié est délégué à un prestataire tiers ({domain}). Ce domaine n'a pas été exploré dans le cadre de cet audit, qui reste circonscrit au domaine du site audité.",
    transactionalFlowDelegatedDomainUnknown: 'domaine non identifié',
  },
  checklist: {
    eyebrow: 'Check-list imprimable',
    heading: 'Check-list des priorités',
    // P2.5 (2026-08-21 La Corniche feedback pass): 13 of the report's
    // pages are CSS-selector tables meant for a developer, not the
    // director reading the report - labeled explicitly rather than left
    // to be inferred from content alone.
    intro:
      "Page pensée pour être imprimée ou capturée seule, sans prose, uniquement l'essentiel. À transmettre à votre prestataire technique.",
    rankColumnLabel: '#',
    priorityColumnLabel: 'Priorité',
    complexityColumnLabel: 'Complexité',
    impactColumnLabel: 'Impact',
    pagesColumnLabel: 'Pages',
    findingsColumnLabel: 'Constats',
    wcagColumnLabel: 'WCAG',
    identifierTemplate: '{company} · {date}',
  },
  themes: {
    eyebrow: 'Priorités',
    headingTemplate: '{count} chantiers, classés par complexité et par impact',
    // P1.5 (2026-08-21 La Corniche feedback pass): a coarse, deterministic
    // band, not a precise quote - stated as such rather than implying
    // false precision. Template: {min}, {max}, {count}.
    aggregateEffortEstimateTemplate:
      "Estimation globale : {min} à {max} jours de développement pour l'ensemble des {count} chantiers ci-dessous (estimation large, non contractuelle). Un chantier relevant d'un composant tiers dépend en outre du délai de son éditeur.",
    effortLabel: 'Effort',
    impactLabel: 'Impact commercial',
    affectedPagesLabel: 'Pages affectées',
    conformityLabel: 'Conformité',
    conformityNotApplicable: 'Sans objet',
    // P2.2 (2026-08-21 La Corniche feedback pass): "Sans objet" read as
    // "unknown" at the point it's first encountered - the explanation
    // only lived in the glossary, 20 pages later.
    conformityNotApplicableGloss: "ce chantier ne relève pas de l'accessibilité",
    conformityNonConformant: 'Non conforme',
    legalTagLabel: 'Exigence de conformité',
    impactCitationLabel: 'Repère chiffré',
    measuredCoreWebVitalGapTemplate:
      'Écart mesuré sur ce site : {metric} médian à {value}, soit {gap} au-dessus du seuil « bon » ({threshold}).',
    revenueImpactTemplate:
      "Sur la base de votre chiffre d'affaires déclaré ({turnover} €), et si cette association se vérifiait pour votre activité, l'ordre de grandeur serait de jusqu'à {impact} € par an. Il s'agit d'une estimation indicative fondée sur une seule étude, pas d'une prévision garantie.",
    quickWinBadgeLabel: 'Gain rapide',
    recommendedActionsLabel: 'Actions recommandées',
    reviewedRemediationLabel: 'Remédiation technique vérifiée',
    ownershipCountsTemplate:
      'Responsabilité : {firstParty} à corriger directement, {thirdParty} à transmettre à un tiers, {verifyIntent} à vérifier selon le contexte.',
    effortImpactLevels: { low: 'Faible', medium: 'Moyen', high: 'Élevé' },
    pagesOfTotalTemplate: '{pages} {pageWord} sur {totalPages}',
    refsLabel: 'Constats',
    // P1.2 (2026-08-21 La Corniche feedback pass): splits a priority
    // card's own recommended-action ask when it spans both first- and
    // third-party pages, since the model's own prose can't know which
    // pages the client's agency can actually touch. Template:
    // {firstPartyPages}, {firstPartyPageWord}, {thirdPartyPages},
    // {thirdPartyPageWord}, {vendor}.
    // B2.3/B2.4 (2026-08-24): the two page counts are unions over
    // overlapping sets, not a partition of the site, and the old wording
    // ("37 pages ... 36 pages ...") invited a reader to add them to 73 on a
    // 43-page site. Reworded to say which side each concerns without
    // implying the two sum. {vendor} now carries its own preposition so
    // elision is correct for a vowel-initial label ("d'un composant tiers"),
    // which the hardcoded "de {vendor}" got wrong.
    ownershipSplitTemplate:
      'Ce chantier concerne {firstPartyPages} {firstPartyPageWord} relevant de votre site (votre agence peut corriger) et {thirdPartyPages} {thirdPartyPageWord} relevant de {vendor} (à transmettre à son éditeur) ; une même page peut relever des deux.',
    // "ce composant tiers" rather than "un composant tiers": the template
    // renders "relevant de {vendor}", and "de un" is ungrammatical while
    // "de ce" is not - which removes the elision problem instead of
    // special-casing it.
    ownershipSplitUnknownVendorLabel: 'ce composant tiers',
    thirdPartyOnlyTemplate:
      'Ce chantier relève entièrement de {vendor} : la correction doit passer par son éditeur, pas par votre agence web.',
    lcenCrossReferenceTemplate:
      'Ce constat relève de l’obligation légale d’identification détaillée dans « {legalSection} ».',
    // Plan 018 step 6: each priority card reads outcome first (why it
    // matters), then the deterministic observation (what we observed,
    // never counts alone: the defect label leads), then the actions.
    whyItMattersLabel: "Pourquoi c'est important",
    observationLabel: 'Ce que nous avons observé',
    observationWithPageTemplate:
      'Constat représentatif : « {defect} », relevé par exemple sur la page {page}. Ce chantier concerne {pages} {pageWord} et {occurrences} {occurrenceWord}.',
    observationNoPageTemplate:
      'Constat représentatif : « {defect} ». Ce chantier concerne {pages} {pageWord} et {occurrences} {occurrenceWord}.',
    whatYouCanDoLabel: 'Ce que vous pouvez faire',
    complexityLabel: 'Complexité',
  },
  renderDiffEvidence: {
    eyebrow: 'Preuve de rendu',
    heading: 'Ce que reçoit un moteur de recherche avant JavaScript',
    intro:
      "Chaque page est chargée deux fois : une fois sans JavaScript, comme le fait un robot d'indexation basique, une fois dans un navigateur complet. La différence mesure le contenu invisible pour les moteurs.",
    rawBarLabelTemplate: 'HTML brut - {chars} caractères',
    renderedBarLabelTemplate: 'Page rendue - {chars} caractères',
    charCountsUnavailableNote: 'Nombre de caractères non mesuré pour cette page.',
    missingCaptionTemplate:
      'Manquant : {percent}% du texte visible absent du HTML brut, sur {selector}.',
    missingCaptionNoSelectorTemplate: 'Manquant : {percent}% du texte visible absent du HTML brut.',
    // item 3.3 (La Corniche pass): "détail dans l'export technique"
    // promised a deliverable that does not exist in this product (see
    // item 3.3's own doc entry and offer-positioning.md - the full audit
    // has no separate technical-export artifact). Stated as a plain
    // fact instead, with no pointer to something the client cannot
    // actually receive.
    // P1.4 (2026-08-21 La Corniche feedback pass): "présentent le même
    // écart" read as if this section enumerated one specific annexe
    // finding's complete page list - it doesn't. This gallery samples the
    // site's most render-affected pages generally (missingPercent
    // threshold across all pages), independent of any single rule's own
    // page list in the annexe. Reworded so the two sections no longer
    // read as contradicting each other's counts.
    overflowTextTemplate: '{count} autres pages du site présentent un écart de rendu comparable.',
    overflowTextSingularTemplate: '1 autre page du site présente un écart de rendu comparable.',
    positiveStatementTemplate:
      "Les pages commerciales de ce site conservent leur texte dans le HTML brut : aucun écart de rendu significatif n'a été mesuré.",
    positiveStatementWrapperNote:
      "Seules les pages d'intégration de contenu tiers font exception à ce constat, voir la section Observations.",
  },
  coreWebVitals: {
    eyebrow: 'Performance',
    heading: 'Mesures de performance',
    introTemplate:
      'Valeurs médianes agrégées sur les {pages} pages. Simulation mobile avec limitation réseau, passage unique, données de laboratoire (Lighthouse) et non de terrain.',
    metricColumnLabel: 'Métrique',
    valueColumnLabel: 'Valeur médiane',
    realUserValueColumnLabel: '75e percentile',
    worstPageColumnLabel: 'Pire page',
    worstPageSameAsMedian: 'Comme la médiane',
    worstPageFootnote:
      'Un constat est classé selon la page la plus défavorable, pas selon la médiane : un statut "Critique" peut donc coexister avec une médiane "à améliorer" quand une page isolée est nettement plus lente que les autres.',
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
    allUnmeasuredNote:
      "La mesure de performance (Lighthouse) n'a pas abouti sur ce site pour cet audit et aucun constat de performance n'est donc rapporté ici. Voir la section « Méthodologie et limites » pour le détail.",
    realUserHeading: 'Données réelles (Chrome UX Report)',
    realUserIntro:
      'Données de terrain issues des visiteurs Chrome réels de ce site sur les 28 derniers jours, lorsque des données publiques existent, en complément des mesures de laboratoire ci-dessus.',
    realUserNoDataNote:
      "Aucune donnée Chrome UX Report publique n'existe pour ce site, le plus souvent parce qu'il ne reçoit pas encore assez de trafic Chrome pour atteindre le seuil de publication de Google. Ce n'est ni un succès ni un échec, cela signifie simplement qu'aucune comparaison avec des utilisateurs réels n'est disponible pour cet audit.",
    realUserGapNote:
      'Un écart important entre les valeurs ci-dessus et ci-dessous est normal : la mesure de laboratoire simule volontairement des conditions difficiles (limitation CPU et réseau, un seul passage), tandis que les données réelles reflètent des visiteurs sur des appareils et connexions variés. Les deux mesures répondent à des questions différentes, elles ne se contredisent pas.',
    inpLabel: 'INP, réactivité',
  },
  accessibilityStatement: {
    eyebrow: 'Déclaration',
    heading: "Projet de déclaration d'accessibilité",
    intro: 'Squelette généré à partir des constats, à compléter par le client avant publication.',
    criterionColumnLabel: 'Critère',
    statusColumnLabel: 'Statut de conformité',
    nonConformantLabel: 'Non conforme',
    contactHeading: 'Contact',
    contactBody:
      '[Adresse e-mail de contact à compléter par le client] - processus de signalement à définir.',
    contactEmailToConfirmTemplate:
      '{email} (détecté automatiquement, à confirmer avant publication)',
    remediationPlanHeading: 'Plan de remédiation',
    remediationPlanBodyTemplate: 'Voir la section « {section} » ci-dessus pour le plan.',
    firstPublicationDateLabel: 'Date de première publication',
    technologiesLabel: 'Technologies utilisées',
    testEnvironmentLabel: 'Environnement de test',
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
        definition:
          'Sévérité la plus haute : bloque une tâche essentielle pour une partie des utilisateurs.',
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
        definition: 'Correctif à faible complexité et fort impact, à traiter en priorité.',
      },
      {
        id: 'lcp',
        term: 'LCP (Largest Contentful Paint)',
        definition:
          "Temps d'affichage du plus grand élément visible de la page, un indicateur de vitesse perçue.",
      },
      {
        id: 'fcp',
        term: 'FCP (First Contentful Paint)',
        definition: "Temps avant le premier affichage de contenu à l'écran.",
      },
      {
        id: 'tbt',
        term: 'TBT (Total Blocking Time)',
        definition:
          "Temps de blocage total : durée pendant laquelle la page ne répond pas aux interactions de l'utilisateur.",
      },
      {
        id: 'cls',
        term: 'CLS (Cumulative Layout Shift)',
        definition:
          "Stabilité visuelle : mesure les déplacements inattendus d'éléments pendant le chargement de la page.",
      },
      {
        id: 'speed-index',
        term: 'Speed Index',
        definition:
          "Vitesse à laquelle le contenu visible d'une page se remplit pendant le chargement.",
      },
      {
        id: 'seo',
        term: 'SEO',
        definition:
          'Référencement naturel : optimisation pour la visibilité dans les résultats des moteurs de recherche.',
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
          'Un constat est un problème distinct après regroupement ; une occurrence est chacune de ses apparitions individuelles sur le site. Un même constat peut compter plusieurs occurrences.',
      },
      {
        id: 'selecteur',
        term: 'Sélecteur',
        definition:
          "Expression technique identifiant précisément l'élément concerné dans le code de la page.",
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
          "Fonctionnalité du site permettant de réserver, ajouter au panier ou payer directement en ligne - le critère qui déclenche l'obligation EAA.",
      },
      {
        id: 'sans-objet',
        term: 'Sans objet',
        definition:
          "Utilisé pour un chantier prioritaire qui n'est pas une question de conformité (ex. performance, SEO) : la colonne conformité ne s'applique tout simplement pas à ce type de constat.",
      },
      {
        id: 'recherche-emergente',
        term: 'Recherche émergente',
        definition:
          "Signale une statistique citée à titre indicatif, dont la méthodologie ou le corpus de preuves est encore jeune - à distinguer d'une statistique établie, citée sans cette réserve.",
      },
      {
        id: 'signaux-a-verifier',
        term: 'Signaux à vérifier',
        definition:
          "Alertes heuristiques sur la qualité probable d'un contenu (ex. texte alternatif générique ou dupliqué), distinctes des critères WCAG en échec confirmés : elles indiquent un doute à vérifier manuellement, pas une non-conformité établie.",
      },
      {
        id: 'pages-concernees',
        term: 'Pages concernées',
        definition:
          "Nombre total de pages distinctes touchées par au moins un constat pour ce critère, tous constats de ce critère confondus (une union, pas le compte d'un seul constat pris isolément).",
      },
      {
        id: 'rendu',
        term: 'Rendu',
        definition:
          "Catégorie de constats liés à l'écart entre le contenu HTML brut d'une page et son contenu une fois le JavaScript exécuté - pertinent pour ce qu'un moteur de recherche ou un lecteur d'écran peut manquer.",
      },
      {
        id: 'sirene',
        term: 'Sirene',
        definition:
          "Répertoire officiel des entreprises et établissements en France (INSEE), utilisé ici pour vérifier la taille de l'entreprise et confirmer à quelle entité un constat se rapporte.",
      },
      {
        id: 'complexity',
        term: 'Complexité',
        definition:
          "Estimation qualitative (Faible / Moyen / Élevé) de la complexité de correction d'un chantier prioritaire, dérivée de la famille de règles et de la concentration des occurrences.",
      },
      {
        id: 'impact-commercial',
        term: 'Impact commercial',
        definition:
          "Estimation qualitative (Faible / Moyen / Élevé) de l'effet attendu d'un correctif sur l'expérience client, la conversion ou la visibilité - distincte de la sévérité technique du constat.",
      },
    ],
  },
  nextSteps: {
    // item P4 (La Corniche pass): "Suite" as the section eyebrow read as
    // vague even before the section briefly went missing (item 0.2) -
    // matches the section's own heading below now.
    eyebrow: 'Prochaines étapes',
    heading: 'Prochaines étapes & contact',
    // Plan 018 step 7: one compact synthesis before the full legal
    // reference replaces the former three sales cards.
    synthesisStake:
      "Votre site est un canal direct de réservation et d'information : son accessibilité, sa visibilité dans les moteurs de recherche et les assistants IA, et sa vitesse conditionnent ce que vos visiteurs peuvent y faire. Ce rapport en dresse les constats mesurés ; leur correction relève des rôles ci-dessous.",
    synthesisCoverageTemplate:
      'Priorités classées : {priorities}. Couvrant au moins un constat critique ou sérieux : {seriousCritical}. Gains rapides, faible complexité pour un impact moyen ou élevé : {quickWins}.',
    synthesisCoverageFallback:
      "La répartition des constats par gravité figure plus haut dans ce rapport, dans les priorités classées et les chiffres de l'audit.",
    synthesisRoles:
      'Qui agit ensuite : la direction arbitre et suit ; le prestataire technique ou le service informatique corrige ; la communication vérifie les contenus publiés ; le juridique confirme les obligations applicables.',
    synthesisReauditRecommendation:
      'Après la correction des priorités, un ré-audit du même périmètre est recommandé, normalement dans un délai de trois à six mois, une fois les correctifs en ligne.',
    synthesisComparisonWithFieldData:
      'La comparaison porte uniquement sur ce que le scan recalcule : les constats par gravité, les critères WCAG 2.2 AA en échec et les données réelles du Chrome UX Report.',
    synthesisComparisonWithoutFieldData:
      'La comparaison porte uniquement sur ce que le scan recalcule : les constats par gravité et les critères WCAG 2.2 AA en échec.',
    synthesisConversionNote:
      "Votre propre taux de conversion, suivi avec vos outils, reste une mesure distincte : le ré-audit ne l'estime pas.",
    questionTitle: 'Une question ?',
    questionBodyTemplate:
      "Toute demande de clarification sur un constat ou une priorité peut être adressée à l'équipe Odysseus à {email}, en citant l'identifiant du constat concerné.",
    // item 3.12: the offer must state a price, a lead time, and a way to
    // order it. Figures come only from ODYSSEUS_REAUDIT_PRICE_EUR_HT /
    // ODYSSEUS_REAUDIT_LEAD_TIME_DAYS (html-utils.ts), never from copy.
    // Template: {price}, {days}, {email}.
    reauditPricingTemplate:
      'Tarif indicatif : {price} € HT, sous {days} jours ouvrés après confirmation des correctifs. Pour en faire la demande, écrivez à {email}.',
    authorshipTemplate:
      'Rapport produit par {producer}, rendu le {renderDate} (build de rendu {renderBuild}, modèle {templateVersion}), à partir du scan achevé le {scanDate} (build de scan {scanBuild}), identifiant de rapport {reportId}.',
    issuerBlockTemplate: 'Signataire : {signatory}. SIRET : {registrationNumber}.',
    liabilityStatement:
      "Ce rapport reproduit des constats techniques détectés par des outils automatisés, accompagnés d'explications et de priorisations. Il ne constitue pas un avis juridique ; voir la section « Exposition légale » et la méthodologie pour les limites de couverture. Odysseus ne saurait être tenu responsable des décisions prises sur la seule base de ce document.",
  },
  findingsAppendix: {
    eyebrow: 'Annexe technique',
    heading: 'Liste complète des constats',
    // P2.5: labeled explicitly for the developer/agency audience, same
    // reasoning as the checklist page above.
    intro:
      'Chaque constat détecté par les outils automatisés, y compris ceux jugés mineurs et non repris dans les priorités ci-dessus. À transmettre à votre prestataire technique.',
    categoryLabels: {
      accessibility: 'Accessibilité',
      seo: 'Référencement (SEO)',
      geo: "Visibilité dans les moteurs d'IA (GEO)",
      performance: 'Performance',
      rendering: 'Rendu',
      // 'Confidentialité et sécurité' rather than a single word: the
      // category holds both cookie/consent findings and response-header
      // ones, and a French SMB reader recognises the pair together.
      privacy: 'Confidentialité et sécurité',
    },
    geoEmergingLabel: 'Recherche émergente',
    thirdPartyHeading: 'À traiter avec vos prestataires tiers',
    thirdPartyIntro:
      "Ces constats concernent du code appartenant à un plugin, un widget ou un cadre tiers (moteur de réservation, bannière de cookies, aperçu, formulaire). Votre agence ne peut pas modifier ce code directement : la correction passe par le prestataire ou l'éditeur concerné.",
    // P2.3 (2026-08-21 La Corniche feedback pass): a real report counted
    // a Complianz cookie-consent finding among the "sérieux" total on the
    // cover while this section noted the current implementation needs no
    // action - both true at once, but nothing said so, reading as an
    // unexplained contradiction. Revised 2026-08-30: the first wording
    // overcorrected into two flat contradictory propositions ("un écart
    // de conformité réel ... même lorsque l'implémentation ... s'avère
    // déjà correcte"). The note now explains how the two statements
    // compose: the totals classify by the rule's general severity, this
    // section adds the site-specific observation.
    thirdPartyCountedInTotalsNote:
      "Ces constats restent comptabilisés dans les totaux de sévérité en tête de rapport : les totaux reprennent tous les constats relevés par l'audit, classés selon la gravité générale de leur règle. Un constat peut donc figurer dans ces totaux alors même que cette section précise que l'implémentation observée sur votre site est déjà correcte : le total décrit la règle générale, l'observation décrit votre cas.",
    unknownVendorLabel: 'Composant tiers, éditeur non identifié',
    severityLabels: {
      critical: 'Critique',
      serious: 'Sérieux',
      moderate: 'Modéré',
      minor: 'Mineur',
    },
    findingIdColumnLabel: 'Constat',
    pagesColumnLabel: 'Pages',
    allPagesAnalyzedTemplate: 'Toutes les pages analysées ({count})',
    andNMoreTemplate: 'et {count} autres',
    andNMoreSingularTemplate: 'et {count} autre',
    affectedFilesCountTemplate: '{count} fichiers concernés',
    affectedFilesCountSingularTemplate: '{count} fichier concerné',
    affectedFilesLabel: 'Fichiers',
    affectedFilesSampleLabel: 'Fichiers (exemples)',
    samePagesAsTemplate: 'Mêmes pages que {findingId}',
    pagesMaxColumnLabel: 'Pages max',
    occurrencesColumnLabel: 'Occurrences',
    selectorColumnLabel: 'Sélecteur (exemple)',
    findingSingular: 'constat',
    findingPlural: 'constats',
    occurrenceSingular: 'occurrence',
    occurrencePlural: 'occurrences',
    pageSingular: 'page',
    pagePlural: 'pages',
    wcagLabel: 'WCAG',
    observationsCrossRefLabel: 'voir Observations',
    splitGroupThirdPartyNoteTemplate:
      'Encore {count} occurrences de cette règle concernent un composant tiers ; voir « {thirdPartyHeading} ».',
    crawledPagesHeadingTemplate: 'Pages analysées ({count})',
  },
  methodology: {
    eyebrow: 'Méthodologie et limites',
    heading: 'Comment cet audit a été réalisé',
    languageCoverageTemplate: 'Langues couvertes par cette analyse : {languages}.',
    languageNotScannedTemplate:
      "Aucune page n'a été analysée pour les langues suivantes, bien que le site en publie : {languages}.",
    sitemapCoverageTemplate:
      "Détail du périmètre : {total} pages analysées, dont {linked} atteintes depuis la page d'accueil ou par des liens internes et {sitemapOnly} ajoutées depuis le sitemap.",
    sitemapCoverageWithSeedsTemplate:
      "Détail du périmètre : {total} pages analysées, dont {linked} atteintes depuis la page d'accueil ou par des liens internes, {seeded} fournies explicitement et {sitemapOnly} ajoutées depuis le sitemap.",
    sitemapIncompleteTemplate:
      "La couverture du sitemap est incomplète. Fichiers sitemap non lus : {failed}. URL de pages déclarées hors du périmètre autorisé ou filtrées par les règles de l'audit : {filtered}. Pages éligibles omises en raison du plafond configuré : {omitted}.",
    toolingParagraphTemplate:
      "L'audit combine des outils de détection automatisée, tous déterministes : aucun constat n'est inventé ou deviné. Moteur d'accessibilité axe-core {axeVersion}, moteur de performance Lighthouse {lighthouseVersion} sur profil mobile simulé, comparaison de rendu par double chargement de chaque page, JavaScript désactivé puis activé. Référentiel audité : WCAG 2.2, niveau AA. Périmètre : {pages} pages analysées le {date} à partir de la page d'accueil. Une URL qui ne fait que mener à l'accueil d'une langue (par exemple /en) n'est pas comptée comme une page analysée, car elle ne porte pas de contenu propre ; les pages de cette langue sont explorées normalement.",
    automatedCoverageCaveat:
      "Les outils automatisés détectent une part reconnue mais limitée des problèmes d'accessibilité, une estimation généralement admise situant cette part entre 30 et 40 pour cent des critères, sans source unique attribuable. C'est une propriété de tout audit automatisé, pas une réserve sur celui-ci : elle garantit que chaque constat listé est vérifiable. Cet audit inclut une passe d'accessibilité étendue couvrant la navigation au clavier, l'ordre de focus, la gestion des erreurs de formulaire, la présence de sous-titres vidéo, et un signal heuristique sur la qualité des textes alternatifs. Cet audit est entièrement automatisé : certaines propriétés d'accessibilité ne peuvent pas être évaluées de manière fiable par des outils automatisés seuls et ne font l'objet d'aucun constat dans ce rapport.",
    extendedPassNoneFoundNote:
      "Résultat de la passe d'accessibilité étendue : aucun piège au clavier, aucune anomalie d'ordre de focus, aucune erreur de formulaire non associée à son champ, et aucune vidéo sans sous-titres n'a été détecté sur les pages analysées.",
    // item 1.7 (La Corniche pass): extendedPassNoneFoundNote above only
    // ever rendered when all four checks found nothing at all - one
    // finding on any single check (e.g. a video without captions)
    // silently suppressed the whole note, so the other three checks,
    // which genuinely found nothing, went unstated. Per-check status is
    // rendered instead whenever at least one check found something, so a
    // clean result is always stated rather than only implied by silence.
    extendedPassResultTemplate: "Résultat de la passe d'accessibilité étendue : {checks}.",
    extendedPassCheckKeyboardTrapsLabel: 'pièges au clavier',
    extendedPassCheckFocusOrderLabel: 'ordre de focus',
    extendedPassCheckFormErrorsLabel: 'erreurs de formulaire non associées à leur champ',
    extendedPassCheckVideoCaptionsLabel: 'sous-titres vidéo',
    extendedPassCheckCleanLabel: 'aucune anomalie détectée',
    extendedPassCheckFoundSingular: 'constat détecté',
    extendedPassCheckFoundPlural: 'constats détectés',
    legalCitationInScopeTemplate:
      'Critères publiés pour {regimeName}, sous le contrôle {authority} ({legalCitation}). Faits vérifiés pour cet audit : {facts}',
    legalCitationLikelyInScopeTemplate:
      'Critères publiés pour {regimeName}, sous le contrôle {authority} ({legalCitation}). Faits vérifiés pour cet audit : {facts}',
    legalCitationOutOfScopeParagraph:
      'Critères publiés pour {regimeName}, sous le contrôle {authority} ({legalCitation}). Faits vérifiés pour cet audit : {facts}',
    legalCitationUndeterminedParagraph:
      'Critères publiés pour {regimeName}, sous le contrôle {authority} ({legalCitation}). Données disponibles pour cet audit : {facts}',
    legalCitationEffectifFactTemplate: "L'entreprise compte {label} d'après le répertoire Sirene.",
    legalCitationTurnoverFactTemplate:
      "Le chiffre d'affaires annuel enregistré est de {amount} ; le seuil publié est de {threshold}.",
    legalCitationSmeFactTemplate:
      "Le répertoire indique la tranche d'effectif {effectifCode} et un chiffre d'affaires de {turnover}.",
    legalCitationTransactionalFlowFactTemplate:
      'Le site propose un parcours de {flowType} {location}.',
    legalCitationTransactionalFlowLocationOnSite: 'directement en ligne',
    legalCitationTransactionalFlowLocationDelegated: 'en ligne, délégué à un prestataire tiers',
    legalCitationTransactionalFlowUnknownFact:
      "La présence d'un parcours de réservation, panier ou paiement en ligne n'a pas pu être confirmée sur l'ensemble du site.",
    legalCitationNoTransactionalFlowFact:
      "Aucun parcours de réservation, panier ou paiement en ligne n'a été trouvé sur les pages visitées.",
    legalCitationSirenMissingFact: "Aucun identifiant SIREN n'a été trouvé sur les pages visitées.",
    legalCitationSireneLookupFailedTemplate:
      "La consultation du répertoire Sirene n'a pas fourni de fiche exploitable ({reason}).",
    transactionalFlowTypeLabels: {
      booking: 'réservation',
      cartOrPayment: 'panier ou de paiement',
      both: 'réservation, panier ou paiement',
    },
    legalCitationManualSirenWithFindingTemplate:
      'Le numéro SIREN utilisé pour cette détermination a été fourni manuellement, ce site ne le publie pas lui-même (voir constat {findingId}).',
    legalCitationManualSirenNoFindingSentence:
      'Le numéro SIREN utilisé pour cette détermination a été fourni manuellement, ce site ne publie pas ce numéro lui-même.',
    legalCitationSirenMismatchTemplate:
      'Le numéro SIREN fourni manuellement ({manualSiren}) diffère de celui publié sur le site ({extractedSiren}). Cette détermination retient le numéro fourni manuellement.',
    legalCitationPointerSentence:
      "Le détail de l'exposition légale figure dans la section « Exposition légale ».",
    socialExclusionDisclosureTemplate:
      "{count} pages ont été exclues de ce scan car elles redirigent vers un réseau social tiers, selon la liste d'exclusion par défaut d'Odysseus.",
    socialExclusionDisclosureSingularTemplate:
      "1 page a été exclue de ce scan car elle redirige vers un réseau social tiers, selon la liste d'exclusion par défaut d'Odysseus.",
    // item P4 (La Corniche pass): rephrased so the sentence doesn't start
    // with a numeral, plain French style.
    crawlCapDisclosureTemplate:
      'Le plafond configuré pour cet audit est de {maxPages} pages, pas la totalité du site : le site peut compter des pages supplémentaires non analysées.',
    sirenSourceResolvedTemplate:
      'Le numéro SIREN a été confirmé comme affiché sur cette page du site : {url}.',
    // P0.1 (2026-08-21 La Corniche feedback pass): the generic "n'a pas
    // abouti... voir Méthodologie" pointer in the performance section used
    // to lead here and find nothing further. This states the real,
    // per-reason failure counts captured from the scan itself, never a
    // guessed or generic explanation.
    lighthouseFailureIntroSentence:
      "La mesure de performance (Lighthouse) n'a pas abouti sur ce site pour cet audit. Détail des échecs constatés :",
    lighthouseFailureReasonTemplate: '{count}/{total} pages : {reason}',
    lighthouseFailureReasons: {
      browserUnreachable: "le navigateur de mesure n'a pas pu être contacté",
      processStopped: "la mesure s'est interrompue avant de renvoyer un résultat",
      timedOut: 'la mesure a dépassé le temps imparti',
      unknown: "la mesure n'a pas abouti pour une raison technique",
    },
  },
  footer: {
    confidentialityLabel: 'Rapport confidentiel',
    pageLabel: 'Page',
  },
};
