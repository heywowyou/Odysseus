export interface PrepareReportStrings {
  title: string;
  description: string;
  customQuestionLabel: string;
  frenchFieldLabel: string;
  englishFieldLabel: string;
  warningsHeading: string;
  warningCommercialName: string;
  previewHeading: string;
  previewAutomaticLabel: string;
  previewCustomLabel: string;
  previewFallbackLabel: string;
  saveButton: string;
  savedMessage: string;
  writingHeading: string;
  selectedWritingLabel: string;
  /** Issue #410: writes both languages again instead of reusing the one
   *  whose pass already succeeded. */
  regenerateBothFreshButton: string;
  regenerateBothFreshHint: string;
  generateEnglishButton: string;
  generateEnglishSuccess: string;
  sanitizationWarningTemplate: string;
  candidateFailedLabel: string;
  /** Issue #409: one rejected attempt. {attempt}, {total}, {guards}. */
  candidateAttemptRejectedTemplate: string;
  regenerateButton: string;
  writeButton: string;
  writingInProgress: string;
  /** Plan 045 section 2.1: regeneration now approves and renders in one
   *  call, replacing the separate "candidate ready for review" toast. */
  writingRegeneratedMessage: string;
  writingApprovedPdfsPendingMessage: string;
  writingReplacedDeliveredMessage: string;
}

export const prepareReport = {
  fr: {
    title: 'Préparer le rapport',
    description:
      'Remplacez si besoin la question affichée en couverture du rapport. Ce texte n’est jamais envoyé à l’outil de rédaction.',
    customQuestionLabel: 'Question affichée en couverture du rapport',
    frenchFieldLabel: 'Français',
    englishFieldLabel: 'Anglais',
    warningsHeading: 'Contexte manquant',
    warningCommercialName: "Le nom commercial n'est pas encore confirmé.",
    previewHeading: 'Aperçu en direct',
    previewAutomaticLabel: 'automatique',
    previewCustomLabel: 'votre texte',
    previewFallbackLabel: 'repli générique',
    saveButton: 'Enregistrer les choix',
    savedMessage: 'Préparation enregistrée.',
    writingHeading: 'Versions de rédaction du rapport',
    selectedWritingLabel: 'Version actuelle',
    regenerateBothFreshButton: 'Réécrire à neuf',
    regenerateBothFreshHint:
      'Réécrit uniquement la version française sans réutiliser une rédaction existante.',
    generateEnglishButton: 'Générer la version anglaise',
    generateEnglishSuccess: 'Version anglaise générée à partir de la même structure.',
    sanitizationWarningTemplate:
      'Rédaction sécurisée automatiquement dans {field} ({code}) : le reste du contenu valide a été conservé.',
    candidateFailedLabel: 'Échec de la nouvelle version',
    candidateAttemptRejectedTemplate: 'Tentative {attempt} sur {total} refusée par : {guards}',
    regenerateButton: 'Réécrire le rapport',
    writeButton: 'Rédiger le rapport',
    writingInProgress:
      'Rédaction du rapport français en cours. Cette page se met à jour toute seule.',
    writingRegeneratedMessage: 'Nouvelle version rédigée, approuvée, et PDF régénérés.',
    writingApprovedPdfsPendingMessage:
      'Nouvelle version rédigée et approuvée ; les PDF n’ont pas été régénérés automatiquement.',
    writingReplacedDeliveredMessage: 'La version précédemment livrée a été remplacée.',
  },
  en: {
    title: 'Prepare report',
    description:
      'Replace the question shown on the report cover if needed. This text is never sent to the writing tool.',
    customQuestionLabel: 'Question shown on the report cover',
    frenchFieldLabel: 'French',
    englishFieldLabel: 'English',
    warningsHeading: 'Missing context',
    warningCommercialName: 'The commercial name is not confirmed yet.',
    previewHeading: 'Live preview',
    previewAutomaticLabel: 'automatic',
    previewCustomLabel: 'your text',
    previewFallbackLabel: 'generic fallback',
    saveButton: 'Save choices',
    savedMessage: 'Preparation saved.',
    writingHeading: 'Report writing versions',
    selectedWritingLabel: 'Current version',
    regenerateBothFreshButton: 'Rewrite fresh',
    regenerateBothFreshHint:
      'Rewrites only the French version without reusing an existing writing pass.',
    generateEnglishButton: 'Generate English version',
    generateEnglishSuccess: 'English version generated from the same structure.',
    sanitizationWarningTemplate:
      'Writing was sanitized automatically in {field} ({code}); unrelated valid content was preserved.',
    candidateFailedLabel: 'New version failed',
    candidateAttemptRejectedTemplate: 'Attempt {attempt} of {total} rejected by: {guards}',
    regenerateButton: 'Rewrite the report',
    writeButton: 'Write the report',
    writingInProgress:
      'French report writing is in progress. This page updates on its own.',
    writingRegeneratedMessage: 'New version written, approved, and PDFs regenerated.',
    writingApprovedPdfsPendingMessage:
      'New version written and approved; PDFs were not regenerated automatically.',
    writingReplacedDeliveredMessage: 'The previously delivered version was replaced.',
  },
} satisfies { fr: PrepareReportStrings; en: PrepareReportStrings };
