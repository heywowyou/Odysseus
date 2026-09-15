import type { JobStatus, TodoRowAction, TodoRowKind } from '../lib/api-types';
import type { ProgressPhase } from '../lib/phase-order';

export type DashboardLanguage = 'fr' | 'en';

export interface DashboardStrings {
  nav: {
    audits: string;
    newScan: string;
    prospects: string;
    /** Sidebar label for /a-traiter, the landing page (plan 040 slice 6;
     *  operator decision 2026-09-12: "Démarches" becomes "À traiter"). */
    outreach: string;
  };
  /** Footer link and page for /outils, plan 040 slice 8. */
  tools: {
    navLabel: string;
    title: string;
    description: string;
  };
  shell: {
    tagline: string;
    /** Sidebar group headings. The navigation is grouped by the two halves of
     *  the work rather than listed flat. */
    groupMeasure: string;
    groupCampaign: string;
    navigation: string;
    openMenu: string;
    closeMenu: string;
    language: string;
    /** Footer link to the do-not-contact lookup (/ne-pas-contacter). */
    checkAddress: string;
    /** Footer build-revision disclosure (issue: expose build/revision
     *  metadata) - "which build handled this?" without opening devtools. */
    buildRevisionLabel: string;
    copyBuildRevision: string;
    buildRevisionCopied: string;
  };
  common: {
    severityLabels: { critical: string; serious: string; moderate: string; minor: string };
    statusLabels: Record<JobStatus, string>;
    /** camelCase keys mirror the API job types displayed by the dashboard.
     *  Internal batch jobs keep a neutral label if opened directly; the
     *  ordinary scan form exposes only the three public intents. */
    typeLabels: {
      fullAudit: string;
      prospecting: string;
      hotelPrescan: string;
      outreachFullScan: string;
    };
    viewDetails: string;
    error: string;
    loading: string;
    retry: string;
    cancel: string;
    /** Shown by stub routes only; removed once every page is rebuilt. */
    comingSoon: string;
    /** Primary line for any failed request; the technical error string is
     *  demoted to a secondary detail line by the pages. */
    requestFailed: string;
    /** Catch-all shown instead of an unrecognized vocabulary code. */
    vocabularyFallback: string;
    /** {minutes}, {hours} and {days} are replaced with counts by
     *  lib/format.ts's formatRelativeTime. */
    relativeTime: {
      justNow: string;
      minutesAgo: string;
      hoursAgo: string;
      daysAgo: string;
    };
    /** List rows for prospecting jobs have no single site; this stands in
     *  for the site column. */
    unknownSite: string;
    /** Marker rendered in place of a count whose backing data failed to
     *  load, so unknown never reads as a confident zero. */
    valueUnavailable: string;
    /** Legend of the coverage strip. These are the charter's own coverage
     *  terms and they are not interchangeable: a page can be inventoried
     *  without being content-checked, and content-checked without being
     *  performance-measured. Omitted URLs were never inventoried at all, so
     *  the strip keeps them outside the inventory. */
    coverage: {
      caption: string;
      measured: string;
      checked: string;
      reached: string;
      failed: string;
      omitted: string;
    };
  };
  audits: {
    title: string;
    description: string;
    emptyState: string;
    emptyStateCta: string;
    dateColumn: string;
    siteColumn: string;
    /** Site column text for a multi-URL prospecting job (no single site).
     *  {count} is replaced with the URL count; singular is used only for
     *  count === 1. */
    siteCountSingular: string;
    siteCountPlural: string;
    typeColumn: string;
    statusColumn: string;
    severityColumn: string;
    searchPlaceholder: string;
    statusFilterAll: string;
    sortNewest: string;
    sortOldest: string;
    kpiRunning: string;
    kpiComplete: string;
    kpiFailed: string;
    /** {time} is replaced by a formatted clock time (lib/format.ts). */
    updatedAt: string;
    /** Shown when audits exist but no row survives search and filters. */
    emptyFilter: string;
    /** Accessible name of the sort select; the options carry the visible
     *  copy. */
    sortLabel: string;
    /** Job controls of the audits table: stop, delete, clear queue, and
     *  their confirmation dialogs and toasts. */
    stopAction: string;
    deleteAction: string;
    confirmStopTitle: string;
    confirmStopBody: string;
    /** {site} is replaced with the deleted scan's site URL by the page. */
    confirmDeleteTitle: string;
    confirmDeleteBody: string;
    clearQueue: string;
    confirmClearQueueTitle: string;
    /** {count} is replaced with the number of queued scans by the page. */
    confirmClearQueueBody: string;
    stoppedMessage: string;
    deletedMessage: string;
    /** {count} is replaced with the number of cancelled queued scans. */
    queueClearedMessage: string;
    /** Shown when a stop, delete, or clear-queue mutation fails. */
    actionFailed: string;
  };
  newScan: {
    title: string;
    description: string;
    typeLabel: string;
    typeFullAudit: string;
    typeQuickCheck: string;
    typeProspectingAudit: string;
    typeFullAuditHint: string;
    typeQuickCheckHint: string;
    typeProspectingAuditHint: string;
    urlLabel: string;
    urlPlaceholder: string;
    prospectLabel: string;
    noProspectOption: string;
    prospectMatchHint: string;
    prospectSearchPlaceholder: string;
    prospectSearchAria: string;
    prospectSearchEmpty: string;
    createProspectAction: string;
    createProspectTitle: string;
    createProspectNamePlaceholder: string;
    createProspectNameAria: string;
    createProspectSubmit: string;
    prospectCreated: string;
    /** Shown when a non-empty URL is not an absolute http(s) URL without
     *  embedded credentials, the shape routes/scans.ts accepts. */
    urlInvalidError: string;
    /** Full-audit only (single-audit input, no bulk equivalent for
     *  prospecting yet). Optional: used for the obligation determination
     *  when the site itself does not publish a SIREN, or to cross-check
     *  one that does. Never suppresses the site's own LCEN finding. */
    sirenLabel: string;
    sirenPlaceholder: string;
    sirenHint: string;
    sirenInvalidError: string;
    /** Part B of the transactional-flow milestone: a manual escape hatch
     *  for whatever the behavioral detector still misses. Absent (the
     *  "let the tool detect" option) falls through to detection entirely;
     *  the reason field is only shown once yes/no is picked. */
    transactionalFlowLabel: string;
    transactionalFlowAutoOption: string;
    transactionalFlowYesOption: string;
    transactionalFlowNoOption: string;
    transactionalFlowReasonLabel: string;
    transactionalFlowReasonPlaceholder: string;
    advancedOptions: string;
    maxPagesLabel: string;
    /** Stands under the max-pages input: empty means the whole site, which
     *  can take hours on a large site. */
    maxPagesHint: string;
    maxDepthLabel: string;
    delayLabel: string;
    /** Stands under the delay input: the server raises values below its
     *  configured default up to it, so the option only slows the crawl. */
    delayHint: string;
    scanConcurrencyLabel: string;
    /** Stands under the scan-concurrency input: the server lowers values
     *  above its configured default down to it, so the option only reduces
     *  the load on the scanned site. The default itself is not shown here;
     *  the operator reads it from the server env config. */
    scanConcurrencyHint: string;
    seedsLabel: string;
    seedsPlaceholder: string;
    exclusionsLabel: string;
    exclusionsPlaceholder: string;
    bookingEngineUrlLabel: string;
    bookingEngineUrlPlaceholder: string;
    submitButton: string;
    submitError: string;
  };
  progress: {
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
    /** Issue #187: links a coverage-gate failure to the crawl delay / scan
     *  concurrency fields on /scans/new that its own message names as the
     *  remedy. */
    coverageGateFieldsLink: string;
    /** A completed prospect-linked scan returns the operator to its record. */
    goToProspectLink: string;
  };
  auditDetail: {
    title: string;
    dateLabel: string;
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
    /** Non-blocking warning on a report row whose measured page count is
     *  above the report package's threshold; {count} is replaced with the
     *  page count by the page. */
    reportPageCountWarning: string;
    lifecycleLabel: string;
    lifecycle: Record<'scanned' | 'analysed' | 'rendered' | 'approved', string>;
    previewReport: string;
    approvedDownload: string;
    /** Plan 045 section 2.3: the download link's label before the pair is
     *  approved - clicking it approves both languages, then downloads. */
    approveAndDownload: string;
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
    recipientNameLabel: string;
    sectorLabel: string;
    sectorAutoOption: string;
    sectorGeneralOption: string;
    sectorHospitalityOption: string;
    revenueBandLabel: string;
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
    /** A failed audit whose lifecycle is still `scanned`: no bilingual
     *  analysis pair exists, so the failure card points at the Prepare
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
      /** The produce action's button. */
      produceButton: string;
      /** Plan 045 slice 1.2: the button label when findings will be
       *  refreshed before the PDFs render (AuditDetailResponse.findingsStale). */
      produceButtonRefreshFirst: string;
      /** Explains produceButtonRefreshFirst's label under the button. */
      produceRefreshFirstHint: string;
      /** Persistent failure block after "regenerate the PDFs" is refused. */
      produceFailedHeading: string;
      /** {page} and {amount}: the print gate found content wider than the page. */
      produceFailedOverflow: string;
      produceFailedOverflowFinding: string;
      /** A different layout-safety refusal from the PDF renderer. */
      produceFailedLayout: string;
      produceFailedGeneric: string;
      produceFailedTechnicalLabel: string;
      produceFailedDismiss: string;
      /** Why the produce action is greyed: no bilingual writing pair
       *  resolves yet (AuditDetailResponse.analysisPair === 'none'). */
      produceUnavailableReason: string;
      /** Why the delivery action is greyed: no fresh report pair yet. */
      deliveryUnavailableReason: string;
      /** Summary label of the collapsed "Report details (optional)"
       *  disclosure (report-details-form.tsx). */
      reportDetailsSummary: string;
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
  };

