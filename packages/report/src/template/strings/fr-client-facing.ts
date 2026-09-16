import type { ReportStrings } from './types.js';

/**
 * Plan 046: editorial layer for the report's executive/front-facing French.
 *
 * Keep the exhaustive deterministic/technical vocabulary in fr.ts. This layer
 * changes only the surfaces a decision-maker reads first, so the technical
 * annex and methodology can continue to use their precise specialist wording.
 * The spread-based shape is deliberate: every untouched field still comes
 * from the canonical typed table and a new key in ReportStrings cannot vanish
 * silently here.
 */
export function applyFrenchClientFacingCopy(strings: ReportStrings): ReportStrings {
  return {
    ...strings,
    reportIntro: {
      ...strings.reportIntro,
      eyebrow: 'Votre diagnostic',
      heading: 'Les priorités à traiter',
      situationHeading: 'Ce que ce diagnostic vous permet de décider',
      situationBody:
        "Ce rapport vous donne une vue d'ensemble de votre site sous quatre angles : " +
        "l'accessibilité numérique, le référencement naturel, la visibilité dans les " +
        'assistants IA et la qualité de son rendu. Il transforme ensuite les constats en ' +
        'priorités de correction pour distinguer ce qui doit être traité maintenant, ce qui ' +
        'peut attendre et ce qui demande une vérification complémentaire avant intervention.',
      complicationHeading: 'Ce qui mérite votre attention',
      complicationBodyTemplate:
        "L'analyse a relevé {findings} constats distincts, dont {criticalSerious} critiques " +
        'ou sérieux, sur au moins {pages} du périmètre analysé. Ils sont regroupés en ' +
        '{priorities} priorités afin de faire ressortir les corrections à traiter en premier.',
      consequenceRegulatory:
        "Certaines obligations d'accessibilité peuvent également concerner votre " +
        'établissement. La section « {legalSection} » présente les critères et les faits ' +
        'disponibles ; votre situation juridique reste à confirmer avec votre conseil.',
      notALegalOpinionNote:
        'Le périmètre de ce diagnostic est technique et automatisé. Il ne remplace pas un ' +
        'audit RGAA exhaustif et ne constitue pas un avis juridique. Les limites de couverture ' +
        'sont précisées dans « {methodologySection} ».',
      audienceHeading: 'Comment utiliser ce rapport',
    },
    statistics: {
      ...strings.statistics,
      eyebrow: 'Résultats mesurés',
      heading: "Ce que l'analyse a relevé",
      introTemplate:
        '{pages}, {findings} constats distincts après regroupement des répétitions. Un même ' +
        'constat présent sur plusieurs pages ne compte qu’une fois.',
      priorityOwnershipTemplate:
        'Parmi les constats prioritaires, {firstParty} peuvent être corrigés directement, ' +
        '{thirdParty} doivent être transmis à un tiers et {verifyIntent} demandent une ' +
        'vérification selon le contexte.',
      severityBreakdownHeading: 'Répartition par gravité',
    },
    cover: {
      ...strings.cover,
      kicker: 'Odysseus · Diagnostic technique',
      reportTitle: 'Rapport de diagnostic',
      reportType:
        'Accessibilité · Performance · Référencement naturel · Visibilité dans les assistants IA',
      reportTypeNoPerformance:
        'Accessibilité · Référencement naturel · Visibilité dans les assistants IA',
    },
    metadata: {
      ...strings.metadata,
      eyebrow: 'Informations sur le diagnostic',
      heading: 'Périmètre et échelle de gravité',
      riskSmallLabel: 'Niveau global des constats',
      scorecardLabel: 'Niveau global des constats',
      scorecardDisclaimer:
        'Cette note synthétise la gravité des constats mesurés ; elle ne constitue pas une ' +
        'évaluation juridique.',
    },
    executiveSummary: {
      ...strings.executiveSummary,
      eyebrow: 'Synthèse',
      heading: "L'essentiel pour décider",
      regulatoryContextKicker: 'Point réglementaire à vérifier',
      regulatoryContextCriterion:
        "Les exigences d'accessibilité abordées dans ce rapport s'inscrivent notamment dans " +
        "le cadre de l'European Accessibility Act, transposé en droit français par la loi " +
        "n° 2023-171. Leur applicabilité dépend de la taille de l'entreprise, de son activité " +
        'et des services proposés ; la section « Exposition légale » rapproche ces critères ' +
        'des faits disponibles pour votre établissement.',
      regulatoryContextCounsel:
        'Le montant indiqué ci-dessus correspond au plafond prévu par le texte, pas à une ' +
        'sanction prononcée contre votre entreprise. Votre situation peut être confirmée par ' +
        'votre conseil juridique.',
      priorityOwnershipTemplate:
        'Parmi les priorités retenues, {firstParty} constats peuvent être corrigés directement, ' +
        '{thirdParty} doivent être transmis à un tiers et {verifyIntent} demandent une ' +
        'vérification selon votre contexte.',
      startHereKicker: 'À traiter en premier',
      categoryImbalanceNote:
        "Les constats les plus significatifs de ce site concernent surtout l'accessibilité ; " +
        'le référencement naturel et la visibilité dans les assistants IA appellent moins de ' +
        'corrections prioritaires.',
      summaryCountsTemplate:
        'Le diagnostic a relevé {total} constats distincts, dont {actionable} critiques ou ' +
        'sérieux ({critical} critiques et {serious} sérieux).',
      coveredByPrioritiesTemplate:
        'Les priorités présentées ci-dessous en couvrent {covered} ; les autres restent ' +
        'documentés par gravité dans « {remainingSection} ».',
    },
    themes: {
      ...strings.themes,
      eyebrow: 'Priorités de correction',
      headingTemplate: '{count} chantiers à traiter par ordre de priorité',
      effortLabel: 'Complexité',
      impactLabel: 'Pourquoi cela compte',
      affectedPagesLabel: 'Pages concernées',
      ownershipCountsTemplate:
        'Répartition des corrections : {firstParty} à traiter directement, {thirdParty} à ' +
        'transmettre à un tiers et {verifyIntent} à vérifier selon le contexte.',
      whyItMattersLabel: 'Pourquoi cela compte',
      observationLabel: 'Ce que nous avons constaté',
      observationWithPageTemplate:
        'Ce chantier comprend notamment le constat « {defect} », relevé sur la page {page}. ' +
        'Au total, il concerne {pages} {pageWord} et {occurrences} {occurrenceWord}.',
      observationNoPageTemplate:
        'Ce chantier comprend notamment le constat « {defect} ». Au total, il concerne ' +
        '{pages} {pageWord} et {occurrences} {occurrenceWord}.',
      whatYouCanDoLabel: 'Comment le corriger',
      complexityLabel: 'Complexité',
    },
    nextSteps: {
      ...strings.nextSteps,
      eyebrow: 'Synthèse finale',
      heading: 'Vous avez les éléments pour agir',
      synthesisStake:
        'Votre site est un point de contact direct avec vos visiteurs. Son accessibilité, sa ' +
        'visibilité dans les moteurs de recherche et les assistants IA, ainsi que sa vitesse ' +
        'et sa fiabilité influencent la facilité avec laquelle ils peuvent trouver ' +
        "l'information et avancer dans leur parcours. Les priorités de ce rapport indiquent " +
        'où concentrer les premières corrections.',
      synthesisCoverageTemplate:
        'Le rapport retient {priorities} priorités. Parmi elles, {seriousCritical} couvrent au ' +
        'moins un constat critique ou sérieux et {quickWins} correspondent à des gains rapides, ' +
        'avec une complexité faible pour un impact moyen ou élevé.',
      synthesisCoverageFallback:
        'Les priorités et la répartition des constats par gravité présentées dans ce rapport ' +
        'indiquent les corrections à engager en premier.',
      synthesisRoles:
        'La direction arbitre et suit les priorités. Le prestataire technique réalise les ' +
        'corrections. La communication vérifie les contenus publiés et le juridique confirme ' +
        'les obligations applicables.',
      synthesisReauditRecommendation:
        'Une fois les corrections prioritaires mises en ligne, nous recommandons une nouvelle ' +
        'vérification du même périmètre dans un délai de trois à six mois afin de mesurer ce ' +
        'qui a effectivement changé.',
      synthesisComparisonWithFieldData:
        'Cette nouvelle vérification compare les constats par gravité, les critères WCAG 2.2 AA ' +
        'en échec et, lorsqu’elles sont disponibles, les données réelles du Chrome UX Report.',
      synthesisComparisonWithoutFieldData:
        'Cette nouvelle vérification compare les constats par gravité et les critères WCAG 2.2 ' +
        'AA en échec.',
      synthesisConversionNote:
        'Votre taux de conversion reste un indicateur distinct, à suivre dans vos propres ' +
        "outils d'analyse : cette vérification ne l'estime pas.",
      questionTitle: 'Besoin de clarifier un point ?',
      questionBodyTemplate:
        "Pour toute question sur un constat ou une priorité, écrivez à l'équipe Odysseus à " +
        '{email} en indiquant l’identifiant du constat concerné.',
    },
  };
}
