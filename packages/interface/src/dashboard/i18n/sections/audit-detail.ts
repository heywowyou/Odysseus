export interface AuditDetailStrings {
  title: string;
  dateLabel: string;
  reportNotOfferedQuickCheck: string;
  reportNotOfferedProspecting: string;
  pagesVisitedLabel: string;
  findingsHeading: string;
  /** Issue #120: a dedicated, bounded observation for the LCEN publisher-
   * identification scanner rule. It opens the existing finding rather
   * than duplicating remediation or making a legal conclusion. */
  publisherIdentificationHeading: string;
  publisherIdentificationObserved: string;
  publisherIdentificationLimit: string;
  publisherIdentificationAction: string;
  severityColumn: string;
  categoryColumn: string;
  titleColumn: string;
  occurrencesColumn: string;
  pagesColumn: string;
  reportsHeading: string;
  noReportsYet: string;
  /** Plan 032 (issue #162): notice on the reports card when the selected
   *  analysis pair came from the audit fallback gate, so the absence of
   *  model-written themes reads as the documented gate behavior, not a
   *  failure. Scoped to what the automated scan detected. */
  analysisStaticFallbackNotice: string;
  reportFreshness: Record<'fresh' | 'stale' | 'unverified', string>;
  /** Plan 050: advisory badge on a report rendered by an older template. */
  reportOlderTemplate: string;
  /** Non-blocking warning on a report row whose measured page count is
   *  above the report package's threshold; {count} is replaced with the
   *  page count by the page. */
  reportPageCountWarning: string;
  lifecycleLabel: string;
  lifecycle: Record<'scanned' | 'analysed' | 'rendered' | 'approved', string>;
  previewReport: string;
  downloadReport: string;
  /** Plan 060 §2.4 + Plan 067: downloading a language is not approval;
   *  approving the selected French report (plus optional attached English)
   *  is its own explicit control. */
  approveReports: string;
  /** Why approval is greyed out while the selected required PDF(s) are not fresh. */
  approveUnavailableReason: string;
  /** Shown when a mutation (save, regenerate, approve) fails. */
  actionError: string;
  manualFieldsHeading: string;
  manualFieldsHint: string;
  /** SIREN expanded on the field's first use on the page (approved IA
   *  vocabulary); later mentions on the same screen stay plain. */
  sirenLabel: string;
  sirenCheckButton: string;
  sirenCheckingMessage: string;
  sirenResolvedPrefix: string;
  sirenNotResolvedMessage: string;
  /** Same copy as newScan's field of the same name, kept per section so
   *  each page's table stays self-contained. */
  sirenInvalidError: string;
  sirenSourceUrlLabel: string;
  raisonSocialeLabel: string;
  nomCommercialLabel: string;
  /** Template: {name}, the linked prospect's name. */
  identitySavedOnProspect: string;
  detectedFieldHint: string;
  /** Plan 045 slice 1.3: the inline Confirm button next to a detected
   *  identity field, used both in the stepper's first step and in
   *  NeedsInputCard on the progress page. */
  identityConfirmButton: string;
  /** Shown once the field is confirmed and no other one still awaits it;
   *  the PDFs are then produced automatically. */
  identityConfirmedGeneratedMessage: string;
  /** Shown once this field is confirmed but another detected identity
   *  field still awaits confirmation, so PDFs were not attempted yet. */
  identityConfirmedWaitingMessage: string;
  sectorLabel: string;
  sectorAutoOption: string;
  sectorGeneralOption: string;
  sectorHospitalityOption: string;
  declarationContactEmailLabel: string;
  transactionalFlowLabel: string;
  transactionalFlowUnspecifiedOption: string;
  transactionalFlowYesOption: string;
  transactionalFlowNoOption: string;
  transactionalFlowReasonLabel: string;
  transactionalFlowReasonPlaceholder: string;
  transactionalFlowReasonRequired: string;
  /** Template: {value}. */
  transactionalFlowDetectedTemplate: string;
  transactionalFlowSavedHint: string;
  regeneratingMessage: string;
  regeneratedMessage: string;
  notFound: string;
  /** Attach/detach controls for an audit's prospect relationship. */
  prospectLink: {
    notLinked: string;
    linkAction: string;
    manualBadge: string;
    unlinkAction: string;
    unlinkConfirm: string;
    dialogTitle: string;
    searchPlaceholder: string;
    searchEmpty: string;
    actionError: string;
  };
  /** Report rows show the language's endonym, never a locale code. */
  languageLabels: Record<'fr' | 'en', string>;
  /** Issue #90: the report-stage failure card. The stored error text is
   *  the pipeline's own English message and is shown as-is; the hint is
   *  the bilingual remediation paired with it, keyed on the typed
   *  failure case (identity confirmation vs any other report-stage
   *  failure). */
  failureHeading: string;
  failureMessageLabel: string;
  failureAwaitingFieldsLabel: string;
  failureHintIdentity: string;
  failureHintReportStage: string;
  /** A failed audit whose lifecycle is still `scanned`: no canonical
   *  French analysis exists, so the failure card points at the Prepare
   *  report card instead of offering a regenerate that always 409s. */
  failureHintAnalysisStage: string;
  failureJobLink: string;
  failureScrollToFields: string;
  /** Plan 040 slice 5: the failure card no longer regenerates itself, it
   *  links to the stepper step to redo, so there is one regenerate
   *  affordance per cause on the page. */
  failureScrollToRedact: string;
  failureScrollToProduce: string;
  /** An audit linked to a prospect manages its preview from that page. */
  previewManagedFromProspect: string;
  /** Plan 045 stage 3.1: the audit report panel. Replaces the plan 040
   *  five-step ladder (audit-report-stepper.tsx, deleted): every row is
   *  always visible, greyed with `disabledReason` copy instead of
   *  disappearing when its action is not available yet. */
  panel: {
    heading: string;
    description: string;
    doneLabel: string;
    findingsFreshLabel: string;
    findingsStaleLabel: string;
    identityHeading: string;
    writingHeading: string;
    produceHeading: string;
    deliveryHeading: string;
    /** The preparation view (report-details-form.tsx) could not be
     *  loaded (never created, or a failed request). */
    preparationUnavailable: string;
    /** Issue #376: the persistent production status and the busy labels
     *  that replace conflicting actions while a stage runs. */
    production: {
      heading: string;
      steps: { confirmed: string; writing: string; pdf: string; ready: string };
      writingTitle: string;
      writingDescription: string;
      pdfTitle: string;
      pdfDescription: string;
      readyTitle: string;
      readyDescription: string;
      failedTitle: string;
      failedWritingDescription: string;
      failedPdfDescription: string;
      writingBusyLabel: string;
      pdfBusyLabel: string;
    };
    /** The produce action's button. */
    produceButton: string;
    /** Plan 045 slice 1.2: the button label when findings will be
     *  refreshed before the PDFs render (AuditDetailResponse.findingsStale). */
    produceButtonRefreshFirst: string;
    /** Explains produceButtonRefreshFirst's label under the button. */
    produceRefreshFirstHint: string;
    /** Persistent failure block after "regenerate the PDFs" is refused. */
    produceFailedHeading: string;
    /** {page} and {amount}: the print gate found content outside the
     *  printable area of that page. */
    produceFailedOverflow: string;
    produceFailedOverflowFinding: string;
    /** {section}: the report section heading the overflowing box sits in. */
    produceFailedOverflowSection: string;
    produceFailedOverflowBlock: string;
    /** A different layout-safety refusal from the PDF renderer. */
    produceFailedStaleData: string;
    produceFailedIdentity: string;
    produceFailedLayout: string;
    produceFailedGeneric: string;
    produceFailedTechnicalLabel: string;
    produceFailedDismiss: string;
    /** Why the produce action is greyed: no canonical French writing
     *  resolves yet (AuditDetailResponse.analysisPair === 'none'). */
    produceUnavailableReason: string;
    /** Why the delivery action is greyed: no fresh selected report yet. */
    deliveryUnavailableReason: string;
    /** Summary label of the collapsed "Report details (optional)"
     *  disclosure (report-details-form.tsx). */
    reportDetailsSummary: string;
  };
  /** Plan 059 step 37: the evidence-quality card. The graph's verdict and
   *  approval state, then the contract's stages with counts and states
   *  only — never raw evidence. Blocking reason codes are stable API
   *  strings: `blockingReasons` maps the known codes to one sentence and an
   *  unknown code falls back to `unknownBlockingReason` carrying the raw
   *  code, deliberately untranslated. */
  evidenceQuality: {
    heading: string;
    description: string;
    verdictLabel: string;
    verdicts: Record<
      | 'reportable-complete'
      | 'reportable-with-known-limitations'
      | 'needs-operator-review'
      | 'failed',
      string
    >;
    approvalLabel: string;
    approvalStates: Record<'approved' | 'stale' | 'missing', string>;
    stagesHeading: string;
    stageStates: Record<'complete' | 'partial' | 'blocked', string>;
    stageNames: Record<
      | 'scope-network-safety'
      | 'inventory-discovery'
      | 'content-acquisition'
      | 'surface-discovery'
      | 'inventory-reconciliation'
      | 'content-evidence-repair'
      | 'performance-verification'
      | 'temporal-coherence'
      | 'raw-evidence-snapshot'
      | 'normalization-verification'
      | 'evidence-approved',
      string
    >;
    /** Shown on the performance stage while the calibration tolerances are
     *  not empirically established yet (plan 059 step 41 pending). */
    performanceCalibrationNote: string;
    /** {count} templates for the per-stage counts. */
    countPagesVisited: string;
    countFindings: string;
    countDisclosures: string;
    blockingHeading: string;
    noBlockingReasons: string;
    /** {count} is the number of evidence references behind one reason. */
    blockingRefCount: string;
    /** One sentence per stable blocking issue code of the quality
     *  assessment; an unknown code renders via unknownBlockingReason. */
    blockingReasons: Record<string, string>;
    /** {code} is the raw stable code. */
    unknownBlockingReason: string;
    /** Stage "evidence approved" when the graph was assessed unapproved. */
    approvalMissingNote: string;
    /** Stage "evidence approved" when the approval no longer matches. */
    approvalStaleNote: string;
    /** Plan 058 bundle box: approval state blocks promotion. */
    promotionBlockedUnapproved: string;
    promotionBlockedChanged: string;
  };
  /** Issue: operator-reviewed overall grade override. Shown as its own
   *  section of the report panel: the automatic grade the report would
   *  render, and, when the operator has overridden it, the override's
   *  grade and reason alongside a way to save a new one or clear it. */
  gradeOverride: {
    heading: string;
    description: string;
    automaticGradeLabel: string;
    /** {grade} is replaced with the override's letter, {reason} with its
     *  saved reason. */
    overrideActiveLabel: string;
    overrideReasonLabel: string;
    overrideReviewedAtLabel: string;
    editButton: string;
    clearButton: string;
    cancelButton: string;
    saveButton: string;
    gradeFieldLabel: string;
    reasonFieldLabel: string;
    reasonPlaceholder: string;
    reasonRequiredError: string;
    saveError: string;
    clearError: string;
    saveSuccess: string;
    clearSuccess: string;
  };
  /** Issue #91: a report row whose PDF bytes this machine cannot serve.
   *  The freshness badge is replaced by one of these two states: the
   *  document exists but is out of reach, or no usable document exists
   *  for that language. Both offer the regenerate action. */
  reportPdfUnavailableBadge: string;
  reportPdfUnavailableNote: string;
  reportPdfMissingNote: string;
  /** Toast headline when a report fetch still fails; the server's error
   *  string is demoted to the description line. */
  reportUnavailableError: string;
  /** Issue #93: the findings row expansion. Pages and occurrences are
   *  real data from the stored finding; the gloss and remediation lines
   *  render only when the API supplied reviewed copy for that rule. */
  findingDetailsToggle: string;
  /** Issue #392: badge on a finding confined to third-party markup;
   *  `{vendor}` is the named vendor when known. */
  thirdPartyBadge: string;
  thirdPartyVendorBadge: string;
  thirdPartyBadgeHint: string;
  /** `{count}` of the severity's findings are third-party. */
  thirdPartyShare: string;
  findingGlossLabel: string;
  findingRemediationLabel: string;
  findingElementsLabel: string;
  /** {count} is replaced with the number of further pages by the page. */
  findingMorePages: string;
  /** {count} is replaced with the number of further occurrences by the
   *  page. */
  findingMoreElements: string;
  /** Default option of the findings severity filter. */
  findingsFilterAll: string;
  /** Expands the findings table; {count} is the number of hidden rows. */
  findingsShowMore: string;
  /** Collapses the findings table back to its six-row preview. */
  findingsShowLess: string;
  /** Shown when the findings table has no rows, overall or at the
   *  selected severity. */
  findingsEmpty: string;
  /** Localized names of the finding categories; an unknown category
   *  falls back to its raw code. */
  categoryLabels: Record<
    'accessibility' | 'seo' | 'geo' | 'performance' | 'rendering' | 'privacy',
    string
  >;
  /** The scorecard card of an audit with no linked prospect (a
   *  prospect-linked audit shows only the one-line link to the hub).
   *  Named "Aperçu" / "Preview" per the approved IA vocabulary.
   *  refusalReasons maps each of the server's stable refusal codes to one
   *  short sentence; an unknown code falls back to
   *  unavailableWithReason carrying the raw code, deliberately
   *  untranslated. */
  outreachPreview: {
    title: string;
    description: string;
    viewScorecard: string;
    hideScorecard: string;
    regenerateScorecard: string;
    downloadPdf: string;
    unavailableWithReason: string;
    /** One sentence per stable refusal code the audit page can surface:
     *  the store's outreach audit refusals, the v2 publish additions,
     *  the publish-only not-an-outreach-audit code, and the draft
     *  route's preview codes. */
    refusalReasons: Record<string, string>;
    renderError: string;
    publishAction: string;
    reissueAction: string;
    linkOnceTitle: string;
    linkOnceWarning: string;
    linkCopy: string;
    linkCopied: string;
    revokedMessage: string;
    draftCreatedMessage: string;
    draftRefusedMessage: string;
    actionError: string;
  };
}

