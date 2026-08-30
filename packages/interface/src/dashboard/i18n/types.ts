import type { JobStatus } from '../lib/api-types';

export type DashboardLanguage = 'fr' | 'en';

/** Copy for one dashboard page: the header block shown by PageHeader. */
export interface PageCopy {
  title: string;
  description: string;
}

export interface DashboardStrings {
  nav: {
    audits: string;
    newScan: string;
  };
  shell: {
    tagline: string;
    navigation: string;
    openMenu: string;
    closeMenu: string;
    language: string;
  };
  common: {
    severityLabels: { critical: string; serious: string; moderate: string; minor: string };
    statusLabels: Record<JobStatus, string>;
    /** camelCase keys (the ported string-table shape); pages map the API's
     *  'full-audit' value to `fullAudit`. */
    typeLabels: { fullAudit: string; prospecting: string };
    downloadReport: string;
    viewDetails: string;
    error: string;
    loading: string;
    retry: string;
    cancel: string;
    /** Shown by stub routes only; removed once every page is rebuilt. */
    comingSoon: string;
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
  };
  audits: {
    title: string;
    description: string;
    emptyState: string;
    emptyStateCta: string;
    dateColumn: string;
    siteColumn: string;
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
  };
  newScan: {
    title: string;
    description: string;
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
    title: string;
    description: string;
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
    notFound: string;
  };
  auditDetail: {
    title: string;
    description: string;
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
    confirmApproveTitle: string;
    confirmApproveBody: string;
    notFound: string;
  };
}
