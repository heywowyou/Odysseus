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
    prospects: string;
    outreach: string;
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
    /** Shown when audits exist but no row survives search and filters. */
    emptyFilter: string;
    /** Accessible name of the sort select; the options carry the visible
     *  copy. */
    sortLabel: string;
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
    /** Default option of the findings severity filter. */
    findingsFilterAll: string;
    /** Shown when the findings table has no rows, overall or at the
     *  selected severity. */
    findingsEmpty: string;
  };
  /** Shared operator-interface strings (plan 013): pagination, review
   *  actions, and detail-page navigation used by several pages. */
  operator: {
    paginationPrevious: string;
    paginationNext: string;
    /** {page} and {pages} are replaced with counts by the page. */
    paginationPageOf: string;
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
  prescan: {
    title: string;
    description: string;
    statusLabel: string;
    scannedAtLabel: string;
    vendorLabel: string;
    pagesHeading: string;
    columns: { url: string; role: string; status: string };
    empty: string;
  };
  score: {
    title: string;
    description: string;
    totalLabel: string;
    versionLabel: string;
    computedAtLabel: string;
    breakdownHeading: string;
    breakdownColumns: { component: string; value: string; weight: string; why: string };
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
    empty: string;
  };
  vendors: {
    title: string;
    description: string;
    columns: { vendor: string; candidates: string; failures: string; failureRate: string };
    empty: string;
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
  };
  drafts: {
    title: string;
    description: string;
    columns: {
      hotel: string;
      touch: string;
      createdAt: string;
      providerState: string;
      reviewState: string;
    };
    approve: string;
    skip: string;
    neverSendNote: string;
    empty: string;
  };
  replies: {
    title: string;
    description: string;
    columns: { hotel: string; receivedAt: string; state: string; reason: string };
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
    columns: { hotel: string; outcome: string; setAt: string };
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
  };
}