export const auditDetail = {
  fr: {
    title: 'Détail de l’audit',
    dateLabel: 'Date',
    reportNotOfferedQuickCheck:
      'Contrôle rapide : il sert à trier les prospects et ne couvre pas assez le site pour un rapport client. Lancez un scan complet pour préparer un rapport.',
    reportNotOfferedProspecting:
      'Ancien scan de prospection : il alimente l’aperçu et les emails. Lancez un scan complet pour préparer un rapport client.',
    pagesVisitedLabel: 'Pages visitées',
    findingsHeading: 'Constats',
    publisherIdentificationHeading: 'Vérifier les informations d’identification du site',
    publisherIdentificationObserved:
      'Le scan n’a trouvé aucun numéro SIREN, RCS ou de TVA publié sur les pages de ce site qu’il a visitées.',
    publisherIdentificationLimit:
      'Cette observation concerne uniquement les pages visitées et ne conclut pas sur la situation de l’entreprise.',
    publisherIdentificationAction: 'Voir le constat et la piste de correction',
    severityColumn: 'Gravité',
    categoryColumn: 'Catégorie',
    titleColumn: 'Problème',
    occurrencesColumn: 'Fois détecté',
    pagesColumn: 'Pages concernées',
    reportsHeading: 'Rapports',
    noReportsYet: 'Aucun rapport généré pour le moment.',
    analysisStaticFallbackNotice:
      'Ce rapport a été rédigé à partir des seuls constats du scan. L’analyse rédigée automatiquement n’a pas été lancée, l’audit n’ayant détecté aucun problème critique ou grave et moins de cinq problèmes de gravité modérée.',
    reportFreshness: { fresh: 'À jour', stale: 'À régénérer', unverified: 'Non vérifié' },
    reportOlderTemplate: 'Modèle de rapport antérieur',
    reportPageCountWarning: 'Rapport long : {count} pages. Il reste complet et livrable.',
    lifecycleLabel: 'Étape',
    lifecycle: {
      scanned: 'Exploré',
      analysed: 'Analysé',
      rendered: 'Rapport prêt',
      approved: 'Approuvé',
    },
    previewReport: 'Prévisualiser',
    downloadReport: 'Télécharger le PDF',
    approveReports: 'Approuver le rapport',
    approveUnavailableReason:
      'L’approbation demande un PDF français à jour et vérifié. Si une version anglaise est rattachée, elle doit également être à jour et vérifiée. Utilisez « Régénérer les PDF ».',
    actionError: 'L’action a échoué. Réessayez.',
    manualFieldsHeading: 'Informations sur l’hôtel',
    manualFieldsHint: 'Champs optionnels, modifiables à tout moment sans relancer le scan.',
    sirenLabel: 'SIREN (numéro d’entreprise)',
    sirenCheckButton: 'Vérifier',
    sirenCheckingMessage: 'Vérification en cours…',
    sirenResolvedPrefix: 'Entreprise identifiée :',
    sirenNotResolvedMessage: 'Ce SIREN n’a pas pu être confirmé auprès du répertoire Sirene.',
    sirenInvalidError: 'Ce SIREN n’est pas valide (il échoue au contrôle officiel de l’INSEE).',
    sirenSourceUrlLabel: 'Page où le SIREN est affiché',
    raisonSocialeLabel: 'Dénomination sociale',
    detectedFieldHint: 'Détecté automatiquement, à confirmer.',
    nomCommercialLabel: 'Nom commercial',
    identitySavedOnProspect:
      'La raison sociale, le nom commercial et le SIREN sont enregistrés sur le prospect « {name} » et s’appliquent à tous ses audits.',
    identityConfirmButton: 'Confirmer',
    identityConfirmedGeneratedMessage: 'Confirmé ; les PDF sont produits.',
    identityConfirmedWaitingMessage:
      'Confirmé ; en attente de la confirmation de l’autre champ avant de produire les PDF.',
    sectorLabel: 'Secteur',
    sectorAutoOption: 'Détecté automatiquement',
    sectorGeneralOption: 'Général',
    sectorHospitalityOption: 'Hôtellerie-restauration',
    declarationContactEmailLabel: 'Email de contact pour la déclaration d’accessibilité',
    transactionalFlowLabel: 'Réservation ou vente en ligne directe',
    transactionalFlowUnspecifiedOption: 'Ne pas corriger le résultat du scan',
    transactionalFlowYesOption: 'Oui, un parcours est présent',
    transactionalFlowNoOption: 'Non, aucun parcours n’est présent',
    transactionalFlowReasonLabel: 'Justification de la correction',
    transactionalFlowReasonPlaceholder: 'Ex. moteur de réservation vérifié dans l’en-tête du site',
    transactionalFlowReasonRequired: 'Indiquez la justification de cette correction.',
    transactionalFlowDetectedTemplate: 'Résultat du scan : {value}',
    transactionalFlowSavedHint:
      'Après enregistrement, régénérez la rédaction dans « Préparer le rapport » avant de générer le PDF.',
    regeneratingMessage: 'Régénération en cours…',
    regeneratedMessage: 'Rapport régénéré.',
    notFound: 'Audit introuvable.',
    prospectLink: {
      notLinked: 'Non lié à un prospect',
      linkAction: 'Lier à un prospect',
      manualBadge: 'Lié manuellement',
      unlinkAction: 'Délier',
      unlinkConfirm: 'Délier cet audit du prospect ?',
      dialogTitle: 'Lier à un prospect',
      searchPlaceholder: 'Rechercher par nom ou domaine…',
      searchEmpty: 'Aucun prospect correspondant.',
      actionError: 'Impossible de mettre à jour le lien',
    },
    languageLabels: { fr: 'Français', en: 'English' },
    failureHeading: 'Le rapport n’a pas pu être généré',
    failureMessageLabel: 'Message renvoyé par la génération',
    failureAwaitingFieldsLabel: 'Champs en attente de confirmation',
    failureHintIdentity:
      'Le scan est terminé : confirmez ou corrigez les champs ci-dessus dans la carte « Informations sur l’hôtel », puis régénérez le rapport. Inutile de relancer un scan.',
    failureHintReportStage:
      'Le site a déjà été exploré et analysé : corrigez la cause puis régénérez le rapport depuis cette page. Inutile de relancer un scan.',
    failureHintAnalysisStage:
      'Le scan est terminé, mais aucune analyse française n’a encore été enregistrée : il n’y a donc aucun rapport à régénérer. Lancez la rédaction à l’étape « Rédiger » ci-dessous, puis approuvez le candidat.',
    failureJobLink: 'Voir le détail du scan',
    failureScrollToFields: 'Aller aux champs à confirmer',
    failureScrollToRedact: 'Aller à Rédiger le rapport',
    failureScrollToProduce: 'Aller à Produire les PDF',
    previewManagedFromProspect: 'Aperçu géré depuis la fiche du prospect',
    reportPdfUnavailableBadge: 'PDF non disponible ici',
    reportPdfUnavailableNote:
      'Ce PDF a été généré sur une autre machine et n’est pas accessible depuis celle-ci. Régénérez le rapport pour l’obtenir ici.',
    reportPdfMissingNote:
      'Aucun PDF exploitable pour cette langue. Régénérez le rapport pour le créer.',
    reportUnavailableError:
      'Ce PDF n’est pas disponible depuis cette machine. Régénérez le rapport, puis réessayez.',
    findingDetailsToggle: 'Afficher le détail du constat',
    thirdPartyBadge: 'Tiers',
    thirdPartyVendorBadge: 'Tiers · {vendor}',
    thirdPartyBadgeHint:
      'Constat situé entièrement dans un contenu tiers intégré ; le site ne peut pas le corriger directement.',
    thirdPartyShare: 'dont {count} tiers',
    findingGlossLabel: 'De quoi il s’agit',
    findingRemediationLabel: 'Piste de correction',
    findingElementsLabel: 'Éléments concernés',
    findingMorePages: '+ {count} autres pages',
    findingMoreElements: '+ {count} autres occurrences',
    findingsFilterAll: 'Toutes les gravités',
    findingsShowMore: 'Afficher les {count} autres constats',
    findingsShowLess: 'Réduire à 6 constats',
    findingsEmpty: 'Aucun problème constaté pour cet audit.',
    categoryLabels: {
      accessibility: 'Accessibilité',
      seo: 'SEO',
      geo: 'Visibilité IA',
      performance: 'Performance',
      rendering: 'Rendu',
      privacy: 'Vie privée',
    },
    outreachPreview: {
      title: 'Aperçu',
      description: 'Consulter la synthèse construite à partir de cet audit.',
      viewScorecard: 'Afficher l’aperçu',
      hideScorecard: 'Masquer l’aperçu',
      regenerateScorecard: 'Régénérer l’aperçu',
      downloadPdf: 'Télécharger le PDF',
      unavailableWithReason: 'Aperçu indisponible ({refusal}).',
      refusalReasons: {
        'candidate-unknown': 'Ce prospect est inconnu.',
        'no-audit': 'Aucun scan complet n’est terminé pour ce prospect.',
        'audit-in-flight': 'L’analyse complète de prospection de ce prospect est encore en cours.',
        'audit-failed': 'La dernière analyse complète de prospection a échoué ou a été arrêtée.',
        'preview-already-live': 'un aperçu est déjà en ligne ; retirez-le pour en publier un autre',
        'domain-mismatch': 'L’audit enregistré ne correspond pas au domaine propre de ce prospect.',
        suppressed: 'Ce domaine figure sur la liste à ne pas contacter.',
        'address-suppressed': 'Cette adresse figure sur la liste à ne pas contacter.',
        'coverage-incomplete':
          'L’exploration du site est incomplète : la synthèse refuse d’inventer des chiffres.',
        'report-not-ready':
          'Les rapports client de cet audit ne sont pas prêts : régénérez le rapport avant de publier l’aperçu ou de rédiger le premier email.',
        'insufficient-safe-cards':
          'Pas assez de constats vérifiés pour construire une synthèse fiable.',
        'not-an-outreach-audit': 'Cet audit n’est pas lié à un prospect de la campagne.',
        'preview-not-published': 'Aucun aperçu publié ne correspond : publiez d’abord l’aperçu.',
        'preview-revoked': 'Le lien publié a été retiré : réémettez un lien depuis cet audit.',
        'preview-expired': 'Le lien publié a expiré : réémettez un lien depuis cet audit.',
        'preview-wrong-audit':
          'Le lien publié correspond à un autre audit : réémettez un lien depuis cet audit.',
        'no-usable-contact':
          'Aucune adresse de contact utilisable n’a été trouvée pour cet établissement.',
        'evidence-incomplete':
          'Les preuves nécessaires pour rédiger cet email ne sont pas complètes.',
        'evidence-schema-outdated':
          'Le format des preuves enregistrées est obsolète : relancez une analyse pour cet établissement.',
        'prescan-expired':
          'L’analyse préliminaire a expiré : relancez-en une avant de rédiger un email.',
        'no-distinct-second-observation':
          'Un seul constat exploitable a été trouvé ; l’email en nécessite deux distincts.',
        'observation-not-in-allowlist':
          'Aucun des constats enregistrés ne fait partie de ceux que l’email peut citer.',
        'thread-closed': 'Le fil de prospection de cet établissement est déjà clos.',
        'draft-already-live': 'Un brouillon existe déjà pour cet établissement.',
        'suppressed-before-generation': 'Ce domaine figure sur la liste à ne pas contacter.',
        'suppressed-before-provider':
          'Ce domaine a été ajouté à la liste à ne pas contacter avant l’envoi ; rien n’a été transmis.',
        'assembly-refused': 'L’email n’a pas pu être composé à partir des preuves disponibles.',
        'provider-draft-unrecorded':
          'L’envoi au fournisseur n’a pas pu être confirmé ; vérifiez manuellement avant de réessayer.',
        'no-mailbox-configured':
          'La boîte mail d’envoi n’est pas configurée sur ce serveur ; l’aperçu a tout de même été publié, copiez le lien ci-dessus.',
      },
      renderError: 'Impossible de générer l’aperçu.',
      publishAction: 'Publier l’aperçu',
      reissueAction: 'Réémettre un lien',
      linkOnceTitle: 'Conservez ce lien maintenant',
      linkOnceWarning:
        'Par confidentialité, ce lien n’est affiché qu’une seule fois et Odysseus ne le conserve jamais. Copiez-le dans un endroit sûr ; il ne pourra plus être affiché.',
      linkCopy: 'Copier le lien',
      linkCopied: 'Copié',
      revokedMessage: 'Aperçu retiré.',
      draftCreatedMessage: 'Brouillon créé : relisez-le dans la section Emails de cette fiche.',
      draftRefusedMessage: 'Rien n’a été rédigé ; l’orchestrateur a refusé cette action.',
      actionError: 'Impossible de terminer cette action.',
    },
    panel: {
      heading: 'Rapport client',
      description:
        'Chaque action reste visible : elle est grisée avec sa raison quand elle n’est pas encore disponible.',
      doneLabel: 'Fait',
      findingsFreshLabel: 'Constats à jour',
      findingsStaleLabel: 'Constats non à jour',
      identityHeading: 'Confirmer l’identité du client',
      writingHeading: 'Rédiger le rapport',
      produceHeading: 'Produire les PDF',
      deliveryHeading: 'Approuver et livrer',
      preparationUnavailable: 'La préparation n’est pas disponible pour cet audit.',
      production: {
        heading: 'Production du rapport',
        steps: {
          confirmed: 'Données confirmées',
          writing: 'Rédaction',
          pdf: 'Génération des PDF',
          ready: 'Prêt',
        },
        writingTitle: 'Rédaction du rapport…',
        writingDescription: 'Rédaction du texte du rapport et des recommandations.',
        pdfTitle: 'Génération des PDF…',
        pdfDescription: 'Le contenu du rapport est prêt. Création des PDF finaux.',
        readyTitle: 'Rapport prêt',
        readyDescription: 'Les PDF ont été générés.',
        failedTitle: 'La production du rapport a échoué',
        failedWritingDescription:
          'La rédaction n’a pas abouti. Relancez la rédaction pour réessayer.',
        failedPdfDescription:
          'La génération des PDF n’a pas abouti. Relancez la génération des PDF pour réessayer.',
        writingBusyLabel: 'Rédaction du rapport…',
        pdfBusyLabel: 'Génération des PDF…',
      },
      produceButton: 'Régénérer les PDF',
      produceButtonRefreshFirst: 'Actualiser les constats puis régénérer les PDF',
      produceFailedHeading: 'Les PDF n’ont pas pu être produits',
      produceFailedOverflow:
        'Un contenu de la page {page} sort de la zone imprimable (dépassement de {amount} px). Deux causes sont connues : un bloc que la mise en page n’a pas pu couper entre deux pages, ou un texte très long sans espace (adresse, sélecteur, URL). Aucun PDF n’a été livré.',
      produceFailedOverflowFinding: 'Constat en cause : {finding}.',
      produceFailedOverflowSection: 'Section en cause : « {section} ».',
      produceFailedOverflowBlock: 'Passage en cause : « {excerpt} ».',
      produceFailedStaleData:
        'Le format des données du scan a changé depuis la rédaction. Relancez la production : les constats et la rédaction sont d’abord actualisés. Aucun PDF n’a été livré.',
      produceFailedIdentity:
        'Le nom du client sur la couverture est encore une détection non confirmée. Confirmez-le ci-dessus, puis produisez les PDF. Aucun PDF n’a été livré.',
      produceFailedLayout:
        'La mise en page du rapport a échoué au contrôle de sécurité d’impression. Aucun PDF n’a été livré.',
      produceFailedGeneric: 'La production des PDF a été refusée. Aucun PDF n’a été livré.',
      produceFailedTechnicalLabel: 'Détail technique',
      produceFailedDismiss: 'Masquer',
      produceRefreshFirstHint:
        'Les constats de cet audit ne sont plus à jour ; ils seront actualisés avant que les PDF ne soient produits.',
      produceUnavailableReason:
        'Aucune rédaction française n’est encore disponible : rédigez le rapport ci-dessus avant de produire le PDF.',
      deliveryUnavailableReason:
        'Aucun rapport à jour n’est encore disponible pour l’approbation et le téléchargement.',
      reportDetailsSummary: 'Détails du rapport (optionnel)',
    },
    evidenceQuality: {
      heading: 'Qualité de la preuve',
      description:
        'Ce que l’analyse complète a réellement vérifié, étape par étape, avant toute approbation.',
      verdictLabel: 'Évaluation',
      verdicts: {
        'reportable-complete': 'Preuve complète',
        'reportable-with-known-limitations': 'Preuve exploitable, limites connues',
        'needs-operator-review': 'Révision opérateur requise',
        failed: 'Preuve non approuvable',
      },
      approvalLabel: 'Approbation',
      approvalStates: {
        approved: 'Approuvée',
        missing: 'Non approuvée',
        stale: 'Ne correspond plus',
      },
      stagesHeading: 'Étapes de la preuve',
      stageStates: { complete: 'Terminée', partial: 'Partielle', blocked: 'Bloquée' },
      stageNames: {
        'scope-network-safety': 'Périmètre et sécurité réseau',
        'inventory-discovery': 'Découverte de l’inventaire',
        'content-acquisition': 'Acquisition du contenu',
        'surface-discovery': 'Découverte des surfaces',
        'inventory-reconciliation': 'Réconciliation de l’inventaire',
        'content-evidence-repair': 'Réparation des preuves de contenu',
        'performance-verification': 'Vérification des performances',
        'temporal-coherence': 'Cohérence temporelle',
        'raw-evidence-snapshot': 'Instantané des preuves brutes',
        'normalization-verification': 'Vérification de la normalisation',
        'evidence-approved': 'Preuve approuvée',
      },
      performanceCalibrationNote:
        'Les tolérances de calibration ne sont pas encore établies : les valeurs chiffrées restent provisoires.',
      countPagesVisited: '{count} pages visitées',
      countFindings: '{count} constats enregistrés',
      countDisclosures: '{count} divulgations obligatoires',
      blockingHeading: 'Raisons de blocage',
      noBlockingReasons: 'Aucun blocage relevé.',
      blockingRefCount: '{count} références',
      blockingReasons: {
        'raw-evidence-invalid':
          'Des artefacts enregistrés n’appartiennent pas à un périmètre et à une époque de preuve cohérents.',
        'inventory-unreconciled':
          'Des pages connues n’ont pas de disposition finale dans l’inventaire.',
        'unresolved-material-gap':
          'Des vérifications importantes n’ont aucune preuve acceptée après la récupération.',
        'unstable-material-result':
          'Des observations répétées d’une même vérification se contredisent.',
        'temporal-drift':
          'Le site a changé pendant l’audit : les preuves ne peuvent pas être rattachées à une seule version du site.',
        'temporal-coherence-unverified':
          'L’audit ne peut pas démontrer que toutes ses preuves proviennent d’une même version du site.',
        'disclosed-scope-limitation':
          'Une limite du périmètre est documentée et sera divulguée dans le rapport.',
        'performance-confidence-insufficient':
          'Les mesures de performance retenues n’atteignent pas la politique de stabilité et de confiance.',
        'capability-gap-undisclosed':
          'Un contenu intégré important n’a pas pu être inspecté par l’analyse.',
        'site-level-unknown': 'Une vérification au niveau du site n’a aucune preuve acceptée.',
        'robots-policy-unresolved':
          'Aucun instantané de la politique robots n’a été enregistré pour cet audit.',
        'network-safety-preflight-failed': 'Le contrôle préalable de sécurité réseau a échoué.',
        'environment-unapproved':
          'Le navigateur a fonctionné sans bac à sable ni profil d’isolation approuvé : l’environnement d’exécution n’est pas approuvé.',
        'consistency-gate-failed':
          'Des constats normalisés ne se raccordent pas à une preuve de scan acceptée.',
        'operator-resolution-required':
          'Le site a limité ou bloqué le robot : une décision d’opérationnaire (ralentissement, liste autorisée) est nécessaire.',
        'legacy-evidence-insufficient':
          'La preuve héritée est insuffisante pour ce chemin de rapport.',
      },
      unknownBlockingReason: 'Raison de blocage inconnue ({code}).',
      approvalMissingNote:
        'La preuve a été évaluée sans être approuvée : le chemin de rapport client refusera cet audit tant que l’approbation manque.',
      approvalStaleNote:
        'L’approbation ne correspond plus aux racines de la preuve : une nouvelle analyse est nécessaire pour réapprouver.',
      promotionBlockedUnapproved:
        'La preuve de cet audit a été évaluée sans être approuvée : la promotion de ce bundle reste bloquée.',
      promotionBlockedChanged:
        'L’approbation de la preuve dont ce bundle dépend n’est plus en vigueur : relancez le pipeline qualité.',
    },
    gradeOverride: {
      heading: 'Note globale',
      description:
        'La note calculée automatiquement à partir des constats, révisable par un opérateur sans être remplacée.',
      automaticGradeLabel: 'Note automatique',
      overrideActiveLabel: 'Note révisée : {grade}',
      overrideReasonLabel: 'Motif',
      overrideReviewedAtLabel: 'Révisée le',
      editButton: 'Réviser la note',
      clearButton: 'Retirer la révision',
      cancelButton: 'Annuler',
      saveButton: 'Enregistrer',
      gradeFieldLabel: 'Note',
      reasonFieldLabel: 'Motif de la révision',
      reasonPlaceholder: 'Pourquoi cette note diffère-t-elle de la note automatique ?',
      reasonRequiredError: 'Le motif est obligatoire.',
      saveError: 'Impossible d’enregistrer la révision.',
      clearError: 'Impossible de retirer la révision.',
      saveSuccess: 'Note révisée enregistrée.',
      clearSuccess: 'Révision retirée ; la note automatique s’applique de nouveau.',
    },
  },
  en: {
    title: 'Audit detail',
    dateLabel: 'Date',
    reportNotOfferedQuickCheck:
      'Quick check: it sorts prospects and does not cover enough of the site for a client report. Run a full scan to prepare a report.',
    reportNotOfferedProspecting:
      'Older outreach scan: it feeds the preview and the emails. Run a full scan to prepare a client report.',
    pagesVisitedLabel: 'Pages visited',
    findingsHeading: 'Problems found',
    publisherIdentificationHeading: 'Review website identification details',
    publisherIdentificationObserved:
      'The scan found no SIREN, RCS or VAT number published on the pages of this site it visited.',
    publisherIdentificationLimit:
      'This observation concerns only the pages visited and does not conclude on the business’s situation.',
    publisherIdentificationAction: 'View the finding and remediation',
    severityColumn: 'Severity',
    categoryColumn: 'Category',
    titleColumn: 'Problem',
    occurrencesColumn: 'Times found',
    pagesColumn: 'Affected pages',
    reportsHeading: 'Reports',
    noReportsYet: 'No report generated yet.',
    analysisStaticFallbackNotice:
      'This report was written from the scan findings alone. The model-written analysis did not run, because the audit found no critical or serious issue and fewer than five moderate ones.',
    reportFreshness: { fresh: 'Fresh', stale: 'Out of date', unverified: 'Unverified' },
    reportOlderTemplate: 'Older report template',
    reportPageCountWarning: 'Long report: {count} pages. It remains complete and deliverable.',
    lifecycleLabel: 'Stage',
    lifecycle: {
      scanned: 'Scanned',
      analysed: 'Analysed',
      rendered: 'Report ready',
      approved: 'Approved',
    },
    previewReport: 'Preview',
    downloadReport: 'Download the PDF',
    approveReports: 'Approve report',
    approveUnavailableReason:
      'Approval needs a fresh, verified French PDF. If an English version is attached, it must also be fresh and verified. Use “Regenerate the PDFs”.',
    actionError: 'The action failed. Try again.',
    manualFieldsHeading: 'Hotel details',
    manualFieldsHint: 'Optional fields, editable at any time without rerunning the scan.',
    sirenLabel: 'SIREN (French company number)',
    sirenCheckButton: 'Check',
    sirenCheckingMessage: 'Checking…',
    sirenResolvedPrefix: 'Company identified:',
    sirenNotResolvedMessage: 'This SIREN could not be confirmed against the Sirene register.',
    sirenInvalidError: 'This SIREN number is not valid (it fails the official INSEE check).',
    sirenSourceUrlLabel: 'Page where the SIREN is displayed',
    raisonSocialeLabel: 'Legal name',
    detectedFieldHint: 'Detected automatically, to be confirmed.',
    nomCommercialLabel: 'Trading name',
    identitySavedOnProspect:
      'Legal name, trading name and SIREN are saved on the prospect "{name}" and apply to all its audits.',
    identityConfirmButton: 'Confirm',
    identityConfirmedGeneratedMessage: 'Confirmed; the PDFs are being produced.',
    identityConfirmedWaitingMessage:
      'Confirmed; waiting on the other field to be confirmed before producing the PDFs.',
    sectorLabel: 'Sector',
    sectorAutoOption: 'Detected automatically',
    sectorGeneralOption: 'General',
    sectorHospitalityOption: 'Hospitality and catering',
    declarationContactEmailLabel: 'Contact email for the accessibility declaration',
    transactionalFlowLabel: 'Direct online booking or sales',
    transactionalFlowUnspecifiedOption: 'Do not correct the scan result',
    transactionalFlowYesOption: 'Yes, a flow is present',
    transactionalFlowNoOption: 'No, no flow is present',
    transactionalFlowReasonLabel: 'Reason for the correction',
    transactionalFlowReasonPlaceholder: 'For example, booking engine verified in the site header',
    transactionalFlowReasonRequired: 'Provide a reason for this correction.',
    transactionalFlowDetectedTemplate: 'Scan result: {value}',
    transactionalFlowSavedHint:
      'After saving, regenerate the writing in “Prepare report” before generating the PDF.',
    regeneratingMessage: 'Regeneration in progress…',
    regeneratedMessage: 'Report regenerated.',
    notFound: 'Audit not found.',
    prospectLink: {
      notLinked: 'Not linked to a prospect',
      linkAction: 'Link to prospect',
      manualBadge: 'Manually linked',
      unlinkAction: 'Unlink',
      unlinkConfirm: 'Unlink this audit from the prospect?',
      dialogTitle: 'Link to prospect',
      searchPlaceholder: 'Search by name or domain…',
      searchEmpty: 'No matching prospect.',
      actionError: 'Could not update the link',
    },
    languageLabels: { fr: 'Français', en: 'English' },
    failureHeading: 'The report could not be generated',
    failureMessageLabel: 'Message from the generation step',
    failureAwaitingFieldsLabel: 'Fields waiting for confirmation',
    failureHintIdentity:
      'The scan itself finished: confirm or correct the fields above in the “Hotel details” card, then regenerate the report. A new scan is not needed.',
    failureHintReportStage:
      'The site has already been crawled and analysed: fix the cause and regenerate the report from this page. A new scan is not needed.',
    failureHintAnalysisStage:
      'The scan finished, but no French analysis was stored yet, so there is no report to regenerate. Run the writing in the “Write” step below, then approve the candidate.',
    failureJobLink: 'View scan details',
    failureScrollToFields: 'Go to the fields to confirm',
    failureScrollToRedact: 'Go to Write the report',
    failureScrollToProduce: 'Go to Produce the PDFs',
    previewManagedFromProspect: 'Preview managed from the prospect page',
    reportPdfUnavailableBadge: 'PDF not available here',
    reportPdfUnavailableNote:
      'This PDF was generated on another machine and is not reachable from this one. Regenerate the report to obtain it here.',
    reportPdfMissingNote:
      'No usable PDF exists for this language. Regenerate the report to create it.',
    reportUnavailableError:
      'This PDF is not available from this machine. Regenerate the report, then try again.',
    findingDetailsToggle: 'Show the finding details',
    thirdPartyBadge: 'Third party',
    thirdPartyVendorBadge: 'Third party · {vendor}',
    thirdPartyBadgeHint:
      'This finding sits entirely inside embedded third-party content; the site cannot fix it directly.',
    thirdPartyShare: '{count} third-party',
    findingGlossLabel: 'What this means',
    findingRemediationLabel: 'How to fix it',
    findingElementsLabel: 'Affected elements',
    findingMorePages: '+ {count} more pages',
    findingMoreElements: '+ {count} more occurrences',
    findingsFilterAll: 'All severities',
    findingsShowMore: 'Show {count} more findings',
    findingsShowLess: 'Collapse to 6 findings',
    findingsEmpty: 'No problems found for this audit.',
    categoryLabels: {
      accessibility: 'Accessibility',
      seo: 'SEO',
      geo: 'AI visibility',
      performance: 'Performance',
      rendering: 'Rendering',
      privacy: 'Privacy',
    },
    outreachPreview: {
      title: 'Preview',
      description: 'Inspect the scorecard built from this audit.',
      viewScorecard: 'View the preview',
      hideScorecard: 'Hide the preview',
      regenerateScorecard: 'Regenerate preview',
      downloadPdf: 'Download PDF',
      unavailableWithReason: 'Preview unavailable ({refusal}).',
      refusalReasons: {
        'candidate-unknown': 'This prospect is unknown.',
        'no-audit': 'No full scan has finished for this prospect yet.',
        'audit-in-flight': 'The outreach audit for this prospect is still running.',
        'audit-failed': 'The latest outreach audit failed or was stopped.',
        'preview-already-live': 'a preview is already live; revoke it to publish another',
        'domain-mismatch': 'The stored audit does not match this prospect’s own domain.',
        suppressed: 'This domain is on the do-not-contact list.',
        'address-suppressed': 'This address is on the do-not-contact list.',
        'coverage-incomplete':
          'The site crawl is incomplete, so the scorecard refuses to invent numbers.',
        'report-not-ready':
          'This audit’s client reports are not ready: regenerate the report before publishing the preview or drafting the first email.',
        'insufficient-safe-cards': 'Too few verified findings to build a reliable scorecard.',
        'not-an-outreach-audit': 'This audit is not linked to a campaign prospect.',
        'preview-not-published': 'No published preview matches: publish the preview first.',
        'preview-revoked': 'The published link was taken down: reissue a link from this audit.',
        'preview-expired': 'The published link expired: reissue a link from this audit.',
        'preview-wrong-audit':
          'The published link belongs to another audit: reissue a link from this audit.',
        'no-usable-contact': 'No usable contact email was found for this hotel.',
        'evidence-incomplete': 'The evidence needed to write this email isn’t complete yet.',
        'evidence-schema-outdated':
          'The stored evidence format is out of date: run a new analysis for this hotel.',
        'prescan-expired': 'The preliminary scan expired: run a new one before drafting an email.',
        'no-distinct-second-observation':
          'Only one usable finding was found; the email needs two distinct ones.',
        'observation-not-in-allowlist':
          'None of the recorded findings are ones the email is allowed to mention.',
        'thread-closed': 'This hotel’s outreach thread is already closed.',
        'draft-already-live': 'A draft already exists for this hotel.',
        'suppressed-before-generation': 'This domain is on the do-not-contact list.',
        'suppressed-before-provider':
          'This domain was added to the do-not-contact list before sending; nothing was sent.',
        'assembly-refused': 'The email couldn’t be assembled from the available evidence.',
        'provider-draft-unrecorded':
          'Sending to the provider couldn’t be confirmed; check manually before retrying.',
        'no-mailbox-configured':
          'The sending mailbox isn’t configured on this server; the preview was still published, copy the link above.',
      },
      renderError: 'Could not render the preview.',
      publishAction: 'Publish preview',
      reissueAction: 'Reissue a link',
      linkOnceTitle: 'Save this link now',
      linkOnceWarning:
        'For privacy, this link is shown only once and Odysseus never stores it. Copy it somewhere safe; it cannot be shown again.',
      linkCopy: 'Copy the link',
      linkCopied: 'Copied',
      revokedMessage: 'Preview taken down.',
      draftCreatedMessage: 'Draft created: review it in the Emails section of this page.',
      draftRefusedMessage: 'Nothing was drafted; the orchestrator declined this action.',
      actionError: 'Could not complete this action.',
    },
    panel: {
      heading: 'Client report',
      description:
        'Every action stays visible: it is greyed out with its reason when it is not available yet.',
      doneLabel: 'Done',
      findingsFreshLabel: 'Findings up to date',
      findingsStaleLabel: 'Findings out of date',
      identityHeading: 'Confirm the client’s identity',
      writingHeading: 'Write the report',
      produceHeading: 'Produce the PDFs',
      deliveryHeading: 'Approve and deliver',
      preparationUnavailable: 'Preparation is not available for this audit.',
      production: {
        heading: 'Report production',
        steps: {
          confirmed: 'Data confirmed',
          writing: 'Writing',
          pdf: 'Generating PDFs',
          ready: 'Ready',
        },
        writingTitle: 'Writing report…',
        writingDescription: 'Generating the report narrative and recommendations.',
        pdfTitle: 'Generating PDFs…',
        pdfDescription: 'The report content is complete. Creating the final PDFs.',
        readyTitle: 'Report ready',
        readyDescription: 'The PDFs were generated.',
        failedTitle: 'Report production failed',
        failedWritingDescription: 'Writing did not finish. Run the writing again to retry.',
        failedPdfDescription: 'PDF generation did not finish. Regenerate the PDFs to retry.',
        writingBusyLabel: 'Writing report…',
        pdfBusyLabel: 'Generating PDFs…',
      },
      produceButton: 'Regenerate the PDFs',
      produceButtonRefreshFirst: 'Refresh findings then regenerate the PDFs',
      produceFailedHeading: 'The PDFs could not be produced',
      produceFailedOverflow:
        'Content on page {page} extends outside the printable area (overflow of {amount} px). Two causes are known: a block the layout could not split across two pages, or a very long text without spaces (address, selector, URL). No PDF was delivered.',
      produceFailedOverflowFinding: 'Finding involved: {finding}.',
      produceFailedOverflowSection: 'Section involved: “{section}”.',
      produceFailedOverflowBlock: 'Passage involved: “{excerpt}”.',
      produceFailedStaleData:
        'The scan data changed format since this writing was produced. Produce the PDFs again: the findings and the writing are refreshed first. No PDF was delivered.',
      produceFailedIdentity:
        'The client name on the cover is still a detected guess. Confirm it above, then produce the PDFs. No PDF was delivered.',
      produceFailedLayout: 'The report layout failed the print safety check. No PDF was delivered.',
      produceFailedGeneric: 'Producing the PDFs was refused. No PDF was delivered.',
      produceFailedTechnicalLabel: 'Technical detail',
      produceFailedDismiss: 'Dismiss',
      produceRefreshFirstHint:
        'This audit’s findings are out of date; they will be refreshed before the PDFs are produced.',
      produceUnavailableReason:
        'No French writing is available yet: write the report above before producing the PDF.',
      deliveryUnavailableReason: 'No fresh report is available yet for approval and download.',
      reportDetailsSummary: 'Report details (optional)',
    },
    evidenceQuality: {
      heading: 'Evidence quality',
      description: 'What the full audit actually verified, stage by stage, before any approval.',
      verdictLabel: 'Assessment',
      verdicts: {
        'reportable-complete': 'Evidence complete',
        'reportable-with-known-limitations': 'Reportable, known limitations',
        'needs-operator-review': 'Operator review required',
        failed: 'Evidence not approvable',
      },
      approvalLabel: 'Approval',
      approvalStates: {
        approved: 'Approved',
        missing: 'Not approved',
        stale: 'No longer matching',
      },
      stagesHeading: 'Evidence stages',
      stageStates: { complete: 'Complete', partial: 'Partial', blocked: 'Blocked' },
      stageNames: {
        'scope-network-safety': 'Scope and network safety',
        'inventory-discovery': 'Inventory discovery',
        'content-acquisition': 'Content acquisition',
        'surface-discovery': 'Surface discovery',
        'inventory-reconciliation': 'Inventory reconciliation',
        'content-evidence-repair': 'Content evidence repair',
        'performance-verification': 'Performance verification',
        'temporal-coherence': 'Temporal coherence',
        'raw-evidence-snapshot': 'Raw evidence snapshot',
        'normalization-verification': 'Normalization verification',
        'evidence-approved': 'Evidence approved',
      },
      performanceCalibrationNote:
        'Calibration tolerances are not established yet: measured values remain provisional.',
      countPagesVisited: '{count} pages visited',
      countFindings: '{count} findings recorded',
      countDisclosures: '{count} mandatory disclosures',
      blockingHeading: 'Blocking reasons',
      noBlockingReasons: 'Nothing blocking recorded.',
      blockingRefCount: '{count} references',
      blockingReasons: {
        'raw-evidence-invalid':
          'Persisted artifacts do not belong to one consistent scope and evidence epoch.',
        'inventory-unreconciled': 'Known pages have no final inventory disposition.',
        'unresolved-material-gap':
          'Material checks have no accepted evidence after the recovery ladder.',
        'unstable-material-result': 'Repeated observations of one check disagree.',
        'temporal-drift':
          'The site changed during the audit: evidence cannot be tied to one site version.',
        'temporal-coherence-unverified':
          'The audit cannot show that all of its evidence comes from one version of the site.',
        'disclosed-scope-limitation':
          'A scope limitation is documented and will be disclosed in the report.',
        'performance-confidence-insufficient':
          'The selected performance measurements fail the stability and confidence policy.',
        'capability-gap-undisclosed': 'Material embedded content could not be inspected.',
        'site-level-unknown': 'A site-level check has no accepted evidence.',
        'robots-policy-unresolved': 'No robots policy snapshot was persisted for this audit.',
        'network-safety-preflight-failed': 'The network-safety preflight failed.',
        'environment-unapproved':
          'The browser ran without a sandbox or an approved isolation profile: the execution environment is not approved.',
        'consistency-gate-failed':
          'Some normalized findings do not reconcile to accepted scan evidence.',
        'operator-resolution-required':
          'The site rate-limited or walled the crawler: an operator decision (pacing, allowlisting) is needed.',
        'legacy-evidence-insufficient': 'Legacy evidence is insufficient for this report path.',
      },
      unknownBlockingReason: 'Unknown blocking reason ({code}).',
      approvalMissingNote:
        'The evidence was assessed without being approved: the client report path will refuse this audit until an approval exists.',
      approvalStaleNote:
        'The approval no longer matches the evidence roots: a new audit is needed to approve again.',
      promotionBlockedUnapproved:
        'This audit’s evidence was assessed without being approved: promoting this bundle stays blocked.',
      promotionBlockedChanged:
        'The evidence approval this bundle was produced from no longer stands: rerun the quality pipeline.',
    },
    gradeOverride: {
      heading: 'Overall grade',
      description:
        'The grade computed automatically from findings, reviewable by an operator without being replaced.',
      automaticGradeLabel: 'Automatic grade',
      overrideActiveLabel: 'Reviewed grade: {grade}',
      overrideReasonLabel: 'Reason',
      overrideReviewedAtLabel: 'Reviewed on',
      editButton: 'Review grade',
      clearButton: 'Remove review',
      cancelButton: 'Cancel',
      saveButton: 'Save',
      gradeFieldLabel: 'Grade',
      reasonFieldLabel: 'Reason for the review',
      reasonPlaceholder: 'Why does this grade differ from the automatic grade?',
      reasonRequiredError: 'A reason is required.',
      saveError: 'Could not save the review.',
      clearError: 'Could not remove the review.',
      saveSuccess: 'Reviewed grade saved.',
      clearSuccess: 'Review removed; the automatic grade applies again.',
    },
  },
} satisfies { fr: AuditDetailStrings; en: AuditDetailStrings };
