import type { ReportStrings } from './types.js';

export const fr: ReportStrings = {
  toc: {
    eyebrow: 'Sommaire',
    heading: 'Contenu du rapport',
    items: [
      "L'audit en chiffres",
      'Résumé et actions prioritaires',
      'Conformité accessibilité, WCAG 2.2 niveau AA',
      'Priorités classées',
      'Observations hors classement',
      'Preuve de rendu : ce que voient les moteurs de recherche',
      'Mesures de performance',
      'Annexe : liste complète des constats',
      'Méthodologie et limites',
    ],
    note: 'Les numéros de page figurent en pied de page et dans les signets du fichier PDF.',
  },
  statistics: {
    eyebrow: "1 · L'audit en chiffres",
    heading: "Ce que l'analyse a relevé",
    introTemplate:
      '{pages} pages analysées, {findings} constats distincts après regroupement des répétitions. Un constat présent sur plusieurs pages compte une seule fois.',
    pagesTileLabel: 'pages analysées',
    findingsTileLabel: 'constats distincts',
    accessibilityOccurrencesTileLabel: "occurrences d'accessibilité",
    pagesWithCriticalTileLabel: 'pages avec au moins un constat critique',
    criticalTileLabel: 'critiques',
    seriousTileLabel: 'majeurs',
    moderateTileLabel: 'modérés',
    minorTileLabel: 'mineurs',
    wcagFailingDescriptionTemplate: 'critères WCAG 2.2 AA en échec sur {pages} pages',
    accessibilityCategoryTileLabel: 'accessibilité',
    seoRenderingCategoryTileLabel: 'référencement et rendu',
    legendCriticalText: "bloque des visiteurs ou l'indexation",
    legendSeriousText: "dégrade fortement l'usage ou la conformité",
    legendModerateText: 'à corriger, sans urgence',
    legendMinorText: 'optimisation',
  },
  conformanceSummary: {
    eyebrow: '3 · Conformité accessibilité',
    heading: 'Critères WCAG 2.2 niveau AA en échec',
    intro:
      "Les critères ci-dessous relèvent du référentiel WCAG 2.2 niveau AA, auquel renvoie la norme européenne EN 301 549. Un critère en échec est un écart de conformité, pas une préférence de design. Ce rapport cite les critères concernés sans se prononcer sur l'applicabilité d'une obligation légale particulière à votre entreprise, qui dépend de sa taille et de son secteur.",
    criterionColumnLabel: 'Critère',
    criterionNameColumnLabel: 'Intitulé',
    findingsColumnLabel: 'Constats',
    occurrencesColumnLabel: 'Occurrences',
    pagesMaxColumnLabel: 'Pages (max)',
    note: 'Cette page peut être transmise telle quelle à votre développeur, votre agence ou votre conseil juridique. Chaque ligne renvoie aux constats détaillés de l\'annexe.',
    emptyState: "Aucun critère WCAG 2.2 niveau AA en échec n'a été détecté sur ce site.",
  },
  observations: {
    eyebrow: '5 · Observations',
    heading: 'Constats hors classement',
    intro:
      'Ces constats sont réels mais n\'appellent pas de correction classique : la bonne réponse est une décision, pas un correctif.',
    wrapperTitle: "Pages d'intégration de contenu tiers",
    wrapperBodyTemplate:
      "Ces pages sont des enveloppes qui affichent du contenu d'une plateforme tierce : leur contenu est quasiment absent du HTML brut. Les corrections classiques ne s'appliquent pas à du contenu tiers. La décision utile est de choisir entre un lien direct vers la plateforme, un noindex assumé, ou la suppression de ces pages. Constats concernés : {findingIds}.",
    legalTitle: "Pages légales exclues de l'indexation",
    legalBodyTemplate:
      "Ces pages (conditions générales, politique de cookies, politique de confidentialité, ou similaire) portent une directive noindex. C'est une configuration fréquente et souvent volontaire pour ce type de page : aucune action corrective n'est recommandée par défaut, vérifiez simplement que ce choix est assumé. Constats concernés : {findingIds}.",
  },
  cover: {
    reportTitle: "Rapport d'audit",
    eyebrow: "Audit de visibilité et d'accessibilité",
    dateLabel: "Date de l'audit",
    pagesScannedLabel: 'Périmètre analysé',
    languageLabel: 'Langue du rapport',
    wcagReferentialLabel: 'Référentiel audité',
    riskSmallLabel: 'Niveau de risque global',
    riskLevels: { low: 'Faible', medium: 'Moyen', high: 'Élevé' },
  },
  executiveSummary: {
    eyebrow: '2 · Résumé',
    heading: "Ce qu'il faut retenir",
    whatToDoFirstHeading: 'À traiter en premier',
    seeThemeTemplate: 'Voir priorité {rank}.',
    quickWinsLabel: 'Gains rapides',
    quickWinsSuffix: 'faibles en effort, immédiates en effet',
  },
  themes: {
    eyebrow: '4 · Priorités',
    headingTemplate: '{count} chantiers, classés par effort et par impact',
    effortLabel: 'Effort',
    impactLabel: 'Impact commercial',
    conformityLabel: 'Conformité',
    conformityNotApplicable: 'Sans objet',
    conformityNonConformant: 'Non conforme',
    legalTagLabel: 'Exigence de conformité',
    quickWinBadgeLabel: 'Gain rapide',
    effortImpactLevels: { low: 'Faible', medium: 'Moyen', high: 'Élevé' },
    pagesOfTotalTemplate: '{pages} {pageWord} sur {totalPages}',
    refsLabel: 'Constats',
  },
  renderDiffEvidence: {
    eyebrow: '6 · Preuve de rendu',
    heading: "Ce que reçoit un moteur de recherche avant JavaScript",
    intro:
      "Chaque page est chargée deux fois : une fois sans JavaScript, comme le fait un robot d'indexation basique, une fois dans un navigateur complet. La différence mesure le contenu invisible pour les moteurs.",
    rawLabel: 'Vue brute (sans JavaScript)',
    renderedLabel: 'Vue affichée (après rendu)',
    missingPercentLabel: 'Contenu manquant dans la vue brute',
    noScreenshotAvailable: 'Capture non disponible pour cette page',
    healthyPagesSummary: '{healthy} pages sur {total} sont saines : aucun contenu manquant dans la vue brute.',
    visibleTextCountsTemplate:
      'Texte visible : {raw} caractères en vue brute contre {rendered} après rendu',
    visibleTextCountsNotAvailable:
      'Nombre de caractères non mesuré pour cette page (pourcentage de contenu manquant sous le seuil de détection).',
    altRawTemplate: 'Vue brute de {url} : {chars}',
    altRenderedTemplate: 'Vue affichée de {url} : {chars}',
    altCharsKnownTemplate: '{n} caractères de texte visible',
    altCharsUnknown: 'nombre de caractères non mesuré',
  },
  coreWebVitals: {
    eyebrow: '7 · Mesures de performance',
    heading: "Vitesse et stabilité d'affichage, page par page",
    intro:
      "Mesures de laboratoire réalisées avec Lighthouse sur un profil mobile simulé, avec limitation du réseau et du processeur. Ce profil représente un téléphone d'entrée de gamme sur un réseau moyen : sur un ordinateur avec une bonne connexion, les temps réels sont nettement plus courts, mais le classement des pages entre elles reste représentatif. LCP et CLS sont des Core Web Vitals ; le TBT est un indicateur de laboratoire qui approxime la réactivité.",
    inpNote:
      "La réactivité réelle (INP) exige des données de visiteurs et ne peut pas être mesurée par un scan automatisé.",
    pageColumnLabel: 'Page',
    lcpColumnLabel: 'LCP, contenu principal',
    clsColumnLabel: 'CLS, stabilité visuelle',
    tbtColumnLabel: 'TBT, temps de blocage',
    notMeasured: 'Non mesuré',
    ratingGoodLabel: 'bon',
    ratingNeedsImprovementLabel: 'à améliorer',
    ratingPoorLabel: 'insuffisant',
    legendGoodTemplate: 'LCP ≤ 2,5 s · CLS ≤ 0,1 · TBT ≤ 200 ms',
    legendMidTemplate: 'LCP ≤ 4 s · CLS ≤ 0,25 · TBT ≤ 600 ms',
    legendPoorLabel: 'au-delà',
  },
  findingsAppendix: {
    eyebrow: '8 · Annexe',
    heading: 'Liste complète des constats',
    intro:
      'Chaque constat détecté par les outils automatisés, y compris ceux jugés mineurs et non repris dans les priorités ci-dessus.',
    categoryLabels: {
      accessibility: 'Accessibilité',
      seo: 'Référencement (SEO)',
      performance: 'Performance',
      rendering: 'Rendu',
    },
    severityLabels: {
      critical: 'Critique',
      serious: 'Majeur',
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
    eyebrow: '9 · Méthodologie et limites',
    heading: 'Comment cet audit a été réalisé',
    toolingParagraphTemplate:
      "L'audit combine des outils de détection automatisée, tous déterministes : aucun constat n'est inventé ou deviné. Moteur d'accessibilité axe-core {axeVersion}, moteur de performance Lighthouse {lighthouseVersion} sur profil mobile simulé, comparaison de rendu par double chargement de chaque page, JavaScript désactivé puis activé. Référentiel audité : WCAG 2.2, niveau AA. Périmètre : {pages} pages explorées le {date} à partir de la page d'accueil.",
    automatedCoverageCaveat:
      "Les outils automatisés détectent une part reconnue mais limitée des problèmes d'accessibilité, généralement estimée entre 30 et 40 pour cent des critères. C'est une propriété de tout audit automatisé, pas une réserve sur celui-ci : elle garantit que chaque constat listé est vérifiable. La navigation au clavier, l'ordre de focus, la qualité rédactionnelle des textes alternatifs, la gestion des erreurs de formulaire et le sous-titrage des vidéos exigent une vérification manuelle, qui fait l'objet d'une prestation distincte.",
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
    legalCitationManualTransactionalFlowWithReasonTemplate:
      "La présence d'un parcours de réservation en ligne a été confirmée manuellement par l'auditeur plutôt que détectée automatiquement ({reason}).",
    legalCitationManualTransactionalFlowNoReasonSentence:
      "La présence d'un parcours de réservation en ligne a été confirmée manuellement par l'auditeur plutôt que détectée automatiquement.",
    legalCitationTransactionalFlowDisagreementSentence:
      "Cette confirmation manuelle diverge du résultat de la détection automatisée.",
  },
  footer: {
    confidentialityLabel: 'Rapport confidentiel',
    pageLabel: 'Page',
  },
};