  /** Plan 019: the Prepare report card. The closed vocabulary option
   *  labels are duplicated by value from @odysseus/core's copy tables
   *  because the dashboard TypeScript project reads no workspace packages;
   *  the strings-parity test keeps both languages aligned. */
  prepareReport: {
    title: string;
    description: string;
    situationLabel: string;
    triggerLabel: string;
    /** Shown only when the trigger 'other' is selected. */
    triggerOtherNotesLabel: string;
    customQuestionLabel: string;
    frenchFieldLabel: string;
    englishFieldLabel: string;
    automaticOption: string;
    turnoverHeading: string;
    turnoverDescription: string;
    detectedTurnoverLabel: string;
    detectedTurnoverUnavailable: string;
    useDifferentTurnoverLabel: string;
    useOfficialTurnoverLabel: string;
    turnoverKindLabel: string;
    turnoverExactOption: string;
    turnoverRangeOption: string;
    turnoverAmountLabel: string;
    turnoverLowerLabel: string;
    turnoverUpperLabel: string;
    turnoverYearLabel: string;
    turnoverSourceLabel: string;
    turnoverSourceOfficialAccounts: string;
    turnoverSourceClient: string;
    turnoverSourceOther: string;
    turnoverSourceNoteLabel: string;
    turnoverEffectiveLabel: string;
    turnoverDetectedBasis: string;
    turnoverReplacementBasis: string;
    turnoverRangeBasis: string;
    turnoverMissing: string;
    turnoverReplacementMissing: string;
    stakeholdersHeading: string;
    journeysHeading: string;
    journeyConfirm: string;
    journeyRemove: string;
    journeyConfirmedLabel: string;
    journeyRemovedLabel: string;
    /** Why a suggested journey is not verifiable; read through
     *  prepare-report-model's exclusionLabel. */
    exclusionNoVisitedPages: string;
    exclusionNoTransactionalFlow: string;
    exclusionNoTransactionalPageVisited: string;
    exclusionEvidenceUnavailable: string;
    warningsHeading: string;
    warningCommercialName: string;
    warningSituation: string;
    warningTrigger: string;
    warningJourneyScope: string;
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
    situationOptions: Record<
      | 'no-work-started'
      | 'redesign-underway'
      | 'corrections-underway'
      | 'accessibility-programme'
      | 'periodic-review'
      | 'unknown',
      string
    >;
    triggerOptions: Record<
      | 'legal-question'
      | 'customer-complaint'
      | 'booking-or-conversion'
      | 'search-visibility'
      | 'redesign'
      | 'procurement'
      | 'commercial-discussion'
      | 'proactive-review'
      | 'other',
      string
    >;
    journeyLabels: Record<'discovery-navigation' | 'transaction-booking', string>;
  };
  /** Shared operator-interface strings (plan 013): pagination, review
   *  actions, and detail-page navigation used by several pages. */
  operator: {
    paginationPrevious: string;
    paginationNext: string;
    /** {page} and {pages} are replaced with counts by the page. */
    paginationPageOf: string;
    /** Accessible name of every pagination nav landmark. */
    paginationLabel: string;
    accept: string;
    reject: string;
    accepted: string;
    rejected: string;
    /** Shown when a prospect action fails. */
    actionError: string;
    provenanceLabel: string;
    /** Issue #183: the fiche's provenance line shows this instead of the raw
     *  `dashboard-review` fallback constant the backend stores when a
     *  dashboard decision carries no free-text reason. */
    provenanceReasonFallback: string;
    notFound: string;
    backToProspects: string;
  };
  /** Plan 047's durable prospect hub pages. FR is the source table: every
   *  operator-facing label in the new directory, list, results, and detail
   *  routes lives here before its English counterpart is added. */
  prospectHub: {
    filters: {
      searchPlaceholder: string;
      searchAria: string;
      advanced: string;
      activeFilters: string;
      removeFilter: string;
      clearAll: string;
      sectorPlaceholder: string;
      sectorAria: string;
      starsAria: string;
      allStars: string;
      starOption: string;
      groupAria: string;
      allGroups: string;
      websiteAria: string;
      allWebsiteKinds: string;
      departmentPlaceholder: string;
      departmentAria: string;
      communePlaceholder: string;
      communeAria: string;
      postcodePlaceholder: string;
      postcodeAria: string;
      roomsMinPlaceholder: string;
      roomsMinAria: string;
      roomsMaxPlaceholder: string;
      roomsMaxAria: string;
      scanAria: string;
      allScans: string;
      withScan: string;
      withoutScan: string;
      activityAria: string;
      allActivity: string;
      activeOnly: string;
      inactiveOnly: string;
    };
    list: {
      eyebrow: string;
      title: string;
      description: string;
      newAction: string;
      addFromDirectory: string;
      newTitle: string;
      namePlaceholder: string;
      sectorPlaceholder: string;
      websitePlaceholder: string;
      emailPlaceholder: string;
      nameAria: string;
      sectorAria: string;
      websiteAria: string;
      emailAria: string;
      createAction: string;
      searchPlaceholder: string;
      searchAria: string;
      sectorFilterAria: string;
      statusFilterAria: string;
      starsFilterAria: string;
      groupFilterAria: string;
      websiteFilterAria: string;
      departmentPlaceholder: string;
      departmentAria: string;
      roomsMinPlaceholder: string;
      roomsMinAria: string;
      roomsMaxPlaceholder: string;
      roomsMaxAria: string;
      scanFilterAria: string;
      activityFilterAria: string;
      allStatuses: string;
      allStars: string;
      allGroups: string;
      allWebsiteKinds: string;
      allScans: string;
      withScan: string;
      withoutScan: string;
      allActivity: string;
      activeOnly: string;
      inactiveOnly: string;
      errorTitle: string;
      emptyTitle: string;
      emptyDescription: string;
      openDirectory: string;
      columns: { name: string; site: string; location: string; status: string; activity: string };
      unknown: string;
      notProvided: string;
      count: string;
      previous: string;
      next: string;
      starOption: string;
      viewAria: string;
      allView: string;
      resultsView: string;
    };
    directory: {
      eyebrow: string;
      title: string;
      description: string;
      backToProspects: string;
      searchPlaceholder: string;
      searchAria: string;
      sectorAria: string;
      starsAria: string;
      groupAria: string;
      websiteAria: string;
      departmentPlaceholder: string;
      departmentAria: string;
      roomsMinPlaceholder: string;
      roomsMinAria: string;
      roomsMaxPlaceholder: string;
      roomsMaxAria: string;
      allStars: string;
      allGroups: string;
      allWebsiteKinds: string;
      columns: { select: string; name: string; site: string; location: string; property: string };
      count: string;
      addSelected: string;
      addOne: string;
      alreadyAdded: string;
      notProvided: string;
      noFacets: string;
      errorTitle: string;
      previous: string;
      next: string;
      starOption: string;
      roomsOption: string;
      groupLabels: Record<string, string>;
      websiteKindLabels: Record<string, string>;
    };
    results: {
      eyebrow: string;
      title: string;
      description: string;
      errorTitle: string;
      emptyTitle: string;
      emptyDescription: string;
      columns: { prospect: string; status: string; outcome: string; site: string };
      statusAria: string;
      outcomeAria: string;
      outcomePlaceholder: string;
      statusLabels: Record<string, string>;
      outcomeLabels: Record<string, string>;
      unknownSite: string;
    };
    detail: {
      back: string;
      missing: string;
      return: string;
      loading: string;
      record: string;
      origin: string;
      site: string;
      noSite: string;
      saveSite: string;
      email: string;
      addEmail: string;
      actions: string;
      summary: string;
      editRecord: string;
      allActions: string;
      recommended: string;
      completed: string;
      noRecommendation: string;
      recommendationActions: Record<string, string>;
      recommendationReasons: Record<string, string>;
      quick: string;
      fullAudit: string;
      prospecting: string;
      outcome: string;
      history: string;
      fullHistory: string;
      recentActivity: string;
      statusCorrection: string;
      statusCorrectionHint: string;
      websites: string;
      addWebsite: string;
      addWebsitePlaceholder: string;
      /** Issues #270/#271: contact correction controls. {url} / {address}. */
      contacts: {
        removeWebsite: string;
        setPrimaryWebsite: string;
        removeWebsiteTitle: string;
        removeWebsiteDescription: string;
        removeWebsitePrimaryNote: string;
        removeEmail: string;
        removeAndBlacklistEmail: string;
        useForOutreach: string;
        outreachRecipient: string;
        removeEmailTitle: string;
        removeEmailDescription: string;
        removeAndBlacklistTitle: string;
        removeAndBlacklistDescription: string;
        confirmRemove: string;
        confirmRemoveAndBlacklist: string;
      };
      emailList: string;
      notProvided: string;
      roomsSummary: string;
      delete: string;
      confirm: string;
      info: string;
      outreach: string;
      identity: string;
      name: string;
      sector: string;
      address: string;
      postcode: string;
      commune: string;
      department: string;
      phone: string;
      notes: string;
      saveDetails: string;
      preview: string;
      firstEmail: string;
      followUp: string;
      publishPreview: string;
      statusAria: string;
      ready: string;
      blocked: string;
      emailSection: string;
      noThread: string;
      threadState: string;
      draftLabel: string;
      draftCreated: string;
      previewPublished: string;
      previewLinkOnce: string;
      previewExpires: string;
      revokePreview: string;
      confirmRevokePreview: string;
      previewRevoked: string;
      draftRecipient: string;
      draftBody: string;
      openPreview: string;
      openInMailbox: string;
      discardDraft: string;
      confirmDiscardDraft: string;
      draftDiscarded: string;
      noDraft: string;
      auditState: string;
      eventLabel: string;
      noEvents: string;
      actionFailed: string;
      actionRefused: string;
      firstEmailCreated: string;
      followUpCreated: string;
      outcomeSaved: string;
      outreachLanguage: string;
      outreachLanguageHint: string;
      languageLabels: Record<'fr' | 'en', string>;
      outcomeRefused: string;
      optOutWithdrawn: string;
      detachAudit: string;
      confirmDetachAudit: string;
      auditDetached: string;
      originLabels: Record<string, string>;
      auditKindLabels: Record<string, string>;
      previewStatusLabels: Record<string, string>;
      refusalLabels: Record<string, string>;
      statusLabels: Record<string, string>;
      outcomeLabels: Record<string, string>;
      eventLabels: Record<string, string>;
      auditStateLabels: Record<string, string>;
    };
  };
  prospects: {
    title: string;
    description: string;
    queueLabel: string;
    /** Placeholder and accessible name of the prospect search box. */
    searchPlaceholder: string;
    queues: Record<
      'all' | 'joinReview' | 'parked' | 'rejected' | 'alreadyEngaged' | 'groups',
      string
    >;
    filters: {
      identityStatus: string;
      groupStatus: string;
      reviewState: string;
      qualification: string;
      all: string;
    };
    /** Plan 041 slice B1: the toggle between the actionable wave (the
     *  default) and the whole catalogue. */
    selectionFilter: {
      label: string;
      selected: string;
      all: string;
    };
    columns: {
      name: string;
      city: string;
      identity: string;
      group: string;
      qualification: string;
      review: string;
      contact: string;
      thread: string;
      outcome: string;
      /** Plan 041 slice B1: the wave column, membership only. */
      selection: string;
      actions: string;
    };
    /** Plan 041 slice B1's wave column cell text and its info tip. `rank`
     *  interpolates the selection rank when the record carries one. */
    selectionValues: {
      inSelectionWithRank: string;
      inSelectionNoRank: string;
      notInSelection: string;
    };
    /** {selected}/{scored}/{total} counts above the list, so the
     *  catalogue's size is stated rather than discovered by paging. */
    selectionCountLine: string;
    /** Plan 043 slice 3: the row-level wave add and the read-only
     *  selection overview (the formula's cohorts and the active roster). */
    addRowAction: string;
    /** Issue #199: a selected row without a score states that, instead of
     *  a dash that reads as "no problems". */
    notScoredCell: string;
    selectionOverview: {
      show: string;
      hide: string;
      cohortsTitle: string;
      cohortsEmpty: string;
      rosterTitle: string;
      rosterEmpty: string;
      columns: {
        version: string;
        kind: string;
        date: string;
        population: string;
        selected: string;
        cutoffs: string;
        wave: string;
        hotel: string;
        actor: string;
      };
      kind: Record<'selected' | 'calibration', string>;
    };
    filterEmpty: string;
  };
  prospectDetail: {
    description: string;
    /** Section labels the hub's Fiche section still renders; the other
     *  stage names live in hub.steps. */
    sections: Record<'identity' | 'qualification', string>;
    openSite: string;
    outreachScanQueued: string;
    outreachScanRefused: string;
    quickCheckQueued: string;
    quickCheckRefused: string;
    sourcesHeading: string;
    sources: {
      field: string;
      value: string;
      source: string;
      /** Empty state of the sources list, plain about sources (the old
       *  copy reused the outcome-empty sentence). */
      none: string;
    };
    qualification: { outcome: string; reason: string; events: string };
    /** Contact section rows (issue #95): operator labels for the store's
     *  contact evaluation fields. A field with no value is omitted rather
     *  than rendered as an empty labelled row. */
    contact: {
      decision: string;
      reason: string;
      mailbox: string;
      source: string;
      validatedAt: string;
    };
    thread: { lastEventAt: string };
    outcomeNone: string;
    catalogue: {
      name: string;
      city: string;
      ownDomain: string;
      groupId: string;
    };
  };
  /** Plan 040 slice 4: the hotel hub. The pipeline strip, the one primary
   *  action, and the few strings its six sections need beyond the stage
   *  groups they reuse (prescan, score, evidence, preview, outreachThread,
   *  drafts, outcomes, labels). */
  hub: {
    /** Accessible name of the pipeline strip. */
    pipelineLabel: string;
    steps: Record<
      'fiche' | 'quick-check' | 'audit' | 'report' | 'preview' | 'emails' | 'outcome',
      string
    >;
    stepStates: Record<'done' | 'active' | 'todo' | 'blocked' | 'stale' | 'refreshing', string>;
    /** The header's one primary action, chosen by state (review and the
     *  terminal refusal excepted: review reuses operator.accept, a refusal
     *  is a sentence, not a button). */
    primary: {
      startScan: string;
      seeProgress: string;
      createFirstEmail: string;
      reviewDraft: string;
      prepareFollowUp: string;
      recordOutcome: string;
    };
    /** Where the primary button would sit when the scan stage refused:
     *  one plain sentence per typed reason, untranslated codes never
     *  shown. */
    scanRefusedLabel: string;
    scanRefusals: Record<
      | 'candidate-unknown'
      | 'no-own-domain'
      | 'not-selected'
      | 'cohort-not-approved'
      | 'not-qualified'
      | 'qualification-not-current'
      | 'domain-mismatch'
      | 'suppressed'
      | 'already-in-flight',
      string
    >;
    /** Plan 041 slice B1: the factual "why" shown beside a 'not-selected'
     *  refusal, read from the same selection verdict the list's wave
     *  column uses. Never a client-specific conclusion, only the recorded
     *  criteria and numbers. */
    selectionVerdict: {
      /** {ability}, {abilityCutoff}, {brokenness}, {brokennessCutoff},
       *  {date}: this hotel's own score against the newest cohort's
       *  cutoffs. */
      belowCutoff: string;
      /** No score exists yet for this hotel. */
      notScored: string;
    };
    fiche: {
      starsLabel: string;
      roomsLabel: string;
      capacityLabel: string;
      /** Disclosure holding the internal identifiers and version codes. */
      technicalDetails: string;
      hideTechnicalDetails: string;
      recheckQualificationAction: string;
      recheckQualificationQualified: string;
      /** {reason} interpolates the rejection reason code. */
      recheckQualificationStillRejected: string;
      recheckQualificationFailed: string;
      /** Issue #237. */
      qualificationOverrideBadge: string;
      qualificationOverrideAction: string;
      qualificationOverrideRemoveAction: string;
      qualificationOverrideSucceeded: string;
      qualificationOverrideFailed: string;
      qualificationOverrideRemoveSucceeded: string;
      qualificationOverrideRemoveFailed: string;
    };
    quickCheck: {
      empty: string;
      metricsDisclosure: string;
      hideMetrics: string;
      metricsColumns: {
        page: string;
        lcp: string;
        cls: string;
        blocking: string;
        requests: string;
      };
      /** Issue #217: the stale-pipeline banner and its recovery action,
       *  shown whenever qualification, quick check, or score names an
       *  older pipeline version than the one currently running. */
      staleNotice: string;
      refreshAction: string;
      refreshQueued: string;
      refreshFailed: string;
    };
    audit: {
      empty: string;
      running: string;
      openAudit: string;
      stageLabel: string;
      /** Plan 042 slice 2: the audit picker (shown once the hotel has
       *  more than one audit) and the standalone-view note beside the
       *  open-audit link. */
      pickerLabel: string;
      standaloneHint: string;
      /** Plan 044: the paid deliverable scan's launch on this tab. */
      launchFullAudit: string;
      launchQueued: string;
      launchRefusals: Record<'no-own-domain' | 'already-in-flight', string>;
    };
    /** Plan 042 slice 3: the paid report chain's tab, visible once the
     *  hotel is sold (outcome `won`) or revealed manually from the Audit
     *  tab - view state only, nothing stored. */
    /** Plan 043: the wave roster's controls - the add/remove mutations on
     *  the hub and the list, their dialog copy, and one sentence per typed
     *  refusal the store can answer. */
    wave: {
      addAction: string;
      removeAction: string;
      dialogTitleAdd: string;
      dialogTitleRemove: string;
      /** {hotelName} is never inside these: the dialog shows the name as
       *  its own line above the body. */
      dialogBodyAdd: string;
      dialogBodyRemove: string;
      waveLabel: string;
      confirmAdd: string;
      confirmRemove: string;
      /** {wave} is the wave name the operator confirmed. */
      addedToast: string;
      removedToast: string;
      /** The Fiche line for a roster-sourced hotel: {wave}, {date},
       *  {actor}. */
      rosterLine: string;
      refusals: Record<
        | 'already-on-roster'
        | 'no-cohort'
        | 'no-own-domain'
        | 'domain-unknown'
        | 'candidate-unknown'
        | 'not-on-roster',
        string
      >;
      /** Issue #199: one sentence per add-time scoring outcome, shown as
       *  the added toast's second line. */
      scoring: Record<'scored' | 'alreadyScored' | 'notScoreable', string>;
    };
    emails: {
      /** {n} is the follow-up number: Relance 1, Relance 2. */
      followUpName: string;
      firstEmailName: string;
      /** Badge for a draft that also exists in the operator's mailbox
       *  (approved IA vocabulary: no raw provider code on screen). */
      providerDraft: string;
      needsReviewNotice: string;
      /** Issue #186: clears the reply's needs-review flag; recording an
       *  outcome does not do this on its own. */
      markReviewed: string;
      noPendingDraft: string;
      firstEmailBlockedPendingDraft: string;
      firstEmailBlockedThreadStarted: string;
    };
    outcome: {
      formHeading: string;
      outcomeLabel: string;
      lostReasonLabel: string;
      submit: string;
      recorded: string;
      optOutConfirmTitle: string;
      optOutConfirmBody: string;
      optOutDone: string;
      actionError: string;
      /** Issue #184: the Résultat tab's empty state before a thread exists,
       *  replacing the generic "no outcome" line with the actual reason and
       *  a link to where the operator would start one. */
      noThreadYet: string;
      goToEmails: string;
    };
  };
  /** Stage groups the hub sections render directly. The retired
   *  single-purpose pages are gone, so only the keys those sections still
   *  read remain. */
  prescan: {
    statusLabel: string;
    scannedAtLabel: string;
    columns: { role: string; status: string };
    roleLabels: Record<'homepage' | 'booking' | 'content', string>;
  };
  score: {
    totalLabel: string;
    computedAtLabel: string;
    breakdownHeading: string;
    breakdownColumns: { component: string; value: string };
    componentLabels: Record<
      | 'render-gap'
      | 'booking-failure'
      | 'axe-critical'
      | 'axe-serious'
      | 'console-errors'
      | 'metrics'
      | 'direct-booking'
      | 'star-rating'
      | 'capacity'
      | 'effectif'
      | 'independence',
      string
    >;
    diffHeading: string;
    diffColumns: { field: string; before: string; after: string };
    diffFromLabel: string;
    diffToLabel: string;
    /** Issue #199: shown instead of the score breakdown when a selected
     *  hotel holds no score at the current version (a hand-added hotel
     *  before its first scan). */
    notScoredHeading: string;
    notScoredBody: string;
    /** Issue #201: shown instead of notScoredBody when the hub can offer
     *  the quick-check action directly (no prescan at all yet). */
    notScoredBodyWithAction: string;
    runQuickCheckAction: string;
  };
  evidence: {
    title: string;
    assetNames: { homepage: string; contact: string };
    /** Issue #92: shown in place of a screenshot whose bytes cannot be
     *  resolved from this machine (swept artifacts, or the quick check ran
     *  elsewhere). */
    unavailable: string;
  };
  /** The hub Aperçu section's status, dates, and confirmations. Publish,
   *  reissue, and the once-only link copy live in
   *  auditDetail.outreachPreview (both sections share them). */
  preview: {
    description: string;
    statusLabel: string;
    publishedLabel: string;
    expiresLabel: string;
    states: Record<'live' | 'revoked' | 'expired' | 'none', string>;
    revokeAction: string;
    publishBlockedNoAudit: string;
    reissueConfirmTitle: string;
    reissueConfirmBody: string;
    revokeConfirmTitle: string;
    revokeConfirmBody: string;
  };
  /** The hub Emails section's generate actions and toasts; the thread
   *  state badge reads labels.thread. */
  outreachThread: {
    description: string;
    generateFirstEmail: string;
    generateFollowUp: string;
    touchLabel: string;
    followUpCreated: string;
    /** One generic refusal toast for every typed refusal code, the same
     *  discipline prospect-detail.tsx already uses for its review action:
     *  the private single-operator console shows one message, not a
     *  per-code table that would have to track two orchestrators' refusal
     *  unions. */
    actionRefused: string;
    actionError: string;
  };
  /** The a-traiter page, the dashboard's landing page and the operator's
   *  prospect-only inbox. */
  aTraiter: {
    title: string;
    description: string;
    /** Column headers of the merged to-do table (plan 045 stage 3.3). */
    table: {
      subjectHeader: string;
      actionHeader: string;
      sinceHeader: string;
    };
    /** Badge label naming which prospect queue a row comes from. */
    kinds: Record<TodoRowKind, string>;
    /** One concrete action per stable code the server returns; never a
     *  ready-made sentence from the API. */
    actions: Record<TodoRowAction, string>;
    /** The muted one-liner the table renders instead of an empty-state
     *  block when every source is empty. */
    empty: string;
    syncMailbox: string;
    syncMailboxDone: string;
    syncMailboxNotConfigured: string;
    syncMailboxFailed: string;
    /** Kept for compatibility with the existing translation shape while
     *  batch entry points remain retired from the prospect-only inbox. */
    batch: {
      draftBatchLabel: string;
      draftBatchButton: string;
      followUpBatchLabel: string;
      followUpBatchButton: string;
      limitLabel: string;
      started: string;
      error: string;
    };
  };
  /** Plan 040 slice 4: the drafts queue page retired into /a-traiter, so
   *  what remains here is the never-send note the inbox carries and the
   *  review dialog the hub's Emails section renders. */
  drafts: {
    approve: string;
    skip: string;
    neverSendNote: string;
    /** Issue #15: read-only dialog with the draft's persisted text. */
    viewText: string;
    textDialogDescription: string;
    textSubjectLabel: string;
    textBodyLabel: string;
    copyButton: string;
    copiedLabel: string;
  };
  suppressions: {
    title: string;
    description: string;
    addressLabel: string;
    addressPlaceholder: string;
    checkButton: string;
    clearButton: string;
    resultSuppressed: string;
    resultNotSuppressed: string;
    hashNote: string;
  };
  outcomes: {
    title: string;
    description: string;
    summaryHeading: string;
    lostReasonsHeading: string;
    columns: { prospect: string; outcome: string; setAt: string };
    optOut: string;
    empty: string;
  };
  /** Pre-authentication page: one shared password, no username. */
  login: {
    title: string;
    passwordLabel: string;
    submit: string;
    submitting: string;
    errorInvalid: string;
    /** {wait} is replaced with a human duration built from the server's
     *  retryAfterSeconds by the page. */
    errorLocked: string;
    /** Unit strings of the {wait} duration, same placeholder style as
     *  common.relativeTime. */
    waitMinutes: string;
    waitMinutesSeconds: string;
    waitSeconds: string;
    /** Shown when the server runs without a password configured. */
    errorNotConfigured: string;
    errorNetwork: string;
  };
  /** FR and EN labels for the closed store vocabularies the operator
   *  pages render. A value missing from a map falls back to the raw
   *  code (lib/vocabulary.ts). */
  labels: {
    identity: Record<'resolved' | 'needs-review' | 'ambiguous' | 'unmatched', string>;
    group: Record<'independent' | 'group-member' | 'vendor-hosted' | 'unknown', string>;
    review: Record<'not-required' | 'pending' | 'accepted' | 'rejected', string>;
    qualification: Record<
      'qualified' | 'parked' | 'rejected' | 'already-engaged' | 'group-routed' | 'not-evaluated',
      string
    >;
    contact: Record<'found' | 'parked' | 'rejected' | 'suppressed', string>;
    /** Why a contact evaluation concluded what it did: core's closed
     *  HotelContactReason vocabulary. A newer store value falls back to the
     *  raw code, like every other map here. */
    contactReason: Record<string, string>;
    /** Whether the address's domain publishes mail exchangers. `unknown` is a
     *  real outcome and its copy must not read as a failure of the hotel. */
    mailDomain: Record<'has-mx' | 'no-mx' | 'unknown', string>;
    /** Where a usable address was found; closed core ContactSourceKind. */
    contactSource: Record<'homepage' | 'mentions-legales' | 'contact-page', string>;
    thread: Record<
      | 'open'
      | 'e1-drafted'
      | 'e1-sent'
      | 'e2-drafted'
      | 'e2-sent'
      | 'e3-drafted'
      | 'e3-sent'
      | 'replied'
      | 'bounced'
      | 'opted-out'
      | 'sequence-complete'
      | 'closed',
      string
    >;
    outcome: Record<
      | 'no-reply'
      | 'reply-positive'
      | 'reply-not-now'
      | 'reply-negative'
      | 'opt-out'
      | 'call'
      | 'quoted'
      | 'won'
      | 'lost',
      string
    >;
    lostReason: Record<
      'budget' | 'timing' | 'not-a-priority' | 'existing-provider' | 'scope-mismatch' | 'other',
      string
    >;
    /** The two halves of a prospect score, named where they are shown. The
     *  store's own field names (`brokenness`, `ability`) used to reach the
     *  operator untranslated in the version-difference table. */
    scoreSide: Record<'brokenness' | 'ability', string>;
    /** Why a score component scored what it did: core's closed
     *  HotelScoreReason vocabulary. Every `*-unknown` value means the fact was
     *  never observed, which is deliberately not the same as observing it
     *  absent, and the copy has to keep those apart. */
    scoreReason: Record<string, string>;
    /** Stakeholder roles of the report-preparation card. Previously read off
     *  the preview's filled-in roles, so an empty role showed its raw English
     *  key to a French operator. */
    stakeholderRole: Record<'management' | 'technical' | 'communications' | 'legal', string>;
  };
  /** One-line plain-language hints of the pipeline stages, shown next to
   *  the vocabulary by InfoTip on operator pages. Each key names the stage
   *  it explains; only stages a rendered InfoTip still explains remain. */
  hints: {
    crawl: string;
    scan: string;
    score: string;
    qualification: string;
    review: string;
  };
  /** Issue #228: the recovery surface an unexpected render/lifecycle error
   *  below the shell falls back to, instead of a blank dashboard. Never
   *  shows the thrown error's own message or stack - only the plain
   *  operator-facing copy below plus the route and a generated incident id. */
  errorBoundary: {
    heading: string;
    description: string;
    retryButton: string;
    reloadButton: string;
    homeButton: string;
    routeLabel: string;
    incidentLabel: string;
    copyButton: string;
    copiedLabel: string;
  };
}
