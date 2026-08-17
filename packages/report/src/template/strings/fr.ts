import type { ReportStrings } from './types.js';

export const fr: ReportStrings = {
  toc: {
    eyebrow: 'Sommaire',
    heading: 'Contenu du rapport',
    items: [
      'Résumé et actions prioritaires',
      'Exposition légale',
      "L'audit en chiffres",
      'Priorités classées',
      'Check-list des priorités (imprimable)',
      'Observations hors classement',
      'Conformité accessibilité, WCAG 2.2 niveau AA',
      'Preuve de rendu : ce que voient les moteurs de recherche',
      'Mesures de performance',
      "Projet de déclaration d'accessibilité",
      'Méthodologie et limites',
      'Annexe : liste complète des constats',
      'Glossaire',
      'Prochaines étapes & contact',
    ],
  },
  statistics: {
    eyebrow: "03 · L'audit en chiffres",
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
    legendCriticalText: "bloque des visiteurs ou l'indexation",
    legendSeriousText: "dégrade fortement l'usage ou la conformité",
    legendModerateText: 'à corriger, sans urgence',
    legendMinorText: 'optimisation',
  },
  conformanceSummary: {
    eyebrow: '07 · Conformité accessibilité',
    heading: 'Critères WCAG 2.2 niveau AA en échec',
    bodyIntro:
      "Un critère en échec est un écart de conformité, pas une préférence esthétique. Cette page peut être transmise directement à un développeur, une agence ou un conseil juridique.",
    scopeNote: "Cette liste cite des critères sans se prononcer sur leur applicabilité légale précise à ce site.",
    criterionColumnLabel: 'Critère',
    criterionNameColumnLabel: 'Intitulé',
    findingsColumnLabel: 'Constats',
    occurrencesColumnLabel: 'Occurrences',
    pagesMaxColumnLabel: 'Pages (max)',
    emptyState: "Aucun critère WCAG 2.2 niveau AA en échec n'a été détecté sur ce site.",
  },
  observations: {
    eyebrow: '06 · Observations',
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
  },
  executiveSummary: {
    eyebrow: '01 · Résumé',
    heading: "Ce qu'il faut retenir",
    startHereKicker: 'Par où commencer',
    jumpLinkLabel: 'Voir →',
  },
  legalExposure: {
    eyebrow: '02 · Exposition légale',
    heading: 'Exposition légale',
    eaaDeadlineLabel: 'Échéance EAA',
    eaaDeadlineValue: '28 juin 2025',
    eaaDeadlineNote: "Date d'entrée en application des obligations de l'EAA, fixée par la directive elle-même.",
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
    disclaimerNote:
      "Généré à partir de l'évaluation d'obligations existante ; aucune interprétation juridique supplémentaire n'a été ajoutée. Une revue par un conseil juridique reste nécessaire.",
    undeterminedActionNote:
      "Ce statut se précisera si le numéro SIREN de l'entreprise est publié sur le site ou communiqué à l'équipe Odysseus.",
  },
  checklist: {
    eyebrow: '05 · Check-list imprimable',
    heading: 'Check-list des priorités',
    intro: "Page pensée pour être imprimée ou capturée seule, sans prose, uniquement l'essentiel.",
    rankColumnLabel: '#',
    priorityColumnLabel: 'Priorité',
    effortColumnLabel: 'Effort',
    impactColumnLabel: 'Impact',
    pagesColumnLabel: 'Pages',
  },
  themes: {
    eyebrow: '04 · Priorités',
    headingTemplate: '{count} chantiers, classés par effort et par impact',
    effortLabel: 'Effort',
    impactLabel: 'Impact commercial',
    affectedPagesLabel: 'Pages affectées',
    conformityLabel: 'Conformité',
    conformityNotApplicable: 'Sans objet',
    conformityNonConformant: 'Non conforme',
    legalTagLabel: 'Exigence de conformité',
    impactCitationLabel: 'Repère chiffré',
    quickWinBadgeLabel: 'Gain rapide',
    effortImpactLevels: { low: 'Faible', medium: 'Moyen', high: 'Élevé' },
    pagesOfTotalTemplate: '{pages} {pageWord} sur {totalPages}',
    refsLabel: 'Constats',
  },
  renderDiffEvidence: {
    eyebrow: '08 · Preuve de rendu',
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
    eyebrow: '09 · Performance',
    heading: 'Mesures de performance',
    introTemplate: 'Valeurs médianes agrégées sur les {pages} pages (Lighthouse), à titre illustratif.',
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
    eyebrow: "10 · Déclaration",
    heading: "Projet de déclaration d'accessibilité",
    intro: "Squelette généré à partir des constats, à compléter par le client avant publication.",
    criterionColumnLabel: 'Critère',
    statusColumnLabel: 'Statut de conformité',
    nonConformantPartialLabel: 'Non conforme (partiellement)',
    contactHeading: 'Contact',
    contactBody: '[Adresse e-mail de contact à compléter par le client] - processus de signalement à définir.',
    remediationPlanHeading: 'Plan de remédiation',
    remediationPlanBody: 'Voir la section « Priorités classées » ci-dessus pour le plan.',
  },
  glossary: {
    eyebrow: '13 · Glossaire',
    heading: 'Glossaire',
    terms: [
      {
        term: 'WCAG 2.2',
        definition:
          "Le référentiel international de critères d'accessibilité numérique publié par le W3C, niveaux A / AA / AAA.",
      },
      {
        term: 'EAA',
        definition:
          "Directive européenne imposant l'accessibilité numérique à de nombreux produits et services à partir du 28 juin 2025.",
      },
      {
        term: 'RGAA',
        definition:
          "Référentiel Général d'Amélioration de l'Accessibilité, la déclinaison française opérationnelle des critères WCAG.",
      },
      {
        term: 'EN 301 549',
        definition:
          "Norme européenne d'accessibilité des TIC, référence technique citée par l'EAA et les marchés publics.",
      },
      {
        term: 'Critique',
        definition: 'Sévérité la plus haute : bloque une tâche essentielle pour une partie des utilisateurs.',
      },
      {
        term: 'Sérieux',
        definition: "Gêne fortement l'usage du site sans l'empêcher totalement.",
      },
      {
        term: 'Modéré',
        definition: "Complique l'usage pour certains profils ou contextes d'usage.",
      },
      {
        term: 'Mineur',
        definition: 'Écart de faible impact, non bloquant.',
      },
      {
        term: 'Gain rapide',
        definition: 'Correctif à faible effort et fort impact, à traiter en priorité.',
      },
    ],
  },
  nextSteps: {
    eyebrow: '14 · Suite',
    heading: 'Prochaines étapes & contact',
    questionTitle: 'Une question ?',
    questionBody:
      "Toute demande de clarification sur un constat ou une priorité peut être adressée directement à l'équipe Odysseus, en citant l'identifiant du constat concerné.",
    reauditTitle: 'Ré-audits',
    reauditBody:
      'Un ré-audit relance le même périmètre et compare les résultats au rapport précédent, constat par constat, pour mesurer la progression.',
    postFixTitle: 'Vérification post-correctifs',
    postFixBody:
      'Une fois les priorités traitées, une vérification ciblée confirme que les constats corrigés le sont bien, sans relancer un audit complet.',
  },
  findingsAppendix: {
    eyebrow: '12 · Annexe',
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
    ruleColumnLabel: 'Règle',
    findingSingular: 'constat',
    findingPlural: 'constats',
    occurrenceSingular: 'occurrence',
    occurrencePlural: 'occurrences',
    pageSingular: 'page',
    pagePlural: 'pages',
    upToLabel: "jusqu'à",
    wcagLabel: 'WCAG',
    minorAggregateTitle: 'Optimisations mineures, vue condensée',
    minorAggregateGroupedSuffix: 'regroupés par règle',
    minorAggregateNote:
      "Ces constats sont réels mais secondaires par rapport aux priorités ci-dessus. Le détail par page et par sélecteur est disponible sur demande dans l'export technique.",
    observationsCrossRefLabel: 'voir Observations',
  },
  methodology: {
    eyebrow: '11 · Méthodologie et limites',
    heading: 'Comment cet audit a été réalisé',
    toolingParagraphTemplate:
      "L'audit combine des outils de détection automatisée, tous déterministes : aucun constat n'est inventé ou deviné. Moteur d'accessibilité axe-core {axeVersion}, moteur de performance Lighthouse {lighthouseVersion} sur profil mobile simulé, comparaison de rendu par double chargement de chaque page, JavaScript désactivé puis activé. Référentiel audité : WCAG 2.2, niveau AA. Périmètre : {pages} pages explorées le {date} à partir de la page d'accueil.",
    automatedCoverageCaveat:
      "Les outils automatisés détectent une part reconnue mais limitée des problèmes d'accessibilité, généralement estimée entre 30 et 40 pour cent des critères. C'est une propriété de tout audit automatisé, pas une réserve sur celui-ci : elle garantit que chaque constat listé est vérifiable. Cet audit inclut une passe d'accessibilité étendue couvrant la navigation au clavier, l'ordre de focus, la gestion des erreurs de formulaire, la présence de sous-titres vidéo, et un signal heuristique sur la qualité des textes alternatifs. Cet audit est entièrement automatisé : certaines propriétés d'accessibilité ne peuvent pas être évaluées de manière fiable par des outils automatisés seuls et ne font l'objet d'aucun constat dans ce rapport.",
    legalCitationInScopeTemplate:
      "Ce site relève de l'obligation suivante : {regimeName}, sous le contrôle de {authority} ({legalCitation}). {facts}",
    legalCitationLikelyInScopeTemplate:
      "Les éléments disponibles indiquent que ce site relève probablement de l'obligation suivante : {regimeName}, sous le contrôle de {authority} ({legalCitation}). {facts} Cette évaluation n'a pas pu être confirmée faute d'une vérification complète du parcours du site.",
    legalCitationOutOfScopeParagraph:
      "Sur la base des éléments disponibles (taille de l'entreprise et absence de parcours transactionnel de premier niveau), ce site ne relève pas de l'obligation d'accessibilité numérique prévue par la loi n° 2023-171.",
    legalCitationUndeterminedParagraph:
      "Ce rapport cite les critères techniques concernés (WCAG 2.2, EN 301 549) sans se prononcer sur l'applicabilité d'une obligation légale particulière à votre entreprise, laquelle dépend de sa taille et de son secteur d'activité.",
    legalCitationEffectifFactTemplate: "L'entreprise compte {label} d'après le répertoire Sirene.",
    legalCitationTurnoverFactTemplate: "Le chiffre d'affaires annuel déclaré dépasse le seuil de {threshold}.",
    legalCitationTransactionalFlowFact:
      'Le site propose un parcours transactionnel de premier niveau (réservation, panier ou paiement).',
    legalCitationTransactionalFlowUnknownFact:
      "La présence d'un parcours transactionnel de premier niveau n'a pas pu être confirmée sur l'ensemble du site.",
    legalCitationExemptionRouteSentence:
      "La seule voie documentée pour s'exempter de cette obligation est une demande de dérogation pour charge disproportionnée, déposée sur Démarche Simplifiée.",
    legalCitationManualSirenWithFindingTemplate:
      "Le numéro SIREN utilisé pour cette détermination a été fourni manuellement, ce site ne le publie pas lui-même (voir constat {findingId}).",
    legalCitationManualSirenNoFindingSentence:
      "Le numéro SIREN utilisé pour cette détermination a été fourni manuellement, ce site ne publie pas ce numéro lui-même.",
    legalCitationSirenMismatchTemplate:
      "Le numéro SIREN fourni manuellement ({manualSiren}) diffère de celui publié sur le site ({extractedSiren}). Cette détermination retient le numéro fourni manuellement.",
    legalCitationPointerSentence: 'Le détail de l\'exposition légale figure dans la section « Exposition légale ».',
  },
  footer: {
    confidentialityLabel: 'Rapport confidentiel',
    pageLabel: 'Page',
  },
};
