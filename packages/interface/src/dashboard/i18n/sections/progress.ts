import type { ProgressPhase } from '../../lib/phase-order';
import type { ScanFailureReason } from '../../routes/scan-failure-model';

export interface ProgressStrings {
  title: string;
  description: string;
  crawlPhaseLabel: string;
  scanPhaseLabel: string;
  contentScanPhaseLabel: string;
  lighthousePhaseLabel: string;
  contentProgressMessage: string;
  performanceSelectionMessage: string;
  lighthouseProgressMessage: string;
  etaLabel: string;
  etaRoughSuffix: string;
  /** Issue #223: shown in place of the countdown once the client-aged
   *  estimate reaches 0 while the phase is still running - the phase
   *  isn't stuck, the estimate is just older than the current poll. */
  etaFinishingLabel: string;
  /** Operator copy per pipeline phase, keyed by the vocabulary derived
   *  from the checked-in order fixture (lib/phase-order.ts), so a phase
   *  added there fails to compile until both languages cover it. */
  phaseLabels: Record<ProgressPhase, string>;
  completeHeading: string;
  failedHeading: string;
  /** Issue #73: a job stopped deliberately on the D8 identity-
   *  confirmation gate, not crashed - its own card, distinct from
   *  failedHeading. */
  needsInputHeading: string;
  needsInputNote: string;
  goToAuditLink: string;
  urlResultsHeading: string;
  notFound: string;
  /** Issue #402: the unknown-scan page's way forward to scan history. */
  notFoundAction: string;
  /** Stop control of the live progress page and its confirmation and
   *  terminal states (a cancelled job keeps finished phases). */
  stopButton: string;
  confirmStopTitle: string;
  confirmStopBody: string;
  stoppedHeading: string;
  cancelledNote: string;
  /** Issue #90: shown on a failed full-audit job whose audit was
   *  persisted, so the operator opens the audit instead of re-scanning.
   *  The link label reuses goToAuditLink. */
  failedRescanHint: string;
  /** Issue #386: a Full Scan whose audit was saved but whose report
   *  writing or PDF production failed reads completeHeading, then this
   *  separate block naming the failed step, never failedHeading. */
  reportFailedHeading: string;
  reportFailedStages: { writing: string; pdf: string; unknown: string };
  /** Issue #187: links a coverage-gate failure to the crawl delay / scan
   *  concurrency fields on /scans/new that its own message names as the
   *  remedy. */
  coverageGateFieldsLink: string;
  /** Localized primary explanations for ordinary scan failures. */
  failureReasons: Record<ScanFailureReason, string>;
  failureTechnicalDetails: string;
  newScanLink: string;
  /** A completed prospect-linked scan returns the operator to its record. */
  goToProspectLink: string;
  pushbackWarning: string;
  slowRelaunchLink: string;
}

