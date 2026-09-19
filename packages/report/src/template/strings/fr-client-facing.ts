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
    // Issue #336: one canonical title per top-level section. An empty
    // heading tells renderSheetHeader the title stands alone; the eyebrow is
    // what sectionTitle returns, so the TOC and every cross-reference read
    // the same words.
    checklist: { ...strings.checklist, eyebrow: "Plan d'action", heading: '' },
    remainingWork: { ...strings.remainingWork, eyebrow: 'Autres constats', heading: '' },
    observations: { ...strings.observations, eyebrow: 'Observations complémentaires', heading: '' },
    conformanceSummary: {
      ...strings.conformanceSummary,
      eyebrow: 'Conformité aux WCAG 2.2, niveau AA',
      heading: '',
    },
    renderDiffEvidence: {
      ...strings.renderDiffEvidence,
      eyebrow: 'Rendu sans JavaScript',
      heading: '',
    },
    coreWebVitals: { ...strings.coreWebVitals, eyebrow: 'Performance', heading: '' },
    benchmarkPercentile: {
      ...strings.benchmarkPercentile,
      eyebrow: 'Comparaison avec la cohorte de référence',
      heading: '',
    },
    accessibilityStatement: {
      ...strings.accessibilityStatement,
      eyebrow: "Projet de déclaration d'accessibilité",
      heading: '',
    },
    legalExposure: { ...strings.legalExposure, eyebrow: 'Cadre réglementaire', heading: '' },
    methodology: { ...strings.methodology, eyebrow: 'Méthodologie et limites', heading: '' },
    findingsAppendix: {
      ...strings.findingsAppendix,
      eyebrow: 'Annexe technique — constats détaillés',
      heading: '',
    },
    glossary: { ...strings.glossary, eyebrow: 'Glossaire', heading: '' },
    reportIntro: {
      ...strings.reportIntro,
      eyebrow: 'Présentation du diagnostic',
      heading: '',
      situationHeading: 'Ce que ce diagnostic vous permet de décider',
      situationBody:
        "Ce rapport vous donne une vue d'ensemble de votre site sous cinq angles : " +
        "l'accessibilité numérique, la vitesse de chargement, le référencement naturel, la " +
        "visibilité dans les assistants IA et la manière dont ses contenus s'affichent. Il transforme ensuite " +
        'les constats en ' +
        'priorités de correction pour distinguer ce qui doit être traité maintenant, ce qui ' +
        'peut attendre et ce qui demande une vérification complémentaire avant intervention.',
      complicationHeading: 'Ce qui mérite votre attention',
      complicationBodyTemplate:
        "L'analyse a relevé {findings}, dont {criticalSerious} de gravité critique ou " +
        'sérieuse, sur au moins {pages} du périmètre analysé. Le regroupement en {priorities} ' +
        'fait ressortir les corrections à traiter en premier.',
      // The base strings name these "priorités classées", which reads as
      // internal vocabulary next to the client-facing section titles.
      prioritySingular: 'priorité',
      priorityPlural: 'priorités',
      consequenceRegulatory:
        "Certaines obligations d'accessibilité peuvent également concerner votre " +
        'établissement. La section « {legalSection} » présente les critères et les faits ' +
        'disponibles ; votre situation juridique reste à confirmer avec votre conseil.',
      notALegalOpinionNote:
        'Le périmètre de ce diagnostic est technique et automatisé. Il ne remplace pas un ' +
        'audit RGAA exhaustif et ne constitue pas un avis juridique. Les limites de couverture ' +
        'sont précisées dans « {methodologySection} ».',
      audienceHeading: 'Comment utiliser ce rapport',
    },
    statistics: {
      ...strings.statistics,
      eyebrow: 'Résultats du diagnostic',
      heading: '',
      introTemplate:
        '{pages}, {findings} constats distincts après regroupement des répétitions. Un même ' +
        'constat présent sur plusieurs pages ne compte qu’une fois.',
      priorityOwnership: {
        leadTemplate: 'Parmi les constats prioritaires, {clauses}.',
        firstPartySingularTemplate: '{count} peut être corrigé directement',
        firstPartyPluralTemplate: '{count} peuvent être corrigés directement',
        thirdPartySingularTemplate: '{count} doit être transmis à un tiers',
        thirdPartyPluralTemplate: '{count} doivent être transmis à un tiers',
        verifyIntentSingularTemplate: '{count} nécessite une vérification préalable',
        verifyIntentPluralTemplate: '{count} nécessitent une vérification préalable',
        clauseSeparator: ', ',
        clauseConjunction: ' et ',
      },
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
      // Issue #313: both fields on the second sheet used to share the same
      // label, printing "NIVEAU GLOBAL DES CONSTATS" twice - once over the
      // letter grade, once over the Faible/Moyen/Élevé bar. The grade is a
      // note, the bar is a severity level; keep the two labels distinct.
      riskSmallLabel: 'Niveau de gravité',
      scorecardLabel: 'Note globale',
      scorecardDisclaimer:
        'Cette note synthétise la gravité des constats mesurés ; elle ne constitue pas une ' +
        'évaluation juridique.',
    },
    executiveSummary: {
      ...strings.executiveSummary,
      eyebrow: 'Synthèse',
      heading: '',
      regulatoryContextKicker: 'Point réglementaire à vérifier',
      regulatoryContextCriterion:
        "Les exigences d'accessibilité abordées dans ce rapport s'inscrivent notamment dans " +
        "le cadre de l'European Accessibility Act, transposé en droit français par la loi " +
        "n° 2023-171. Leur applicabilité dépend de la taille de l'entreprise, de son activité " +
        'et des services proposés ; la section « Cadre réglementaire » met ces critères ' +
        'en regard des informations disponibles pour votre établissement.',
      regulatoryContextCounsel:
        'Le montant indiqué ci-dessus correspond au plafond prévu par le texte, pas à une ' +
        'sanction prononcée contre votre entreprise. Votre situation peut être confirmée par ' +
        'votre conseil juridique.',
      priorityOwnership: {
        leadTemplate: 'Parmi les priorités retenues, {clauses}.',
        firstPartySingularTemplate: '{count} constat peut être corrigé directement',
        firstPartyPluralTemplate: '{count} constats peuvent être corrigés directement',
        thirdPartySingularTemplate: '{count} doit être transmis à un tiers',
        thirdPartyPluralTemplate: '{count} doivent être transmis à un tiers',
        verifyIntentSingularTemplate: '{count} nécessite une vérification préalable',
        verifyIntentPluralTemplate: '{count} nécessitent une vérification préalable',
        clauseSeparator: ', ',
        clauseConjunction: ' et ',
      },
      startHereKicker: 'À traiter en premier',
      categoryImbalanceNote:
        "Les constats les plus significatifs de ce site concernent surtout l'accessibilité ; " +
        'le référencement naturel et la visibilité dans les assistants IA appellent moins de ' +
        'corrections prioritaires.',
      summaryCountsTemplate:
        'Le diagnostic a relevé {total} constats distincts, dont {actionable} critiques ou ' +
        'sérieux ({critical} critiques et {serious} sérieux).',
      coveredByPrioritiesTemplate:
        'Les priorités présentées dans la section « {prioritiesSection} » en couvrent ' +
        '{covered} ; les autres restent documentés par gravité dans « {remainingSection} ».',
    },
    themes: {
      ...strings.themes,
      eyebrow: 'Priorités de correction',
      headingTemplate: '',
      effortLabel: 'Complexité',
      impactLabel: 'Impact',
      affectedPagesLabel: 'Pages concernées',
      ownershipSummaryTemplate: 'Répartition des corrections : {parts}.',
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
      whyItMattersLabel: 'Enjeu',
      observationLabel: 'Ce que nous avons constaté',
      observationWithPageTemplate:
        'Cette priorité comprend notamment le constat « {defect} », relevé sur la page {page}. ' +
        'Au total, elle concerne {pages} {pageWord} et {occurrences} {occurrenceWord}.',
      observationNoPageTemplate:
        'Cette priorité comprend notamment le constat « {defect} ». Au total, elle concerne ' +
        '{pages} {pageWord} et {occurrences} {occurrenceWord}.',
      whatYouCanDoLabel: 'Comment le corriger',
      complexityLabel: 'Complexité',
    },
    nextSteps: {
      ...strings.nextSteps,
      eyebrow: 'Prochaines étapes',
      heading: '',
      synthesisStake:
        'Votre site est un point de contact direct avec vos visiteurs. Son accessibilité, sa ' +
        'visibilité dans les moteurs de recherche et les assistants IA, ainsi que sa vitesse ' +
        'et sa fiabilité influencent la facilité avec laquelle ils peuvent trouver ' +
        "l'information, poursuivre leur navigation ou effectuer leur démarche. Les priorités de ce rapport indiquent " +
        'où concentrer les premières corrections.',
      synthesisCoverage: {
        leadTemplate: 'Le rapport retient {priorities}. Parmi elles, {clauses}.',
        prioritySingularTemplate: '{count} priorité',
        priorityPluralTemplate: '{count} priorités',
        seriousCriticalSingularTemplate: '{count} regroupe au moins un constat critique ou sérieux',
        seriousCriticalPluralTemplate: '{count} regroupent au moins un constat critique ou sérieux',
        quickWinsSingularTemplate:
          '{count} correspond à une action rapide, avec une complexité faible pour un impact moyen ' +
          'ou élevé',
        quickWinsPluralTemplate:
          '{count} correspondent à des actions rapides, avec une complexité faible pour un impact ' +
          'moyen ou élevé',
        clauseSeparator: ', ',
        clauseConjunction: ' et ',
      },
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
        'Cette nouvelle vérification comparera le nombre et la gravité des constats, les critères WCAG 2.2 AA ' +
        'en échec et, lorsqu’elles sont disponibles, les données réelles du Chrome UX Report.',
      synthesisComparisonWithoutFieldData:
        'Cette nouvelle vérification comparera le nombre et la gravité des constats ainsi que les critères WCAG 2.2 ' +
        'AA en échec.',
      synthesisConversionNote:
        'Votre taux de conversion reste un indicateur distinct, à suivre dans vos propres ' +
        "outils d'analyse : cette vérification ne l'estime pas.",
      questionTitle: 'Questions sur ce rapport',
      questionBodyTemplate:
        "Pour toute question sur un constat ou une priorité, écrivez à l'équipe Odysseus à " +
        '{email} en indiquant l’identifiant du constat concerné.',
    },
  };
}
