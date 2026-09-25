import type { ReportStrings } from './types.js';

export const fr: ReportStrings = {
  accessibilityStatementGuidance: {
    heading: "Déclaration d'accessibilité",
    notFoundObservation:
      "Aucune déclaration d'accessibilité n'a été trouvée sur les pages visitées.",
    article47Recommendation:
      "Cette analyse retient l'obligation de l'article 47 de la loi n° 2005-102, qui vise les organismes publics et les entreprises dont le chiffre d'affaires dépasse 250 millions d'euros. Publiez la déclaration et ajoutez un lien vers celle-ci depuis le pied de page.",
    optionalRecommendation:
      "La déclaration d'accessibilité est une obligation de l'article 47 de la loi n° 2005-102, qui vise les organismes publics et les entreprises dont le chiffre d'affaires dépasse 250 millions d'euros. En dehors de ce cas, sa publication est une bonne pratique facultative : vous pouvez publier une déclaration et ajouter un lien depuis le pied de page.",
  },
  toc: {
    eyebrow: 'Sommaire',
    heading: 'Contenu du rapport',
    overviewGroupLabel: "Vue d'ensemble",
    priorityActionsGroupLabel: 'Actions prioritaires',
    detailedResultsGroupLabel: 'Résultats détaillés',
    regulatoryFrameworkGroupLabel: 'Cadre réglementaire',
    appendicesGroupLabel: 'Annexes',
  },
  reportIntro: {
    eyebrow: 'À propos de ce rapport',
    heading: 'Situation, constats et question',
    situationHeading: 'La situation',
    situationBody:
      "Ce rapport répond à un besoin simple : disposer d'un état des lieux factuel du site, établi par des tests automatisés et reproductibles, pour décider quoi corriger et dans quel ordre. Des outils déterministes ont visité le périmètre analysé et comparé chaque page à des critères publics : accessibilité (WCAG 2.2 niveau AA), vitesse de chargement (Core Web Vitals), référencement naturel (SEO), visibilité auprès des assistants IA (GEO), et rendu sans JavaScript. Chaque constat listé dans ce rapport provient d'un de ces tests : rien n'est inventé, rien n'est deviné.",
    complicationHeading: 'Ce que le diagnostic relève',
    complicationBodyTemplate:
      "L'analyse a relevé {findings}, dont {criticalSerious} de gravité critique ou sérieuse, sur au moins {pages} du périmètre analysé. Le regroupement en {priorities} indique par où commencer.",
    pageSingular: 'page',
    pagePlural: 'pages',
    findingSingular: 'constat distinct',
    findingPlural: 'constats distincts',
    prioritySingular: 'priorité classée',
    priorityPlural: 'priorités classées',
    consequenceRegulatoryOverseas:
      'Le régime d’accessibilité applicable à votre territoire reste à vérifier ; la section « {legalSection} » précise ce point.',
    consequenceRegulatoryBelowThresholds:
      "D'après le répertoire Sirene, l'effectif et le chiffre d'affaires de votre établissement se situent sous les seuils de taille publiés pour l'obligation d'accessibilité numérique : la section « {legalSection} » décrit ces critères et les faits enregistrés, à faire confirmer par votre conseil juridique.",
    consequenceRegulatory:
      "Des obligations légales peuvent s'appliquer à votre établissement : la section « {legalSection} » décrit les critères publiés et les faits enregistrés, à faire confirmer par votre conseil juridique.",
    notALegalOpinionNote:
      "Ce que ce rapport n'est pas : un avis juridique (voir la section « {legalSection} ») ; un audit exhaustif, la détection automatique couvrant environ 30 à 40 % des critères d'accessibilité (voir « {methodologySection} »).",
    audienceHeading: "À qui s'adresse ce rapport",
    roleManagementLabel: 'La direction',
    roleTechnicalLabel: 'Prestataire technique ou service informatique',
    roleCommunicationsLabel: 'Communication',
    roleLegalLabel: 'Juridique',
  },
  statistics: {
    eyebrow: "L'audit en chiffres",
    heading: "Ce que l'analyse a relevé",
    introTemplate:
      '{pages}, {findings} constats distincts après regroupement des répétitions. Un constat présent sur plusieurs pages compte une seule fois.',
    pagesAnalyzedSingular: 'page analysée',
    pagesAnalyzedPlural: 'pages analysées',
    findingsTileLabel: 'constats distincts',
    accessibilityOccurrencesTileLabel: "occurrences d'accessibilité",
    heuristicOccurrencesExcludedNoteTemplate:
      "Le nombre d'occurrences d'accessibilité exclut {count} occurrences supplémentaires provenant d'un signal heuristique sur la qualité des textes alternatifs, qui n'est pas un test de conformité déterministe (voir la section « Signaux à vérifier »). Les constats correspondants restent comptés parmi les constats distincts.",
    criticalDriverNoteTemplate: 'Ces constats critiques proviennent uniquement de : {rules}.',
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
      "{percent} % des occurrences d'accessibilité proviennent de composants tiers (formulaires, fenêtres modales, widget de réservation). La section « À traiter avec vos prestataires tiers » de l'annexe technique les recense, ainsi que celles des autres catégories.",
    thirdPartyFrameNoteSingularTemplate:
      'En outre, {count} occurrence relève entièrement de contenus tiers intégrés (lecteurs vidéo, cartes, widgets) ; elle figure dans l’annexe technique et n’est comptée ni dans ces totaux ni dans la note principale.',
    thirdPartyFrameNotePluralTemplate:
      'En outre, {count} occurrences relèvent entièrement de contenus tiers intégrés (lecteurs vidéo, cartes, widgets) ; elles figurent dans l’annexe technique et ne sont comptées ni dans ces totaux ni dans la note principale.',
    unlinkedSitemapNoteSingularTemplate:
      'Le plan du site publie {pages} pages qu’aucune page du site ne relie. {count} constat ne concerne que ces pages : il figure dans l’annexe technique et n’est compté ni dans ces totaux ni dans la note principale.',
    unlinkedSitemapNotePluralTemplate:
      'Le plan du site publie {pages} pages qu’aucune page du site ne relie. {count} constats ne concernent que ces pages : ils figurent dans l’annexe technique et ne sont comptés ni dans ces totaux ni dans la note principale.',
    priorityOwnership: {
      leadTemplate: 'Priorités : {clauses}.',
      firstPartySingularTemplate: '{count} constat à corriger directement',
      firstPartyPluralTemplate: '{count} constats à corriger directement',
      thirdPartySingularTemplate: '{count} à confier à un tiers',
      thirdPartyPluralTemplate: '{count} à confier à un tiers',
      verifyIntentSingularTemplate: '{count} à vérifier au préalable',
      verifyIntentPluralTemplate: '{count} à vérifier au préalable',
      clauseSeparator: ', ',
      clauseConjunction: ', ',
    },
    pagesWithCriticalTileLabel: 'pages avec au moins un constat critique',
    criticalTileLabel: 'critiques',
    seriousTileLabel: 'sérieux',
    moderateTileLabel: 'modérés',
    minorTileLabel: 'mineurs',
    wcagFailingDescriptionTemplate: '{criteria} en échec sur {pages}',
    wcagCriterionSingular: 'critère WCAG 2.2 AA',
    wcagCriterionPlural: 'critères WCAG 2.2 AA',
    pageSingular: 'page',
    pagePlural: 'pages',
    wcagFailingHeading: 'Conformité WCAG',
    severityBreakdownHeading: 'Répartition par sévérité',
    categoryBreakdownHeading: 'Répartition par catégorie',
    belowThresholdRenderGapNote:
      'La catégorie « Rendu » affiche 0 constat, mais un écart de rendu réel a été mesuré sur au moins une page, en dessous du seuil de {threshold} % à partir duquel un constat est généré (voir la section « Rendu sans JavaScript »).',
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
      "Cette liste décrit des écarts de conformité technique, indépendamment de toute question d'obligation légale : l'applicabilité des obligations à ce site est traitée séparément, section « {section} ».",
    criterionColumnLabel: 'Critère',
    criterionNameColumnLabel: 'Intitulé',
    findingsColumnLabel: 'Constats',
    occurrencesColumnLabel: 'Occurrences',
    pagesMaxColumnLabel: 'Pages concernées',
    emptyState: "Aucun critère WCAG 2.2 niveau AA en échec n'a été détecté sur ce site.",
    heuristicSectionHeading: 'Signaux à vérifier',
    heuristicSectionNote:
      "Ces lignes proviennent d'un signal heuristique sur la qualité des textes alternatifs, pas d'un test de conformité déterministe : elles signalent des textes alternatifs potentiellement peu utiles (générique, nom de fichier brut, ou dupliqué), sans établir de non-conformité. Une vérification manuelle est nécessaire avant de les traiter comme des écarts de conformité.",
    // item 1.2: rendered only when at least one finding maps to more than
    // one WCAG criterion, so the occurrence column's total legitimately
    // exceeds the accessibility-occurrences tile elsewhere in the report.
    multiCriterionNote:
      "Un constat associé à plusieurs critères WCAG est compté dans chaque ligne concernée : la somme de la colonne « Occurrences » peut donc dépasser le nombre total d'occurrences d'accessibilité indiqué ailleurs dans ce rapport.",
    sameFindingsAsTemplate: 'Mêmes constats que le critère {criterion}',
  },
  coverage: {
    summaryTemplate:
      '{inventory} ; analyse du contenu sur {content} ({contentCompleted}, {contentPartial}) et {contentFailed} en échec ; Lighthouse : {lighthouse}, {lighthousePartial}, {lighthouseFailed} en échec, {lighthouseNotPlanned}.',
    plainSummaryTemplate: '{analysed} sur {found}',
    analysedPageSingular: 'page analysée',
    analysedPagePlural: 'pages analysées',
    foundAddressSingular: 'URL recensée',
    foundAddressPlural: 'URL recensées',
    inventoriedUrlSingular: 'URL inventoriée',
    inventoriedUrlPlural: 'URL inventoriées',
    pageSingular: 'page',
    pagePlural: 'pages',
    completedSingular: 'terminée',
    completedPlural: 'terminées',
    partialSingular: 'partielle',
    partialPlural: 'partielles',
    measuredSingular: 'mesurée',
    measuredPlural: 'mesurées',
    lighthousePartialSingular: 'partielle',
    lighthousePartialPlural: 'partielles',
    notPlannedSingular: 'non planifiée',
    notPlannedPlural: 'non planifiées',
    legacyUnknownTemplate:
      '{inventory}. La couverture passe par passe n’est pas disponible pour cet audit historique.',
    withoutContentTemplate: 'Pages sans analyse du contenu : {reasons}.',
    guardedOmissionsTemplate:
      '{count} URL de continuation supplémentaires ont été omises par le garde-fou de répétition.',
    noindexTemplate: '{count} pages marquées noindex, exclues de l’analyse SEO.',
    coverageLimitationTemplate:
      '{count} contrôles d’absence à l’échelle du site doivent être vérifiés manuellement, car certaines pages candidates n’ont pas pu être analysées (page bloquée, en échec, ou au-delà du plafond de pages fixé pour cette analyse).',
    reasonLabels: {
      'discovered-not-scanned': {
        singular: 'découverte mais non analysée',
        plural: 'découvertes mais non analysées',
      },
      'skipped-robots': { singular: 'bloquée par robots.txt', plural: 'bloquées par robots.txt' },
      'skipped-non-html': { singular: 'ressource non HTML', plural: 'ressources non HTML' },
      'skipped-external-redirect': {
        singular: 'redirection externe',
        plural: 'redirections externes',
      },
      error: { singular: 'erreur d’exploration', plural: 'erreurs d’exploration' },
      'http-error-status': { singular: 'erreur HTTP', plural: 'erreurs HTTP' },
      'redirect-interstitial': {
        singular: 'page de redirection',
        plural: 'pages de redirection',
      },
      'soft-error-page': { singular: 'page d’erreur', plural: 'pages d’erreur' },
      blocked: { singular: 'page bloquée', plural: 'pages bloquées' },
      'coverage-missing': {
        singular: 'donnée de couverture indisponible',
        plural: 'données de couverture indisponibles',
      },
    },
  },
  observations: {
    eyebrow: 'Observations',
    heading: 'Constats hors classement',
    wrapperTitle: "Pages d'intégration de contenu tiers",
    wrapperBodyTemplate:
      "Ces pages sont des enveloppes qui affichent du contenu d'une plateforme tierce : leur contenu est quasiment absent du HTML brut. Les corrections classiques ne s'appliquent pas à du contenu tiers. La décision utile est de choisir entre un lien direct vers la plateforme, un noindex assumé, ou la suppression de ces pages. Constats concernés : {findingIds}.",
    legalTitle: "Pages légales exclues de l'indexation",
    legalBodyTemplate:
      "Ces pages (conditions générales, politique de cookies, politique de confidentialité ou pages similaires) sont d'un type que l'on exclut souvent volontairement de l'indexation (noindex). C'est une configuration fréquente et souvent volontaire pour ce type de page : aucune action corrective n'est recommandée par défaut, vérifiez simplement que ce choix est assumé et que la directive noindex est bien en place. Constats concernés : {findingIds}.",
    relatedFindingSingularTemplate: 'Constat concerné : {findingIds}',
    relatedFindingPluralTemplate: 'Constats concernés : {findingIds}',
  },
  remainingWork: {
    eyebrow: 'Reste \u00e0 traiter',
    heading: 'Les autres constats, group\u00e9s par th\u00e8me',
    introTemplate:
      "Les priorit\u00e9s class\u00e9es de la section « {prioritiesSection} » couvrent les corrections \u00e0 mener en premier. Les {count} constats restants sont regroup\u00e9s ci-dessous par domaine et par r\u00e8gle, avec l'action correspondante. Chaque ligne renvoie aux num\u00e9ros de constats de l'annexe.",
    nothingRemaining:
      "Tous les constats de cet audit sont couverts par les priorit\u00e9s class\u00e9es. Cette section n'a rien \u00e0 ajouter.",
    findingSingular: 'constat',
    findingPlural: 'constats',
    occurrenceSingular: 'occurrence',
    occurrencePlural: 'occurrences',
    pageSingular: 'page',
    pagePlural: 'pages',
    findingRefsTemplate: 'Constats : {findingIds}',
    scopeNote:
      "Les actions indiqu\u00e9es d\u00e9crivent la correction correspondant au probl\u00e8me d\u00e9tect\u00e9. Elles ne remplacent pas l'appr\u00e9ciation de la personne qui interviendra sur le site.",
    fixSnippetLabel: 'Correctif type',
    fixSnippetFillInBlankNote: '\u00c0 compl\u00e9ter avec votre propre contenu.',
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
    pagesScannedSingular: 'page analysée',
    pagesScannedPlural: 'pages analysées',
    wcagReferentialLabel: 'Domaines et référentiels audités',
    // item 2.5 (La Corniche pass): a plain space after "·" let the old
    // cover's narrow value column wrap right after the separator, leaving
    // it dangling alone at the end of a line with the next term starting a
    // new one ("WCAG 2.2 AA · Performance · SEO ·" / "GEO"). A non-
    // breaking space after "·" (not before) keeps each "· Term" pair
    // together, so wrapping can only happen between complete terms.
    wcagReferentialValue: 'WCAG 2.2 AA · Performance · SEO · GEO · Confidentialité et sécurité',
    wcagReferentialValueNoPerformance: 'WCAG 2.2 AA · SEO · GEO · Confidentialité et sécurité',
    legalNameLabel: 'Dénomination sociale',
    riskSmallLabel: 'Niveau de criticité des constats',
    riskLevels: { low: 'Faible', medium: 'Moyen', high: 'Élevé' },
    riskBasisTemplate: 'Évaluation fondée sur {critical} {criticalWord} et {serious} {seriousWord}',
    // item P4 (La Corniche pass, raised across three passes without a
    // fix): the scale had no stated basis for what separates one level
    // from the next. overallRisk is a holistic judgment from the
    // structure pass (severity mix and reach across the site), not a
    // single numeric cutoff - stated honestly as that, rather than
    // inventing specific thresholds that don't actually exist in how the
    // level is decided.
    riskScaleBasisNote:
      "Ce niveau repose sur une appréciation d'ensemble de la gravité et de la portée des constats, et non sur un seuil numérique unique.",
    scorecardLabel: 'Note de constats',
    scorecardDisclaimer: 'Cette note mesure les constats des scanners, pas la conformité légale.',
    criticalFindingSingular: 'constat critique',
    criticalFindingPlural: 'constats critiques',
    seriousFindingSingular: 'constat sérieux',
    seriousFindingPlural: 'constats sérieux',
  },
  executiveSummary: {
    eyebrow: 'Résumé',
    heading: "Ce qu'il faut retenir",
    // Issue #57: the executive pages previously carried no trace of the
    // regulatory regime at all. This block states the criterion only;
    // the general sanction figure rendered between these two sentences
    // is spliced from core (eaaSanctionFigureSentence), never restated
    // here.
    regulatoryContextKicker: 'Cadre réglementaire',
    regulatoryContextCriterion:
      "Les obligations d'accessibilité traitées dans ce rapport s'inscrivent dans le cadre de l'European Accessibility Act, transposé en droit français par la loi n° 2023-171. Selon la taille de l'entreprise et le secteur d'activité, des exigences de conformité peuvent concerner votre site : les critères applicables et votre situation, telle que vérifiée par cet audit, sont détaillés dans la section « Cadre réglementaire ».",
    regulatoryContextCounsel:
      'Le montant ci-dessus est une référence légale générale, et non une sanction vous concernant. Faites confirmer votre situation par un conseil juridique.',
    priorityOwnership: {
      leadTemplate: 'Dans les priorités : {clauses}.',
      firstPartySingularTemplate: '{count} constat à corriger directement',
      firstPartyPluralTemplate: '{count} constats à corriger directement',
      thirdPartySingularTemplate: '{count} à confier à un tiers',
      thirdPartyPluralTemplate: '{count} à confier à un tiers',
      verifyIntentSingularTemplate: '{count} à vérifier au préalable',
      verifyIntentPluralTemplate: '{count} à vérifier au préalable',
      clauseSeparator: ', ',
      clauseConjunction: ' et ',
    },
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
      "Ce site présente peu de constats SEO et GEO significatifs par rapport à l'accessibilité : l'essentiel des priorités ci-dessous concerne l'accessibilité.",
    jumpLinkLabelTemplate: 'Voir priorité {rank}',
    topPriorityIsNotLegalWithPointerTemplate:
      "La priorité 1 n'est rattachée à aucun critère d'accessibilité : elle a été classée en premier sur la base de son rapport complexité/impact. Les priorités rattachées à un critère d'accessibilité figurent en position {legalRank}. D'autres obligations, sans lien avec l'accessibilité, peuvent s'appliquer par ailleurs : voir la section « Cadre réglementaire ».",
    topPriorityIsNotLegalNoPointer:
      "La priorité 1 n'est rattachée à aucun critère d'accessibilité : elle a été classée en premier sur la base de son rapport complexité/impact. Aucune des priorités retenues dans ce rapport n'est rattachée à un critère d'accessibilité. D'autres obligations, sans lien avec l'accessibilité, peuvent s'appliquer par ailleurs : voir la section « Cadre réglementaire » pour le détail.",
    summaryCountsTemplate:
      "L'audit a identifié {total} constats au total, dont {actionable} ({critical} et {serious} sérieux).",
    actionableCountSingularTemplate: '{count} critique ou sérieux',
    actionableCountPluralTemplate: '{count} critiques ou sérieux',
    criticalCountSingularTemplate: '{count} critique',
    criticalCountPluralTemplate: '{count} critiques',
    coveredByPrioritiesTemplate:
      'Parmi ces {total} constats, {covered} sont couverts par les priorités de la section « {prioritiesSection} » ; les autres sont listés par sévérité dans « {remainingSection} ».',
    coveredByPrioritiesWithObservationsTemplate:
      'Parmi ces {total} constats, {covered} sont couverts par les priorités de la section « {prioritiesSection} » ; les autres sont présentés dans « {remainingSection} » et « {observationsSection} ».',
  },
  legalExposure: {
    eyebrow: 'Exposition légale',
    heading: 'Exposition légale',
    eaaDeadlineLabel: 'En application depuis',
    eaaDeadlineValue: '28 juin 2025',
    eaaDeadlineNoteTemplate:
      "Date d'entrée en application des obligations de l'EAA, fixée par la directive elle-même. Les obligations sont donc en vigueur depuis {duration} ; il ne s'agit pas d'une échéance à venir.",
    obligationStatusLabel: "Applicabilité de l'obligation",
    statusLabels: {
      in_scope: 'Effectif et parcours observés',
      likely_in_scope: 'Parcours à confirmer',
      out_of_scope: 'Seuil ou parcours non observé',
      undetermined: 'Données insuffisantes',
    },
    statusShortDescriptions: {
      in_scope:
        "Les données d'effectif proviennent du répertoire Sirene, et celles sur le parcours de réservation ou d'achat en ligne (« parcours transactionnel ») des pages visitées ; elles sont détaillées ci-dessous.",
      likely_in_scope:
        "Les données d'entreprise proviennent du répertoire Sirene, mais le parcours de réservation ou d'achat en ligne (« parcours transactionnel ») reste à vérifier.",
      out_of_scope:
        "Les données vérifiées indiquent soit un effectif et un chiffre d'affaires sous les seuils cités, soit qu'aucun parcours transactionnel n'a été trouvé sur les pages visitées.",
      undetermined:
        "L'identifiant d'entreprise ou les données Sirene nécessaires n'étaient pas disponibles pour comparer les faits observés aux seuils cités.",
    },
    outOfScopeSmeLabel: 'Sous les seuils de taille',
    // \u2060 (word joiner) keeps the article number off a line break.
    outOfScopeSmeShortDescription:
      "D'après le répertoire Sirene, l'effectif et le chiffre d'affaires se situent sous les seuils de l'article L412-\u206013 du code de la consommation : moins de dix personnes employées et un chiffre d'affaires annuel n'excédant pas deux millions d'euros.",
    syntheticStatusShortDescriptions: {
      in_scope:
        'Le statut illustré repose sur des données synthétiques créées pour cet exemple ; elles ne décrivent pas un établissement réel.',
      likely_in_scope:
        'Le statut illustré repose sur des données synthétiques créées pour cet exemple ; elles ne décrivent pas un établissement réel.',
      out_of_scope:
        'Le statut illustré repose sur des données synthétiques créées pour cet exemple ; elles ne décrivent pas un établissement réel.',
      undetermined:
        'Le statut illustré repose sur des données synthétiques créées pour cet exemple ; elles ne décrivent pas un établissement réel.',
    },
    exposureHeading: 'Exposition en cas de manquement',
    generalEaaReferenceHeading: 'Référence légale générale',
    sirenLabel: 'SIREN',
    sirenTemplate: "SIREN relevé lors de l'audit ({date}) : {siren}.",
    sirenUnavailable: "Aucun numéro SIREN n'a pu être identifié pour ce site lors de cet audit.",
    // item 0.1/1.11 (La Corniche pass): "report, don't conclude" requires
    // printing every registry input relied on, not just the SIREN -
    // effectifsBand is the label already, may be absent when Sirene's
    // headcount field itself is unreliable for this entity's band.
    registrySnapshotTemplate:
      'Données du répertoire Sirene : {denomination}, SIREN {siren}, {effectifs}, consultées le {date}.',
    registrySnapshotEffectifsUnavailable: 'effectif non disponible',
    syntheticRegistrySnapshotTemplate:
      "Données synthétiques de cet exemple : {denomination}, identifiant SIREN fictif {siren}, tranche d'effectif fictive {effectifs}, date d'exemple {date}.",
    syntheticRegistrySnapshotNote:
      "Ces informations sont fictives : elles ne proviennent pas du répertoire Sirene ni d'une entreprise réelle.",
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
      "L'exploration du site n'a trouvé aucun numéro SIREN, RCS ou TVA publié sur les pages visitées de ce site.",
    lcenSourceTemplate: 'Source : {citation}. Autorité compétente : {authority}.',
    lcenScanLimitNote:
      "L'exploration automatisée ne visite qu'un nombre limité de pages et peut ne pas atteindre une page où ces informations figurent. Cette obligation ne dépend pas du résultat de l'analyse d'accessibilité ci-dessus. Faites confirmer votre situation par un conseil juridique.",
    registrySnapshotVerbatimNote:
      "Cette dénomination est reproduite telle qu'elle figure au répertoire Sirene, associée au SIREN ci-dessus, pas déduite du nom de domaine.",
    syntheticDisclaimerNote:
      "Cette section illustre le rendu des critères réglementaires avec des données synthétiques ; elle ne décrit pas la situation juridique ou administrative d'un établissement réel. Une confirmation par un conseil juridique reste nécessaire avant toute décision.",
    // item 0.1: when a manual hasTransactionalFlow override disagrees
    // with what the scanner detected, the report must say so plainly
    // rather than silently trusting the override - a confirmed fact from
    // a person still deserves a visible caveat when it contradicts
    // machine evidence, since it can mean either is wrong.
    transactionalFlowConflictTemplate:
      'Signal contradictoire : la détection automatisée {detectedValue} ; une confirmation manuelle indique {manualValue}. À vérifier avant toute décision fondée sur ce statut.',
    transactionalFlowConflictDetectedAbsent: "n'a pas confirmé de parcours transactionnel",
    transactionalFlowConflictDetectedPresent: 'a identifié un parcours transactionnel',
    transactionalFlowConflictManualAbsent: "l'absence d'un tel parcours",
    transactionalFlowConflictManualPresent: 'sa présence',
    // Issue #42: the inconclusive detection is a materially stronger hint
    // than a routine "à confirmer" - booking controls were actually seen,
    // only their destination could not be established.
    transactionalFlowInconclusiveTemplate:
      "Pages où ces contrôles de réservation ont été relevés, par exemple : {examplePages}. Un parcours de réservation en ligne existe donc peut-être : faites confirmer ce point avant d'en tirer une conclusion sur l'applicabilité de l'obligation.",
    transactionalFlowInconclusiveNoExample:
      "Un parcours de réservation en ligne existe donc peut-être : faites confirmer ce point avant d'en tirer une conclusion sur l'applicabilité de l'obligation.",
    disclaimerNote:
      'Cette section reproduit des critères réglementaires et des données publiques de votre entreprise, sans interprétation juridique supplémentaire. Une confirmation par un conseil juridique reste nécessaire avant toute décision.',
    overseasStatusLabel: 'Régime applicable à vérifier',
    overseasStatusDescription:
      "Le site relève d'un nom de domaine d'outre-mer. Ce rapport ne dispose pas d'une analyse vérifiée du régime d'accessibilité numérique applicable à ce territoire : il ne cite donc ni obligation, ni échéance, ni sanction. Les constats techniques restent valables ; leur portée juridique est à établir avec votre conseil.",
    undeterminedActionNote:
      "Ce statut se précisera si le numéro SIREN de l'entreprise est publié sur le site ou communiqué à l'équipe Odysseus.",
    // P0.3 (2026-08-21 La Corniche feedback pass): this used to list every
    // non-homepage URL in the crawl, including legal-notice pages like
    // /cookies/ or /politique-de-confidentialite/, implying the booking
    // funnel itself lived on those pages - it doesn't; the booking widget
    // is a site-wide layout component. States the mechanism and names the
    // actual detected component instead of dumping the whole page list.
    transactionalFlowOnSiteTemplate:
      "Un moteur de réservation est intégré via un composant présent sur l'ensemble du périmètre analysé ({vendors}). Exemples de pages où il a été relevé : {examplePages}.",
    transactionalFlowOnSiteNoVendorTemplate:
      'Le parcours transactionnel identifié est intégré directement sur le site, via un composant présent sur plusieurs pages du périmètre analysé. Exemples de pages où il a été relevé : {examplePages}.',
    transactionalFlowDelegatedTemplate:
      "Le parcours transactionnel identifié est délégué à un prestataire tiers. Le domaine de ce prestataire n'a pas été exploré dans le cadre de cet audit, qui reste circonscrit au domaine du site audité.",
  },
  checklist: {
    eyebrow: 'Check-list imprimable',
    heading: 'Check-list des priorités',
    insertTag: 'Encart à imprimer',
    // P2.5 (2026-08-21 La Corniche feedback pass): 13 of the report's
    // pages are CSS-selector tables meant for a developer, not the
    // director reading the report - labeled explicitly rather than left
    // to be inferred from content alone.
    intro:
      "Cette page est conçue pour être imprimée ou enregistrée séparément, d'où son fond clair : sans texte explicatif, uniquement les informations essentielles. Elle est destinée à votre prestataire technique.",
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
      "Estimation globale : {min} à {max} jours de développement pour l'ensemble des {count} chantiers ci-dessous (estimation large, non contractuelle). Un chantier relevant d'un composant tiers dépend en outre du délai de son éditeur.",
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
      'Écart mesuré sur ce site : {metric} médian à {value}, soit {gap} au-dessus du seuil « bon » ({threshold}).',
    revenueImpactTemplate:
      "Sur la base de votre chiffre d'affaires déclaré ({turnover} €), et si cette association se vérifiait pour votre activité, l'ordre de grandeur serait de jusqu'à {impact} € par an. Il s'agit d'une estimation indicative fondée sur une seule étude, pas d'une prévision garantie.",
    quickWinBadgeLabel: 'Action rapide',
    actionLevelLabels: {
      priority: 'Priorité',
      important: 'Important',
      improvement: 'Amélioration',
    },
    recommendedActionsLabel: 'Actions recommandées',
    reviewedRemediationLabel: 'Correctif technique vérifié',
    fixSnippetLabel: 'Correctif type',
    fixSnippetFillInBlankNote: 'À compléter avec votre propre contenu.',
    ownershipSummaryTemplate: 'Responsabilité : {parts}.',
    ownershipPartTemplates: {
      'first-party-action': '{count} à corriger directement',
      'third-party-escalation': '{count} à confier à un tiers',
      'verify-intent': '{count} à vérifier au préalable',
    },
    ownershipSingleGroupTemplates: {
      'first-party-action': {
        one: 'Cette correction peut être mise en œuvre directement.',
        many: 'Ces {count} corrections peuvent être mises en œuvre directement.',
      },
      'third-party-escalation': {
        one: 'Cette correction est à confier à un tiers.',
        many: 'Ces {count} corrections sont à confier à un tiers.',
      },
      'verify-intent': {
        one: 'Cette correction nécessite une vérification préalable.',
        many: 'Ces {count} corrections nécessitent une vérification préalable.',
      },
    },
    effortImpactLevels: { low: 'Faible', medium: 'Moyen', high: 'Élevé' },
    // "Complexité" is feminine: the effort column needs its own agreement
    // (issue #305), while effortImpactLevels stays masculine for "Impact".
    effortLevels: { low: 'Faible', medium: 'Moyenne', high: 'Élevée' },
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
      'Ce chantier concerne {firstPartyPages} {firstPartyPageWord} relevant de votre site (votre agence peut corriger) et {thirdPartyPages} {thirdPartyPageWord} relevant de {vendor} (à transmettre à son éditeur) ; une même page peut relever des deux.',
    // "ce composant tiers" rather than "un composant tiers": the template
    // renders "relevant de {vendor}", and "de un" is ungrammatical while
    // "de ce" is not - which removes the elision problem instead of
    // special-casing it.
    ownershipSplitUnknownVendorLabel: 'ce composant tiers',
    thirdPartyOnlyTemplate:
      'Ce chantier relève entièrement de {vendor} : la correction doit passer par son éditeur, pas par votre agence web.',
    lcenCrossReferenceTemplate:
      'Ce constat relève de l’obligation légale d’identification détaillée dans « {legalSection} ».',
    // Plan 018 step 6: each priority card reads outcome first (why it
    // matters), then the deterministic observation (what we observed,
    // never counts alone: the defect label leads), then the actions.
    whyItMattersLabel: 'Enjeu',
    observationLabel: 'Ce que nous avons observé',
    observationWithPageTemplate:
      'Constat représentatif : « {defect} », relevé par exemple sur la page {page}. Ce chantier concerne {pages} {pageWord} et {occurrences} {occurrenceWord}.',
    observationNoPageTemplate:
      'Constat représentatif : « {defect} ». Ce chantier concerne {pages} {pageWord} et {occurrences} {occurrenceWord}.',
    whatYouCanDoLabel: 'Ce que vous pouvez faire',
    continuedCardTemplate: 'Priorité {rank} (suite)',
    complexityLabel: 'Complexité',
  },
  renderDiffEvidence: {
    eyebrow: 'Preuve de rendu',
    heading: 'Ce que reçoit un moteur de recherche avant JavaScript',
    intro:
      "Chaque page est chargée deux fois : une fois sans JavaScript, comme le fait un robot d'indexation qui n'exécute pas JavaScript, une fois dans un navigateur complet. La comparaison permet d'identifier le contenu que certains moteurs ne voient pas.",
    rawBarLabelTemplate: 'HTML brut · {chars} caractères',
    renderedBarLabelTemplate: 'Page rendue · {chars} caractères',
    charCountsUnavailableNote: 'Nombre de caractères non mesuré pour cette page.',
    missingCaptionTemplate:
      'Contenu manquant : {percent} % du texte visible est absent du HTML brut, sur {selector}.',
    missingCaptionNoSelectorTemplate:
      'Contenu manquant : {percent} % du texte visible est absent du HTML brut.',
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
      "Les pages commerciales de ce site conservent leur texte dans le HTML brut : aucun écart de rendu significatif n'a été mesuré.",
    positiveStatementWrapperNote:
      "Seules les pages d'intégration de contenu tiers font exception à ce constat, voir la section Observations.",
  },
  coreWebVitals: {
    eyebrow: 'Performance',
    heading: 'Mesures de performance',
    labHeading: 'Mesures de laboratoire (Lighthouse)',
    labIntroTemplate:
      'Valeurs médianes agrégées sur {pages}. Simulation mobile avec limitation réseau ; pour une page mesurée plusieurs fois, la valeur retenue est celle du passage médian. Données de laboratoire (Lighthouse), et non de terrain.',
    pageSingular: 'page',
    pagePlural: 'pages',
    metricColumnLabel: 'Métrique',
    valueColumnLabel: 'Valeur médiane',
    realUserValueColumnLabel: '75e percentile',
    worstPageColumnLabel: 'Pire page',
    worstPageSameAsMedian: 'Comme la médiane',
    worstPageFootnote:
      "Le niveau de gravité d'un constat est déterminé à partir de la page la plus défavorable, et non de la médiane : un statut « Critique » peut donc coexister avec une médiane « à améliorer » quand une page isolée est nettement plus lente que les autres.",
    thresholdColumnLabel: 'Seuil « bon »',
    statusColumnLabel: 'Statut',
    lcpLabel: 'LCP, contenu principal',
    tbtLabel: 'TBT, temps de blocage',
    fcpLabel: 'FCP, premier affichage',
    speedIndexLabel: 'Speed Index',
    clsLabel: 'CLS, stabilité visuelle',
    notMeasured: 'Non mesuré',
    unstableMeasurement: 'Mesure instable',
    unstableNoteTemplate:
      'Mesure instable\u00a0: sur {pages}, les passages successifs se contredisaient pour {metrics}. Ces valeurs ne sont retenues ni dans la médiane ni pour la page la plus lente.',
    ratingGoodLabel: 'bon',
    ratingNeedsImprovementLabel: 'à améliorer',
    ratingPoorLabel: 'insuffisant',
    allUnmeasuredNote:
      "La mesure de performance (Lighthouse) n'a pas abouti sur ce site pour cet audit et aucun constat de performance n'est donc rapporté ici. Voir la section « Méthodologie et limites » pour le détail.",
    realUserHeading: 'Données réelles (Chrome UX Report)',
    realUserIntro:
      "Données de terrain issues de l'utilisation réelle de Chrome sur ce site au cours des 28 derniers jours, lorsque des données publiques existent, en complément des mesures de laboratoire Lighthouse.",
    realUserNoDataNote:
      "Aucune donnée Chrome UX Report publique n'existe pour ce site, le plus souvent parce qu'il ne reçoit pas encore assez de trafic Chrome pour atteindre le seuil de publication de Google. Ce n'est ni un succès ni un échec. Cela signifie simplement qu'aucune comparaison avec des utilisateurs réels n'est disponible pour cet audit.",
    realUserGapNote:
      'Un écart important entre ces valeurs réelles et les mesures de laboratoire présentées plus bas est normal : la mesure de laboratoire simule volontairement des conditions difficiles (limitation CPU et réseau), tandis que les données réelles reflètent des visiteurs sur des appareils et connexions variés. Les deux mesures répondent à des questions différentes, elles ne se contredisent pas.',
    labLcpDivergenceTemplate:
      "* La médiane de laboratoire du LCP ({lab}) dépasse de plus de quatre fois la valeur mesurée chez vos visiteurs réels ({field}, jugée bonne). Un tel écart va au-delà de ce qu'expliquent les conditions simulées : il provient le plus souvent de la mesure elle-même (image principale ou carrousel chargé tardivement, attente d'un service tiers). Cette médiane ne décrit donc pas l'expérience de vos visiteurs . Pour l'interprétation de ce cas, privilégiez la donnée de terrain.",
    referenceRealUserHeading: 'Données de terrain de l’audit anonymisé (Chrome UX Report)',
    referenceRealUserNoDataNote:
      "Aucune donnée Chrome UX Report publique n'a été retenue dans l'audit anonymisé. Cela signifie simplement qu'aucune comparaison avec des utilisateurs réels n'est disponible pour cet exemple.",
    referenceRealUserGapNote:
      "L'écart entre ces valeurs issues des données de terrain conservées dans l’audit anonymisé et les mesures de laboratoire présentées plus bas est normal : la mesure de laboratoire simule volontairement des conditions difficiles (limitation CPU et réseau), tandis que les données de terrain reflètent les conditions observées dans l’audit source. Les deux mesures répondent à des questions différentes.",
    referenceLabLcpDivergenceTemplate:
      "* La médiane de laboratoire du LCP ({lab}) dépasse de plus de quatre fois la valeur mesurée dans les données de terrain de l’audit anonymisé ({field}, jugée bonne). Ces mesures appartiennent à l'audit anonymisé et ne décrivent pas l'expérience d'Hôtel Exemple.",
    inpLabel: 'INP, réactivité',
  },
  benchmarkPercentile: {
    eyebrow: 'Référentiel',
    heading: 'Positionnement par rapport à la cohorte de référence',
    scoredBodyTemplate:
      '{percentile} % des {cohortSize} sites de la cohorte de référence ont obtenu un score strictement meilleur (constats moins nombreux et moins sévères) que ce site.',
    scanDateRangeTemplate: 'Cohorte de référence scannée entre le {earliest} et le {latest}.',
    tooSmallBody:
      'La cohorte de référence ne compte pas encore assez de sites scannés pour publier une comparaison fiable pour cet audit.',
  },
  findingsDelta: {
    eyebrow: 'Évolution depuis le précédent audit',
    heading: '',
    introTemplate:
      "Cette section compare cet audit, constat par constat, à l'audit livré le {date}. Un constat est reconnu par sa règle et par l'élément ou la page qu'il concerne. La comparaison est calculée automatiquement, sans interprétation.",
    countLabels: {
      new: 'Nouveaux constats',
      'newly-observable': 'Rendus observables',
      'changed-severity': 'Gravité modifiée',
      resolved: 'Constats plus détectés',
      'not-comparable': 'Non comparables',
      persistent: 'Constats toujours présents',
    },
    newHeading: 'Nouveaux constats',
    newlyObservableHeading: 'Constats rendus observables',
    newlyObservableNote:
      "Ces constats ne pouvaient pas être relevés lors de l'audit précédent : la vérification ou le support concerné n'était pas encore couvert. Le site n'a pas régressé entre les deux audits sur ces points.",
    changedSeverityHeading: 'Constats dont la gravité a changé',
    resolvedHeading: 'Constats plus détectés',
    resolvedNote:
      "Un constat qui n'est plus détecté a le plus souvent été corrigé. Il peut aussi avoir disparu parce que la page concernée n'a pas été analysée lors de cet audit.",
    notComparableHeading: 'Constats non comparables',
    notComparableNote:
      "Cet audit ne permet pas de statuer sur ces constats : la vérification ou le support concerné n'était pas comparable d'un audit à l'autre. Ils ne sont comptés ni comme corrigés ni comme nouveaux.",
    scopeChangedNote:
      "Le périmètre demandé a changé depuis l'audit précédent. Les constats sont rapprochés à périmètre commun, et cette différence est signalée plutôt que comptée comme une régression ou une correction.",
    inventoryChangedNote:
      "Les pages explorées ont changé depuis l'audit précédent. Les constats sont rapprochés page par page, et cette différence est signalée plutôt que comptée comme une régression ou une correction.",
    findingColumnLabel: 'Constat',
    severityColumnLabel: 'Gravité',
    pagesColumnLabel: 'Pages',
    previousColumnLabel: 'Audit précédent',
    currentColumnLabel: 'Cet audit',
    persistentNoteSingular:
      "{count} constat relevé lors du précédent audit l'est toujours. Il figure dans l'annexe technique.",
    persistentNotePlural:
      "{count} constats relevés lors du précédent audit le sont toujours. Ils figurent dans l'annexe technique.",
    noChangesBody:
      "Aucun constat n'est apparu, n'a disparu ou n'a changé de gravité entre les deux audits.",
    severitySuppressedNote:
      "Les outils d'analyse ou les règles de regroupement des constats ont changé entre les deux audits. Un changement de gravité peut alors venir des outils plutôt que du site : les constats concernés sont comptés comme toujours présents, sans changement de gravité.",
    normalizationChangedNote:
      'Les règles de regroupement des constats ont évolué entre les deux audits. Certains constats peuvent donc apparaître comme nouveaux ou comme plus détectés sans que le site ait changé.',
    versionsHeading: "Versions des outils d'analyse",
    versionRowTemplate: '{tool} : {before} lors du précédent audit, {after} pour cet audit.',
    versionUnavailable: 'indisponible',
    toolLabels: {
      odysseusVersion: 'Odysseus',
      findingsSchemaVersion: 'Format des constats',
      axeCoreVersion: 'axe-core',
      lighthouseVersion: 'Lighthouse',
      playwrightVersion: 'Playwright',
      chromiumVersion: 'Chromium',
    },
    maxPagesChangedTemplate:
      'La limite de pages analysées est passée de {before} à {after}. Un périmètre différent peut faire apparaître ou disparaître des constats sans que le site ait changé.',
    maxDepthChangedTemplate:
      "La profondeur d'exploration est passée de {before} à {after}. Un périmètre différent peut faire apparaître ou disparaître des constats sans que le site ait changé.",
    noPageLimit: 'aucune limite',
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
    remediationPlanHeading: 'Plan de correction',
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
          "Référentiel général d'amélioration de l'accessibilité, la déclinaison française opérationnelle des critères WCAG.",
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
          'Niveau de gravité le plus élevé : le problème bloque une tâche essentielle pour une partie des utilisateurs.',
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
        term: 'Action rapide',
        definition:
          'Correctif à faible complexité et à impact moyen ou élevé, à traiter en priorité.',
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
          "Temps de blocage total : durée pendant laquelle la page ne répond pas aux interactions de l'utilisateur.",
      },
      {
        id: 'cls',
        term: 'CLS (Cumulative Layout Shift)',
        definition:
          "Stabilité visuelle : mesure les déplacements inattendus d'éléments pendant le chargement de la page.",
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
          'Référencement naturel : optimisation pour la visibilité dans les résultats des moteurs de recherche.',
      },
      {
        id: 'geo',
        term: 'GEO',
        definition:
          "Optimisation pour les moteurs d'intelligence artificielle générative (ex. réponses IA), une visibilité distincte du référencement classique.",
      },
      {
        id: 'hreflang',
        term: 'hreflang',
        definition:
          "Indication placée dans le code d'une page pour signaler aux moteurs de recherche ses versions dans d'autres langues ou pour d'autres pays, afin qu'ils présentent la bonne version à chaque visiteur.",
      },
      {
        id: 'noindex',
        term: 'noindex',
        definition:
          'Instruction demandant aux moteurs de recherche de ne pas faire figurer une page dans leurs résultats.',
      },
      {
        id: 'canonical',
        term: 'Balise canonique',
        definition:
          'Balise qui désigne, parmi plusieurs adresses au contenu identique ou très proche, celle que les moteurs de recherche doivent retenir.',
      },
      {
        id: 'open-graph',
        term: 'Open Graph',
        definition:
          "Balises qui définissent le titre, la description et l'image affichés lorsqu'une page est partagée sur un réseau social ou dans une messagerie.",
      },
      {
        id: 'json-ld',
        term: 'JSON-LD',
        definition:
          "Format de données structurées placé dans le code d'une page, qui décrit son contenu (établissement, adresse, avis, prix) aux moteurs de recherche et aux assistants IA.",
      },
      {
        id: 'lighthouse',
        term: 'Lighthouse',
        definition:
          "Outil de mesure de Google qui charge chaque page dans des conditions simulées (mobile, réseau et processeur ralentis) ; ses valeurs sont des mesures de laboratoire, pas l'expérience de vos visiteurs.",
      },
      {
        id: 'crux',
        term: 'Chrome UX Report',
        definition:
          'Données publiques de Google issues de visiteurs réels utilisant Chrome, qui montrent les performances réellement observées sur le site lorsque celui-ci reçoit assez de trafic.',
      },
      {
        id: 'inp',
        term: 'INP (Interaction to Next Paint)',
        definition:
          "Délai entre une action du visiteur (clic, appui, saisie) et la mise à jour visible de la page ; il n'est mesuré que sur des visiteurs réels.",
      },
      {
        id: 'axe-core',
        term: 'axe-core',
        definition:
          "Moteur open source de tests d'accessibilité automatisés, utilisé pour vérifier les critères WCAG qu'un outil peut contrôler.",
      },
      {
        id: 'constat-vs-occurrence',
        term: 'Constat / Occurrence',
        definition:
          'Un constat est un problème distinct après regroupement ; une occurrence est chacune de ses apparitions individuelles sur le site. Un même constat peut compter plusieurs occurrences.',
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
          "Fonctionnalité du site permettant de réserver, ajouter au panier ou payer directement en ligne : l'un des critères examinés pour déterminer si l'EAA s'applique au site.",
      },
      {
        id: 'sans-objet',
        term: 'Sans objet',
        definition:
          "Utilisé pour un chantier prioritaire qui n'est pas une question de conformité (ex. performance, SEO) : la colonne conformité ne s'applique pas à ce type de constat.",
      },
      {
        id: 'recherche-emergente',
        term: 'Recherche émergente',
        definition:
          "Signale une statistique citée à titre indicatif, dont la méthodologie est récente ou le corpus de données disponibles encore limité, à distinguer d'une statistique établie, citée sans cette réserve.",
      },
      {
        id: 'signaux-a-verifier',
        term: 'Signaux à vérifier',
        definition:
          'Alertes heuristiques signalant un contenu potentiellement problématique (ex. texte alternatif générique ou dupliqué), distinctes des critères WCAG en échec confirmés : elles indiquent un doute à vérifier manuellement, pas une non-conformité établie.',
      },
      {
        id: 'pages-concernees',
        term: 'Pages concernées',
        definition:
          "Nombre de pages distinctes touchées par au moins un constat relevant de ce critère ; une page concernée par plusieurs constats n'est comptée qu'une fois.",
      },
      {
        id: 'rendu',
        term: 'Rendu',
        definition:
          "Catégorie de constats liés à l'écart entre le contenu HTML brut d'une page et son contenu une fois les scripts exécutés, utile pour identifier le contenu qu'un moteur de recherche qui n'exécute pas le JavaScript risque de ne pas voir.",
      },
      {
        id: 'sirene',
        term: 'Sirene',
        definition:
          "Répertoire officiel des entreprises et établissements en France (INSEE), qui peut être utilisé pour vérifier la taille d'une entreprise et confirmer à quelle entité un constat se rapporte.",
      },
      {
        id: 'complexity',
        term: 'Complexité',
        definition:
          "Estimation qualitative (Faible / Moyenne / Élevée) de la complexité de correction d'un chantier prioritaire, dérivée de la famille de règles et de la concentration des occurrences.",
      },
      {
        id: 'impact-commercial',
        term: 'Impact',
        definition:
          "Estimation qualitative (Faible / Moyen / Élevé) de l'effet attendu d'un correctif pour les visiteurs du site ou pour sa visibilité, distincte de la gravité technique du constat.",
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
      "Votre site est un canal direct de réservation et d'information : son accessibilité, sa visibilité dans les moteurs de recherche et les assistants IA, et sa vitesse conditionnent ce que vos visiteurs peuvent y faire. Ce rapport en dresse les constats mesurés ; leur correction relève des rôles ci-dessous.",
    synthesisCoverage: {
      leadTemplate: 'Priorités classées : {priorities}. {clauses}.',
      prioritySingularTemplate: '{count}',
      priorityPluralTemplate: '{count}',
      seriousCriticalSingularTemplate:
        'Regroupant au moins un constat critique ou sérieux : {count}',
      seriousCriticalPluralTemplate: 'Regroupant au moins un constat critique ou sérieux : {count}',
      quickWinsSingularTemplate:
        'Actions rapides, faible complexité pour un impact moyen ou élevé : {count}',
      quickWinsPluralTemplate:
        'Actions rapides, faible complexité pour un impact moyen ou élevé : {count}',
      clauseSeparator: '. ',
      clauseConjunction: '. ',
    },
    synthesisCoverageFallback:
      "La répartition des constats par gravité figure plus haut dans ce rapport, dans les priorités classées et les chiffres de l'audit.",
    synthesisRoles:
      'Qui agit ensuite : la direction arbitre et suit ; le prestataire technique ou le service informatique corrige ; la communication vérifie les contenus publiés ; le juridique confirme les obligations applicables.',
    synthesisReauditRecommendation:
      'Après la correction des priorités, un ré-audit du même périmètre est recommandé, normalement dans un délai de trois à six mois, une fois les correctifs en ligne.',
    synthesisComparisonWithFieldData:
      "La comparaison porte uniquement sur ce que l'analyse automatisée recalcule : les constats par gravité, les critères WCAG 2.2 AA en échec et, lorsqu’elles sont disponibles, les données de terrain du Chrome UX Report.",
    synthesisComparisonWithReferenceFieldData:
      "La comparaison porte uniquement sur ce que l'analyse automatisée recalcule : les constats par gravité, les critères WCAG 2.2 AA en échec et les données de terrain conservées dans l'audit anonymisé.",
    synthesisComparisonWithoutFieldData:
      "La comparaison porte uniquement sur ce que l'analyse automatisée recalcule : les constats par gravité et les critères WCAG 2.2 AA en échec.",
    synthesisConversionNote:
      "Votre propre taux de conversion, suivi avec vos outils, reste une mesure distincte : le ré-audit ne l'estime pas.",
    questionTitle: 'Une question ?',
    questionBodyTemplate:
      "Toute demande de clarification sur un constat ou une priorité peut être adressée à l'équipe Odysseus à {email}, en citant l'identifiant du constat concerné.",
    // item 3.12: the offer must state a price, a lead time, and a way to
    // order it. Figures come only from ODYSSEUS_REAUDIT_PRICE_EUR_HT /
    // ODYSSEUS_REAUDIT_LEAD_TIME_DAYS (html-utils.ts), never from copy.
    // Template: {price}, {days}, {email}.
    reauditPricingTemplate:
      'Tarif indicatif : {price} € HT. Délai : {days} jours ouvrés après confirmation des correctifs. Pour en faire la demande, écrivez à {email}.',
    authorshipTemplate:
      "Rapport produit par {producer}, rendu le {renderDate} à partir de l'analyse automatisée achevée le {scanDate}, identifiant de rapport {reportId}.",
    provenanceTemplate: 'Traçabilité technique : {details}.',
    renderQualifierTemplate: 'version de rendu {renderBuild}, modèle {templateVersion}',
    renderQualifierWithoutBuildTemplate: 'modèle {templateVersion}',
    scanQualifierTemplate: "version du moteur d'analyse {scanBuild}",
    issuerBlockTemplate: 'Signataire : {signatory}. SIRET : {registrationNumber}.',
    liabilityStatement:
      "Ce rapport reproduit des constats techniques détectés par des outils automatisés, accompagnés d'explications et de priorisations. Il ne constitue pas un avis juridique ; voir la section « Cadre réglementaire » et la méthodologie pour les limites de couverture. Odysseus ne saurait être tenu responsable des décisions prises sur la seule base de ce document.",
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
      "Ces constats concernent du code appartenant à un plugin, un widget ou un cadre tiers (moteur de réservation, bannière de cookies, aperçu, formulaire). Ce code ne peut pas être modifié directement dans votre site : la correction passe par le prestataire ou l'éditeur concerné.",
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
      "Ces constats restent comptabilisés dans les totaux de sévérité en tête de rapport : les totaux reprennent tous les constats relevés par l'audit, classés selon la gravité générale de leur règle. Un constat peut donc figurer dans ces totaux alors même que cette section précise que l'implémentation observée sur votre site est déjà correcte : le total décrit la règle générale, l'observation décrit votre cas.",
    thirdPartyFramesExcludedNote:
      'Ces constats se trouvent dans des contenus tiers intégrés au moyen d’un cadre (iframe)\u00a0: ils ne sont comptés ni dans les totaux en tête de rapport ni dans la note principale.',
    thirdPartyMixedTotalsNote:
      "Les constats situés dans un contenu tiers intégré au moyen d'un cadre (iframe) ne sont comptés ni dans les totaux en tête de rapport ni dans la note principale. Les autres restent comptabilisés dans les totaux de sévérité, classés selon la gravité générale de leur règle, même lorsque cette section précise que l'implémentation observée sur votre site est déjà correcte\u00a0: le total décrit la règle générale, l'observation décrit votre cas.",
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
    observationsCrossRefLabel: 'Détail dans la section « {section} »',
    splitGroupThirdPartyNoteTemplate:
      'Encore {count} occurrences de cette règle concernent un composant tiers ; voir « {thirdPartyHeading} ».',
    splitGroupThirdPartyNoteSingularTemplate:
      'Encore {count} occurrence de cette règle concerne un composant tiers ; voir « {thirdPartyHeading} ».',
    crawledPagesHeadingTemplate: 'Pages analysées ({count})',
  },
  methodology: {
    eyebrow: 'Méthodologie et limites',
    heading: 'Comment cet audit a été réalisé',
    languageCoverageTemplate: 'Langues couvertes par cette analyse : {languages}.',
    languageNotScannedTemplate:
      "Aucune page n'a été analysée pour les langues suivantes, bien que le site en publie : {languages}.",
    // Issue #77 : {total} correspond ici a analyzedPages.length (toute page
    // au statut 'visited'), une population differente, plus large, que le
    // nombre de pages a analyse de contenu terminee que le paragraphe
    // outillage plus haut appelle deja "{pages} analysees" - reutiliser
    // "analysees" pour les deux produisait deux nombres differents sous le
    // meme mot sur la meme page. "Visitees" reprend le vocabulaire deja
    // utilise ailleurs dans ce fichier pour status === 'visited' (les
    // phrases SIREN/RCS/TVA sur les "pages visitees") et ne recoupe pas le
    // nombre de pages analysees.
    sitemapCoverageTemplate:
      "Détail du périmètre : {total} pages visitées, dont {linked} atteintes depuis la page d'accueil ou par des liens internes et {sitemapOnly} ajoutées depuis le sitemap.",
    sitemapCoverageWithSeedsTemplate:
      "Détail du périmètre : {total} pages visitées, dont {linked} atteintes depuis la page d'accueil ou par des liens internes, {seeded} fournies explicitement et {sitemapOnly} ajoutées depuis le sitemap.",
    sitemapCoverageAllLinkedTemplate:
      "Détail du périmètre : les {total} pages visitées ont toutes été atteintes depuis la page d'accueil ou par des liens internes.",
    sitemapIncompleteTemplate:
      "La couverture du sitemap est incomplète. Fichiers sitemap non lus : {failed}. URL de pages déclarées hors du périmètre autorisé ou filtrées par les règles de l'audit : {filtered}. Pages éligibles omises en raison du plafond configuré : {omitted}.",
    toolingParagraphTemplate:
      "L'audit combine des outils de détection automatisée reposant tous sur des règles déterministes : aucun constat n'est inventé ou deviné. Moteur d'accessibilité axe-core {axeVersion}, moteur de performance Lighthouse {lighthouseVersion} avec un profil mobile simulé, comparaison du rendu après deux chargements de chaque page, d'abord sans JavaScript puis avec JavaScript. Référentiel d'accessibilité : WCAG 2.2, niveau AA. Périmètre : {pages} analysées le {date} à partir de la page d'accueil. Une URL qui ne fait que mener à l'accueil d'une langue (par exemple /en) ne porte pas de contenu propre : elle n'est comptée comme une page analysée que si elle déclare des annotations hreflang ; les pages de cette langue sont explorées normalement.",
    pagesScannedSingular: 'page',
    pagesScannedPlural: 'pages',
    automatedCoverageCaveat:
      "Les outils automatisés détectent une part reconnue mais limitée des problèmes d'accessibilité, une estimation généralement admise situant cette part entre 30 et 40 pour cent des critères, sans source unique attribuable. Il s'agit d'une limite inhérente à tout audit automatisé, et non d'une réserve propre à celui-ci : elle garantit que chaque constat listé est vérifiable. Cet audit inclut une série de contrôles d'accessibilité complémentaires couvrant la navigation au clavier, l'ordre de focus, la gestion des erreurs de formulaire, la présence de sous-titres vidéo, et un signal heuristique sur la qualité des textes alternatifs. Cet audit est entièrement automatisé : certaines propriétés d'accessibilité ne peuvent pas être évaluées de manière fiable par des outils automatisés seuls et ne font l'objet d'aucun constat dans ce rapport.",
    extendedPassNoneFoundNote:
      "Résultat des contrôles d'accessibilité complémentaires : aucun piège au clavier, aucune anomalie d'ordre de focus, aucune erreur de formulaire non associée à son champ, et aucune vidéo sans sous-titres n'a été détectée sur les pages analysées.",
    // item 1.7 (La Corniche pass): extendedPassNoneFoundNote above only
    // ever rendered when all four checks found nothing at all - one
    // finding on any single check (e.g. a video without captions)
    // silently suppressed the whole note, so the other three checks,
    // which genuinely found nothing, went unstated. Per-check status is
    // rendered instead whenever at least one check found something, so a
    // clean result is always stated rather than only implied by silence.
    extendedPassResultTemplate:
      "Résultat des contrôles d'accessibilité complémentaires : {checks}.",
    extendedPassCheckKeyboardTrapsLabel: 'pièges au clavier',
    extendedPassCheckFocusOrderLabel: 'ordre de focus',
    extendedPassCheckFormErrorsLabel: 'erreurs de formulaire non associées à leur champ',
    extendedPassCheckVideoCaptionsLabel: 'sous-titres vidéo',
    extendedPassCheckPlaceholderLabelsLabel: 'champs nommés par leur seul texte indicatif',
    extendedPassCheckCleanLabel: 'aucune anomalie détectée',
    extendedPassCheckFoundSingular: 'constat détecté',
    extendedPassCheckFoundPlural: 'constats détectés',
    privacySecurityChecksClean:
      'Les contrôles automatisés des en-têtes de sécurité et du consentement aux cookies ont été exécutés. Aucun problème n’a été détecté par ces contrôles. Cela ne constitue pas une conclusion de conformité juridique.',
    privacySecurityChecksUnavailable:
      'Les contrôles automatisés des en-têtes de sécurité et du consentement aux cookies n’ont pas tous produit de résultat exploitable pour cet audit. Aucune conclusion n’est tirée sur ce périmètre.',
    legalCitationInScopeTemplate:
      "Critères publiés pour l'{regimeName} ({legalCitation}), dont le contrôle relève {authority}. Faits vérifiés pour cet audit : {facts}",
    legalCitationLikelyInScopeTemplate:
      "Critères publiés pour l'{regimeName} ({legalCitation}), dont le contrôle relève {authority}. Faits vérifiés pour cet audit : {facts}",
    legalCitationOutOfScopeParagraph:
      "Critères publiés pour l'{regimeName} ({legalCitation}), dont le contrôle relève {authority}. Faits vérifiés pour cet audit : {facts}",
    legalCitationUndeterminedParagraph:
      "Critères publiés pour l'{regimeName} ({legalCitation}), dont le contrôle relève {authority}. Données disponibles pour cet audit : {facts}",
    legalCitationSyntheticInScopeTemplate:
      "Critères publiés pour l'{regimeName} ({legalCitation}), dont le contrôle relève {authority}. Données de démonstration utilisées pour cet exemple : {facts}",
    legalCitationSyntheticLikelyInScopeTemplate:
      "Critères publiés pour l'{regimeName} ({legalCitation}), dont le contrôle relève {authority}. Données de démonstration utilisées pour cet exemple : {facts}",
    legalCitationSyntheticOutOfScopeParagraph:
      "Critères publiés pour l'{regimeName} ({legalCitation}), dont le contrôle relève {authority}. Données de démonstration utilisées pour cet exemple : {facts}",
    legalCitationSyntheticUndeterminedParagraph:
      "Critères publiés pour l'{regimeName} ({legalCitation}), dont le contrôle relève {authority}. Données de démonstration disponibles pour cet exemple : {facts}",
    legalCitationEffectifFactTemplate: "L'entreprise compte {label} d'après le répertoire Sirene.",
    legalCitationSyntheticEffectifFactTemplate:
      "La tranche d'effectif utilisée pour cet exemple est fictive : {label}.",
    legalCitationTurnoverFactTemplate:
      "Le chiffre d'affaires annuel enregistré est de {amount} ; le seuil publié est de {threshold}.",
    legalCitationSmeBalanceSheetUnknownFactTemplate:
      "Le répertoire indique {effectif} et un chiffre d'affaires de {turnover}, supérieur à {threshold} ; le total de bilan n'était pas disponible pour le comparer à ce seuil.",
    legalCitationSmeFactTemplate:
      "Le répertoire indique {effectif} et un chiffre d'affaires de {turnover}.",
    legalCitationSyntheticSmeFactTemplate:
      "Les données synthétiques de cet exemple utilisent {effectif} et un chiffre d'affaires fictif de {turnover}.",
    legalCitationTransactionalFlowFactTemplate:
      'Le site propose un parcours de {flowType} {location}.',
    legalCitationTransactionalFlowLocationOnSite: 'directement en ligne',
    legalCitationTransactionalFlowLocationDelegated: 'en ligne, délégué à un prestataire tiers',
    legalCitationTransactionalFlowUnknownFact:
      "La présence d'un parcours de réservation, panier ou paiement en ligne n'a pas pu être confirmée sur l'ensemble du site.",
    // Issue #42: detection found booking controls it could not resolve -
    // materially different from the clean negative below.
    legalCitationTransactionalFlowInconclusiveFact:
      "Des contrôles de réservation ont été relevés sur les pages visitées, mais leur destination n'a pas pu être établie de manière fiable : un parcours transactionnel n'est donc ni confirmé ni exclu.",
    // Issue #294: a form element alone (for example a contact-form plugin)
    // does not establish a transactional flow - it must never be stated as
    // one.
    legalCitationTransactionalFlowFormOnlyFact:
      "Un formulaire a été relevé sur les pages visitées, mais un formulaire seul ne permet pas d'établir qu'un parcours transactionnel existe : celui-ci n'est donc ni confirmé ni exclu.",
    legalCitationNoTransactionalFlowFact:
      "Aucun parcours de réservation, panier ou paiement en ligne n'a été trouvé sur les pages visitées.",
    legalCitationSirenMissingFact: "Aucun identifiant SIREN n'a été trouvé sur les pages visitées.",
    legalCitationOverseasJurisdictionFact:
      "Le site relève d'un nom de domaine d'outre-mer ; le régime d'accessibilité applicable à ce territoire n'a pas été vérifié.",
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
    syntheticSirenProvenanceNote:
      "Le numéro et les données d'effectif utilisés ici sont fictifs et propres à cet exemple ; ils ne proviennent pas d'une consultation du répertoire Sirene.",
    legalCitationSirenMismatchTemplate:
      'Le numéro SIREN fourni manuellement ({manualSiren}) diffère de celui publié sur le site ({extractedSiren}). Cette détermination retient le numéro fourni manuellement.',
    legalCitationPointerSentence:
      'Le détail du cadre réglementaire figure dans la section « Cadre réglementaire ».',
    socialExclusionDisclosureTemplate:
      "{count} pages ont été exclues de cette analyse car elles redirigent vers un réseau social tiers, selon la liste d'exclusion par défaut d'Odysseus.",
    socialExclusionDisclosureSingularTemplate:
      "1 page a été exclue de cette analyse car elle redirige vers un réseau social tiers, selon la liste d'exclusion par défaut d'Odysseus.",
    // item P4 (La Corniche pass): rephrased so the sentence doesn't start
    // with a numeral, plain French style.
    crawlCapDisclosureTemplate:
      'Le plafond configuré pour cet audit est de {maxPages} pages, pas la totalité du site : le site peut compter des pages supplémentaires non analysées.',
    sirenSourceResolvedTemplate:
      'Le numéro SIREN a été confirmé comme affiché sur cette page du site : {url}.',
    // Plan 036, binding decision 5: methodology-section half of the LCEN
    // coverage disclosure, operator-approved wording with the checked page
    // (read from the finding's own evidence payload) appended in
    // parentheses. Never states breach, a deadline, or a sanction amount.
    mentionsLegalesCoverageTemplate:
      "La vérification automatique a porté sur la page atteinte depuis le lien Mentions légales ({url}). Aucun identifiant reconnu (numéro SIREN, mention RCS ou numéro de TVA) n'y a été trouvé. Des informations légales peuvent exister ailleurs, par exemple sur une page non visitée par le contrôle, dans un document séparé ou auprès d'un prestataire externe. Cette constatation décrit ce que le contrôle a observé et ne constitue pas une conclusion sur vos obligations. Nous vous recommandons de confirmer votre situation auprès d'un conseil juridique.",
    // P0.1 (2026-08-21 La Corniche feedback pass): the generic "n'a pas
    // abouti... voir Méthodologie" pointer in the performance section used
    // to lead here and find nothing further. This states the real,
    // per-reason failure counts captured from the scan itself, never a
    // guessed or generic explanation.
    lighthouseFailureIntroSentence:
      "La mesure de performance (Lighthouse) n'a pas abouti sur ce site pour cet audit. Détail des échecs constatés :",
    lighthouseFailureReasonTemplate: '{count}/{total} pages : {reason}',
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
  fallbackAnalysis: {
    noteHeading: "Rapport fondé sur les seuls constats de l'analyse automatisée",
    noteBody:
      "Les outils de l'audit n'ont détecté aucun problème critique ou grave, et moins de cinq problèmes de gravité modérée. Ce rapport rassemble donc uniquement leurs résultats mesurés, sans synthèse rédigée. Une analyse rédigée regroupe normalement les constats en thèmes, les hiérarchise et rédige un résumé. Elle n'a pas été lancée ici, le volume de constats ne le justifiant pas.",
    summarySentence:
      "Analyse automatisée sans problème critique ou grave et avec moins de cinq problèmes de gravité modérée. L'analyse rédigée (regroupement, hiérarchisation, résumé) n'a pas été lancée. Les sections factuelles du rapport restent complètes.",
  },
};
