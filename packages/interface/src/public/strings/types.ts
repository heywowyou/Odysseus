/**
 * Dashboard chrome strings: labels, buttons, headings. A different set
 * from packages/report/src/template/strings (report *content*), needed
 * because CLAUDE.md's "all user-facing strings support French and
 * English from the start" applies to this dashboard too, not only the
 * PDF. fr.ts and en.ts are both typed against this interface, so a field
 * added to one without the other fails to compile.
 */
export interface DashboardStrings {
  nav: {
    newScan: string;
    history: string;
  };
  common: {
    severityLabels: { critical: string; serious: string; moderate: string; minor: string };
    statusLabels: { queued: string; running: string; complete: string; failed: string };
    typeLabels: { fullAudit: string; prospecting: string };
    downloadReport: string;
    viewDetails: string;
    error: string;
    loading: string;
  };
  newScan: {
    heading: string;
    typeLabel: string;
    typeFullAudit: string;
    typeProspecting: string;
    urlLabel: string;
    urlPlaceholder: string;
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
     *  for whatever the behavioral detector still misses (phone-only
     *  booking, messaging flows, patterns not yet seen). Full-audit only,
     *  same reasoning as the SIREN field above. Absent (the "let the tool
     *  detect" option) falls through to detection entirely; the reason
     *  field is only shown once yes/no is picked. */
    transactionalFlowLabel: string;
    transactionalFlowAutoOption: string;
    transactionalFlowYesOption: string;
    transactionalFlowNoOption: string;
    transactionalFlowReasonLabel: string;
    transactionalFlowReasonPlaceholder: string;
    advancedOptions: string;
    maxPagesLabel: string;
    maxDepthLabel: string;
    delayLabel: string;
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
    heading: string;
    crawlPhaseLabel: string;
    scanPhaseLabel: string;
    etaLabel: string;
    etaRoughSuffix: string;
    phaseLabels: {
      queued: string;
      crawl: string;
      scan: string;
      normalize: string;
      'analyze-fr': string;
      'analyze-en': string;
      'report-fr': string;
      'report-en': string;
      scanning: string;
      complete: string;
      failed: string;
    };
    completeHeading: string;
    viewDetailLink: string;
    failedHeading: string;
    urlResultsHeading: string;
  };
  history: {
    heading: string;
    dateColumn: string;
    siteColumn: string;
    typeColumn: string;
    statusColumn: string;
    severityColumn: string;
    emptyState: string;
  };
  auditDetail: {
    heading: string;
    siteLabel: string;
    dateLabel: string;
    pagesVisitedLabel: string;
    findingsHeading: string;
    severityColumn: string;
    categoryColumn: string;
    titleColumn: string;
    occurrencesColumn: string;
    pagesColumn: string;
    reportsHeading: string;
    noReportsYet: string;
    reportFreshness: Record<'fresh' | 'stale' | 'unverified', string>;
    manualFieldsHeading: string;
    manualFieldsHint: string;
    sirenLabel: string;
    sirenCheckButton: string;
    sirenCheckingMessage: string;
    sirenResolvedPrefix: string;
    sirenNotResolvedMessage: string;
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
    saveButton: string;
    savedMessage: string;
    regenerateButton: string;
    regeneratingMessage: string;
    regeneratedMessage: string;
  };
}
