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
    advancedOptions: string;
    maxPagesLabel: string;
    maxDepthLabel: string;
    delayLabel: string;
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
  };
}
