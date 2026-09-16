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
  candidateFailedLabel: string;
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
    candidateFailedLabel: 'Échec de la nouvelle version',
    regenerateButton: 'Réécrire le rapport',
    writeButton: 'Rédiger le rapport',
    writingInProgress:
      'Rédaction en cours (français puis anglais). Cela prend plusieurs minutes ; cette page se met à jour toute seule.',
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
    candidateFailedLabel: 'New version failed',
    regenerateButton: 'Rewrite the report',
    writeButton: 'Write the report',
    writingInProgress:
      'Writing in progress (French, then English). This takes several minutes; this page updates on its own.',
    writingRegeneratedMessage: 'New version written, approved, and PDFs regenerated.',
    writingApprovedPdfsPendingMessage:
      'New version written and approved; PDFs were not regenerated automatically.',
    writingReplacedDeliveredMessage: 'The previously delivered version was replaced.',
  },
} satisfies { fr: PrepareReportStrings; en: PrepareReportStrings };
