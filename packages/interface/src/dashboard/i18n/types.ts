import type { JobStatus } from '../lib/api-types';
import type { ProgressPhase } from '../lib/phase-order';

export type DashboardLanguage = 'fr' | 'en';

export interface DashboardStrings {
  nav: {
    audits: string;
    newScan: string;
    prospects: string;
    /** Sidebar label for /outreach, plan 040's "A traiter" (operator decision
     *  2026-09-12): the URL is unchanged until slice 6 rebuilds it as the
     *  landing page. */
    outreach: string;
    /** Sidebar label for /outreach/outcomes, kept at its current URL until
     *  slice 6 renames it to /resultats. */
    results: string;
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
    /** Footer link to the do-not-contact lookup (/outreach/do-not-contact). */
    checkAddress: string;
  };
  common: {
    severityLabels: { critical: string; serious: string; moderate: string; minor: string };
    statusLabels: Record<JobStatus, string>;
    /** camelCase keys mirror the API job types displayed by the dashboard. */
    typeLabels: { fullAudit: string; prospecting: string; hotelPrescan: string };
    downloadReport: string;
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
    kpiCritical: string;
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
    typeProspecting: string;
    urlLabel: string;
    urlPlaceholder: string;
    /** Shown when a non-empty URL is not an absolute http(s) URL without
     *  embedded credentials, the shape routes/scans.ts accepts. */
    urlInvalidError: string;
    urlsLabel: string;
    urlsPlaceholder: string;
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
    /** Operator copy per pipeline phase, keyed by the vocabulary derived
     *  from the checked-in order fixture (lib/phase-order.ts), so a phase
     *  added there fails to compile until both languages cover it. */
    phaseLabels: Record<ProgressPhase, string>;
    completeHeading: string;
    viewDetailLink: string;
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
  };
  auditDetail: {
    title: string;
    description: string;
    siteLabel: string;
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
    approveReportsButton: string;
    approvingReportsMessage: string;
    reportsApprovedMessage: string;
    previewReport: string;
    approvedDownload: string;
    /** Shown when a mutation (save, regenerate, approve) fails. */
    actionError: string;
    manualFieldsHeading: string;
    manualFieldsHint: string;
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
    confirmDetectedFieldsButton: string;
    saveButton: string;
    savedMessage: string;
    regenerateButton: string;
    regeneratingMessage: string;
    regeneratedMessage: string;
    confirmApproveTitle: string;
    confirmApproveBody: string;
    notFound: string;
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
    /** Plan 040 slice 5: an audit linked to a prospect manages its preview
     *  from the hotel hub; this one line points there. */
    previewManagedFromProspect: string;
    /** Plan 040 slice 5: the client-report stepper, one button per step,
     *  each step unlocked by the previous one. */
    stepper: {
      heading: string;
      description: string;
      steps: Record<'prepare' | 'redact' | 'choose' | 'produce' | 'approve', string>;
      stepDone: string;
      stepTodo: string;
      /** Step 1's preparation half when the report-preparation view cannot
       *  be loaded (never created, or a failed request). */
      unavailable: string;
      /** Step 4's button; the step itself is titled differently. */
      produceButton: string;
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
    /** Shown when the findings table has no rows, overall or at the
     *  selected severity. */
    findingsEmpty: string;
    /** Localized names of the finding categories; an unknown category
     *  falls back to its raw code. */
    categoryLabels: Record<
      'accessibility' | 'seo' | 'geo' | 'performance' | 'rendering' | 'privacy',
      string
    >;
    /** Plan 037 slice 5: the outreach preview card. Rendered on every
     *  audit; the endpoints decide readiness. refusalReasons maps each of
     *  the server's stable refusal codes to one short sentence; an
     *  unknown code falls back to unavailableWithReason carrying the raw
     *  code, deliberately untranslated. */
    outreachPreview: {
      title: string;
      description: string;
      viewScorecard: string;
      hideScorecard: string;
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
      publishConfirmTitle: string;
      publishConfirmBody: string;
      linkOnceTitle: string;
      linkOnceWarning: string;
      linkCopy: string;
      linkCopied: string;
      linkConfirmButton: string;
      revokeAction: string;
      revokeConfirmTitle: string;
      revokeConfirmBody: string;
      revokedMessage: string;
      draftAction: string;
      draftCreatedMessage: string;
      draftNeedsPreviewHint: string;
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
    exclusionNoVisitedPages: string;
    exclusionNoTransactionalFlow: string;
    exclusionNoTransactionalPageVisited: string;
    exclusionEvidenceUnavailable: string;
    warningsHeading: string;
    warningCommercialName: string;
    warningSituation: string;
    warningTrigger: string;
    warningJourneyScope: string;
    confirmWarningsButton: string;
    confirmWarningsFirstHint: string;
    warningsConfirmedLabel: string;
    previewHeading: string;
    previewAutomaticLabel: string;
    previewCustomLabel: string;
    previewFallbackLabel: string;
    saveButton: string;
    savedMessage: string;
    writingHeading: string;
    selectedWritingLabel: string;
    candidateReadyLabel: string;
    candidateFailedLabel: string;
    candidateSelectedLabel: string;
    candidatePreviewLabel: string;
    approveCandidateButton: string;
    regenerateButton: string;
    confirmRegenerateTitle: string;
    confirmRegenerateBody: string;
    regeneratingMessage: string;
    approvedMessage: string;
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
    confirmAcceptTitle: string;
    confirmAcceptBody: string;
    confirmRejectTitle: string;
    confirmRejectBody: string;
    /** Shown when a prospect action fails. */
    actionError: string;
    provenanceLabel: string;
    notFound: string;
    backToProspects: string;
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
    columns: {
      name: string;
      city: string;
      identity: string;
      group: string;
      qualification: string;
      review: string;
      score: string;
      contact: string;
      thread: string;
      outcome: string;
    };
    openDetail: string;
    filterEmpty: string;
  };
  prospectDetail: {
    /** The page title is the hotel name; this stands in while the name
     *  is loading and on the placeholder page. */
    fallbackTitle: string;
    description: string;
    sections: Record<
      | 'catalogue'
      | 'identity'
      | 'qualification'
      | 'prescan'
      | 'score'
      | 'evidence'
      | 'contact'
      | 'preview'
      | 'thread'
      | 'outcome',
      string
    >;
    openPrescan: string;
    openScore: string;
    openEvidence: string;
    openPreview: string;
    openOutreach: string;
    openSite: string;
    launchAudit: string;
    startOutreachScan: string;
    outreachScanQueued: string;
    outreachScanRefused: string;
    sourcesHeading: string;
    sources: {
      field: string;
      value: string;
      source: string;
      status: string;
      chosen: string;
    };
    qualificationHeading: string;
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
    threadHeading: string;
    thread: { state: string; touch: string; lastEventAt: string };
    outcomeHeading: string;
    outcomeNone: string;
    catalogue: {
      name: string;
      city: string;
      department: string;
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
    steps: Record<'fiche' | 'quick-check' | 'audit' | 'preview' | 'emails' | 'outcome', string>;
    stepStates: Record<'done' | 'active' | 'todo' | 'blocked', string>;
    /** The header's one primary action, chosen by state (review and the
     *  terminal refusal excepted: review reuses operator.accept, a refusal
     *  is a sentence, not a button). */
    primary: {
      startScan: string;
      seeProgress: string;
      publish: string;
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
    fiche: {
      starsLabel: string;
      roomsLabel: string;
      capacityLabel: string;
      /** Disclosure holding the internal identifiers and version codes. */
      technicalDetails: string;
      hideTechnicalDetails: string;
      /** Re-opens the accept/reject decision after it was recorded. */
      changeDecision: string;
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
    };
    audit: {
      empty: string;
      running: string;
      openAudit: string;
      stageLabel: string;
    };
    emails: {
      /** {n} is the follow-up number: Relance 1, Relance 2. */
      followUpName: string;
      firstEmailName: string;
      needsReviewNotice: string;
      noPendingDraft: string;
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
    };
  };
  prescan: {
    title: string;
    description: string;
    statusLabel: string;
    scannedAtLabel: string;
    vendorLabel: string;
    pagesHeading: string;
    columns: { url: string; role: string; status: string };
    roleLabels: Record<'homepage' | 'booking' | 'content', string>;
    bookingKindLabels: Record<
      | 'checkout-form'
      | 'payment-embed'
      | 'booking-engine-script'
      | 'booking-engine-domain-reference'
      | 'booking-iframe',
      string
    >;
    empty: string;
  };
  score: {
    title: string;
    description: string;
    totalLabel: string;
    versionLabel: string;
    computedAtLabel: string;
    breakdownHeading: string;
    /** {x} is the problems-found total, {y} the ability-to-fix total. */
    breakdownSummary: string;
    breakdownColumns: { component: string; value: string; weight: string; why: string };
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
    empty: string;
  };
  evidence: {
    title: string;
    description: string;
    assetNames: { homepage: string; contact: string };
    columns: { asset: string; capturedAt: string; sourceUrl: string; status: string };
    /** Issue #92: shown in place of a screenshot whose bytes cannot be
     *  resolved from this machine (swept artifacts, or the quick check ran
     *  elsewhere). */
    unavailable: string;
    empty: string;
  };
  preview: {
    title: string;
    description: string;
    statusLabel: string;
    publishedLabel: string;
    expiresLabel: string;
    states: Record<'live' | 'revoked' | 'expired' | 'none', string>;
    openPublic: string;
    rendererNote: string;
    /** Plan 037: creating a new preview moved to the audit detail page;
     *  this page keeps the legacy records and their revocation only. */
    retiredNote: string;
    showCurrentPreview: string;
    hideCurrentPreview: string;
    currentPreviewNote: string;
    currentPreviewUnavailable: string;
    currentPreviewError: string;
    /** Issue #97: the three publication actions. Re-issue is the same
     *  publish endpoint called when a preview already exists; only the
     *  copy differs. */
    publishAction: string;
    reissueAction: string;
    revokeAction: string;
    publishConfirmTitle: string;
    publishConfirmBody: string;
    reissueConfirmTitle: string;
    reissueConfirmBody: string;
    revokeConfirmTitle: string;
    revokeConfirmBody: string;
    actionRefused: string;
    actionError: string;
    /** The once-only display of a freshly published bearer link. */
    linkOnceTitle: string;
    linkOnceWarning: string;
    linkCopy: string;
    linkCopied: string;
    linkConfirmButton: string;
    empty: string;
  };
  outreachThread: {
    title: string;
    description: string;
    noThread: string;
    generateFirstEmail: string;
    generateFollowUp: string;
    stateLabel: string;
    touchLabel: string;
    states: Record<
      'e1-drafted' | 'e1-sent' | 'e2-drafted' | 'e2-sent' | 'e3-drafted' | 'e3-sent' | 'closed',
      string
    >;
    draftCreated: string;
    followUpCreated: string;
    /** One generic refusal toast for every typed refusal code, the same
     *  discipline prospect-detail.tsx already uses for its review action:
     *  the private single-operator console shows one message, not a
     *  per-code table that would have to track two orchestrators' refusal
     *  unions. */
    actionRefused: string;
    actionError: string;
  };
  outreachIndex: {
    title: string;
    description: string;
    cards: {
      draftsTitle: string;
      draftsDescription: string;
      repliesTitle: string;
      repliesDescription: string;
      suppressionsTitle: string;
      suppressionsDescription: string;
      outcomesTitle: string;
      outcomesDescription: string;
    };
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
  drafts: {
    title: string;
    description: string;
    columns: {
      prospect: string;
      touch: string;
      createdAt: string;
      providerState: string;
      reviewState: string;
    };
    approve: string;
    skip: string;
    neverSendNote: string;
    empty: string;
    /** Issue #15: read-only dialog with the draft's persisted text. The
     *  meta labels (touch, created date) reuse the column names above so
     *  the table and the dialog cannot drift apart. */
    viewText: string;
    textDialogDescription: string;
    textRecipientLabel: string;
    textSubjectLabel: string;
    textBodyLabel: string;
    copyButton: string;
    copiedLabel: string;
  };
  replies: {
    title: string;
    description: string;
    columns: { prospect: string; receivedAt: string; state: string; reason: string };
    markReviewed: string;
    metadataNote: string;
    empty: string;
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
      'qualified' | 'parked' | 'rejected' | 'already-engaged' | 'group-routed',
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
   *  it explains, in pipeline order. */
  hints: {
    crawl: string;
    scan: string;
    prescan: string;
    score: string;
    evidence: string;
    preview: string;
    outreach: string;
    qualification: string;
    review: string;
  };
}
