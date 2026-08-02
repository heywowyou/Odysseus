import type { ReportStrings } from './types.js';

export const fr: ReportStrings = {
  cover: {
    reportTitle: "Rapport d'audit",
    dateLabel: "Date de l'audit",
  },
  executiveSummary: {
    heading: 'Résumé',
    overallRiskLabel: 'Niveau de risque global',
    riskLevels: { low: 'Faible', medium: 'Moyen', high: 'Élevé' },
  },
  whatToDoFirst: {
    heading: 'Par où commencer',
    intro:
      'Ce qui mérite votre attention en premier, présenté simplement, sans jargon technique.',
  },
  themes: {
    heading: 'Priorités',
    priorityLabel: 'Priorité',
    effortLabel: 'Effort estimé',
    impactLabel: 'Impact estimé',
    legalRelevanceLabel: 'Cadre réglementaire concerné',
    recommendedActionsLabel: 'Actions recommandées',
    affectedPagesLabel: 'Pages concernées',
    effortImpactLevels: { low: 'Faible', medium: 'Moyen', high: 'Élevé' },
  },
  renderDiffEvidence: {
    heading: 'Rendu brut contre rendu affiché',
    intro:
      "Ce que reçoit un moteur de recherche avant exécution du JavaScript, comparé à ce qu'un visiteur voit réellement.",
    rawLabel: 'Vue brute (sans JavaScript)',
    renderedLabel: 'Vue affichée (après rendu)',
    missingPercentLabel: 'Contenu manquant dans la vue brute',
    noScreenshotAvailable: 'Capture non disponible pour cette page',
  },
  coreWebVitals: {
    heading: 'Signaux de performance (Core Web Vitals)',
    intro:
      "Mesures de vitesse et de stabilité d'affichage, page par page. Ces chiffres proviennent d'un test en laboratoire et peuvent varier d'une mesure à l'autre.",
    pageColumnLabel: 'Page',
    lcpColumnLabel: 'LCP (affichage du contenu principal)',
    clsColumnLabel: 'CLS (stabilité visuelle)',
    tbtColumnLabel: 'TBT (temps de blocage)',
    notMeasured: 'Non mesuré',
  },
  findingsAppendix: {
    heading: 'Annexe : liste complète des constats',
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
      serious: 'Important',
      moderate: 'Modéré',
      minor: 'Mineur',
    },
    ruleColumnLabel: 'Règle',
    pagesColumnLabel: 'Pages',
    occurrencesColumnLabel: 'Occurrences',
    wcagColumnLabel: 'Critères WCAG',
  },
  methodology: {
    heading: 'Méthodologie',
    toolingIntro:
      "Cet audit combine plusieurs outils de détection automatisée, tous déterministes : aucun constat n'est inventé ou deviné.",
    axeVersionLabel: 'Moteur accessibilité (axe-core), version',
    lighthouseVersionLabel: 'Moteur performance (Lighthouse), version',
    wcagTagSetLabel: 'Niveau de conformité audité : WCAG 2.2, niveau AA',
    automatedCoverageCaveat:
      "Les outils automatisés détectent une part reconnue mais limitée des problèmes d'accessibilité, généralement estimée entre 30 et 40 pour cent. La navigation au clavier, l'ordre de focus, la qualité des textes alternatifs, la gestion des erreurs de formulaire et le sous-titrage des vidéos nécessitent une vérification manuelle, effectuée séparément de cette analyse automatisée.",
  },
  limitations: {
    heading: 'Limites de cet audit',
    body:
      "Cet audit repose sur des outils de détection automatisée et sur les critères qu'ils couvrent effectivement. Certains aspects de l'accessibilité et de la conformité nécessitent une vérification humaine complémentaire, non couverte automatiquement : navigation au clavier, ordre de focus, qualité des textes alternatifs, gestion des erreurs de formulaire, sous-titrage des vidéos. Ce rapport cite les critères techniques concernés (WCAG 2.2, EN 301 549) sans se prononcer sur l'applicabilité d'une obligation légale particulière à votre entreprise, celle-ci dépendant de sa taille et de son secteur d'activité.",
  },
};