export const progress = {
  fr: {
    title: 'Suivi du scan',
    description: 'Les étapes de la visite du site, page par page.',
    crawlPhaseLabel: 'Exploration du site',
    scanPhaseLabel: 'Analyse des pages',
    contentScanPhaseLabel: 'Vérifications du contenu et de l’accessibilité',
    lighthousePhaseLabel: 'Mesure des performances',
    contentProgressMessage: 'Pages de contenu vérifiées : {completed}/{target}.',
    performanceSelectionMessage:
      '{target} pages prévues pour les vérifications du contenu. Sélection des pages de performance en cours.',
    lighthouseProgressMessage:
      '{content} pages de contenu vérifiées. Pages échantillons mesurées pour les performances : {completed}/{target}.',
    etaLabel: 'Temps restant estimé',
    etaRoughSuffix: '(estimation approximative)',
    etaFinishingLabel: 'Presque terminé',
    phaseLabels: {
      queued: 'En attente',
      crawl: 'Exploration du site',
      scan: 'Analyse des pages',
      'content-scan': 'Vérification du contenu et de l’accessibilité',
      'select-performance': 'Choix des pages échantillons pour les performances',
      lighthouse: 'Mesure des performances',
      normalize: 'Traitement des résultats',
      'analyze-fr': 'Rédaction du rapport (français)',
      'analyze-en': 'Rédaction du rapport (anglais)',
      'report-fr': 'Génération du PDF (français)',
      'report-en': 'Génération du PDF (anglais)',
      scanning: 'Analyse des sites',
      complete: 'Terminé',
      failed: 'Échoué',
    },
    completeHeading: 'Scan terminé',
    failedHeading: 'Le scan a échoué',
    needsInputHeading: 'En attente de confirmation',
    needsInputNote:
      'Le scan est terminé. Confirmez les champs ci-dessous sur la page de l’audit, puis régénérez le rapport.',
    goToAuditLink: 'Aller à la page de l’audit',
    goToProspectLink: 'Aller au prospect',
    pushbackWarning:
      'Le site limite nos requêtes : {count} pages ont reçu une réponse temporaire ou une page de vérification anti-robot.',
    slowRelaunchLink: 'Relancer plus lentement',
    urlResultsHeading: 'Résultat par site',
    notFound: 'Scan introuvable.',
    notFoundAction: 'Voir les audits',
    stopButton: 'Arrêter le scan',
    confirmStopTitle: 'Arrêter ce scan ?',
    confirmStopBody:
      'L’arrêt prend effet à la fin de la page en cours. Les phases déjà terminées sont conservées et le scan ne reprendra pas.',
    stoppedHeading: 'Scan arrêté',
    cancelledNote: 'Ce scan a été arrêté à la demande de l’opérateur.',
    failedRescanHint:
      'Le site a déjà été exploré et analysé. Ouvrez l’audit pour corriger la cause puis régénérer le rapport : inutile de relancer un scan.',
    coverageGateFieldsLink: 'Régler le délai et la concurrence du scan sur un nouvel audit',
    failureReasons: {
      'site-unreachable':
        'Le site n’a pas pu être atteint dans les conditions de sécurité du scan. Vérifiez l’adresse, le DNS et les règles robots.txt, puis relancez un scan.',
      inventory:
        'Le scan a rencontré une incohérence pendant le rapprochement des pages visitées. Les résultats de ce run ne sont pas validés ; relancez un scan après correction.',
      generic:
        'Le scan n’a pas pu aller au bout. Relancez un scan ou ouvrez les détails techniques pour transmettre l’erreur au support.',
    },
    failureTechnicalDetails: 'Détails techniques',
    newScanLink: 'Lancer un nouveau scan',
    reportFailedHeading: 'Rapport non généré',
    reportFailedStages: {
      writing: 'La rédaction du rapport a échoué.',
      pdf: 'La production des PDF a échoué.',
      unknown: 'La rédaction du rapport ou la production des PDF a échoué.',
    },
  },
  en: {
    title: 'Scan progress',
    description: 'The site visit in stages, page by page.',
    crawlPhaseLabel: 'Reading the site’s pages',
    scanPhaseLabel: 'Analysing pages',
    contentScanPhaseLabel: 'Content and accessibility checks',
    lighthousePhaseLabel: 'Performance measurement',
    contentProgressMessage: 'Content pages checked: {completed}/{target}.',
    performanceSelectionMessage:
      '{target} pages scheduled for content checks. Performance selection in progress.',
    lighthouseProgressMessage:
      '{content} content pages checked. Sample pages measured for performance: {completed}/{target}.',
    etaLabel: 'Estimated time remaining',
    etaRoughSuffix: '(rough estimate)',
    etaFinishingLabel: 'Almost done',
    phaseLabels: {
      queued: 'Queued',
      crawl: 'Reading the site’s pages',
      scan: 'Analysing pages',
      'content-scan': 'Checking content and accessibility',
      'select-performance': 'Choosing the sample pages for performance',
      lighthouse: 'Measuring performance',
      normalize: 'Processing results',
      'analyze-fr': 'Writing the report (French)',
      'analyze-en': 'Writing the report (English)',
      'report-fr': 'Generating the PDF (French)',
      'report-en': 'Generating the PDF (English)',
      scanning: 'Analysing sites',
      complete: 'Complete',
      failed: 'Failed',
    },
    completeHeading: 'Scan complete',
    failedHeading: 'The scan failed',
    needsInputHeading: 'Waiting on confirmation',
    needsInputNote:
      'The scan finished. Confirm the fields below on the audit page, then regenerate the report.',
    goToAuditLink: 'Go to the audit page',
    goToProspectLink: 'Go to the prospect',
    pushbackWarning:
      'The site is limiting our requests: {count} pages returned a transient response or an anti-bot verification page.',
    slowRelaunchLink: 'Relaunch more slowly',
    urlResultsHeading: 'Per-site results',
    notFound: 'Scan not found.',
    notFoundAction: 'View audits',
    stopButton: 'Stop the scan',
    confirmStopTitle: 'Stop this scan?',
    confirmStopBody:
      'The stop takes effect at the end of the current page. Phases already finished are kept and the scan will not resume.',
    stoppedHeading: 'Scan stopped',
    cancelledNote: 'This scan was stopped at the operator’s request.',
    failedRescanHint:
      'The site has already been crawled and analysed. Open the audit to fix the cause and regenerate the report; a new scan is not needed.',
    coverageGateFieldsLink: 'Adjust the crawl delay and scan concurrency on a new audit',
    failureReasons: {
      'site-unreachable':
        'The site could not be reached under the scan’s safety conditions. Check the URL, DNS and robots.txt rules, then start a new scan.',
      inventory:
        'The scan found an inconsistency while reconciling visited pages. This run is not validated; start a new scan after correcting the cause.',
      generic:
        'The scan could not finish. Start a new scan, or open the technical details when passing the error to support.',
    },
    failureTechnicalDetails: 'Technical details',
    newScanLink: 'Start a new scan',
    reportFailedHeading: 'Report not generated',
    reportFailedStages: {
      writing: 'Writing the report failed.',
      pdf: 'Producing the PDFs failed.',
      unknown: 'Writing the report or producing the PDFs failed.',
    },
  },
} satisfies { fr: ProgressStrings; en: ProgressStrings };
