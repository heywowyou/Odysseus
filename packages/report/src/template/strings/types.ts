/**
 * Static report chrome: section headings, table labels, and the fixed
 * methodology/limitations boilerplate. The analysis prose itself
 * (executiveSummary, theme titles, etc.) already arrives in the requested
 * language from @odysseus/llm; this covers everything the template writes
 * on its own, which needs the same fr/en treatment per CLAUDE.md ("all
 * user-facing strings must support French and English from the start").
 *
 * fr.ts and en.ts are both typed against this interface, so a field added
 * to one without the other fails to compile rather than silently shipping
 * an English label inside a French report.
 */
export interface ReportStrings {
  toc: {
    eyebrow: string;
    heading: string;
    items: readonly [
      string, string, string, string, string, string, string,
      string, string, string, string, string, string, string,
    ];
    note: string;
  };
  statistics: {
    eyebrow: string;
    heading: string;
    /** Template: {pages}, {findings}. */
    introTemplate: string;
    pagesTileLabel: string;
    findingsTileLabel: string;
    accessibilityOccurrencesTileLabel: string;
    pagesWithCriticalTileLabel: string;
    criticalTileLabel: string;
    seriousTileLabel: string;
    moderateTileLabel: string;
    minorTileLabel: string;
    /** Template: {pages}. */
    wcagFailingDescriptionTemplate: string;
    accessibilityCategoryTileLabel: string;
    seoRenderingCategoryTileLabel: string;
    legendCriticalText: string;
    legendSeriousText: string;
    legendModerateText: string;
    legendMinorText: string;
  };
  conformanceSummary: {
    eyebrow: string;
    heading: string;
    intro: string;
    criterionColumnLabel: string;
    criterionNameColumnLabel: string;
    findingsColumnLabel: string;
    occurrencesColumnLabel: string;
    pagesMaxColumnLabel: string;
    note: string;
    emptyState: string;
  };
  observations: {
    eyebrow: string;
    heading: string;
    intro: string;
    wrapperTitle: string;
    /** Template: {findingIds}. */
    wrapperBodyTemplate: string;
    legalTitle: string;
    /** Template: {findingIds}. */
    legalBodyTemplate: string;
  };
  cover: {
    reportTitle: string;
    eyebrow: string;
    dateLabel: string;
    pagesScannedLabel: string;
    languageLabel: string;
    wcagReferentialLabel: string;
    riskSmallLabel: string;
    riskLevels: { low: string; medium: string; high: string };
  };
  executiveSummary: {
    eyebrow: string;
    heading: string;
    whatToDoFirstHeading: string;
    /** Template: {rank}. */
    seeThemeTemplate: string;
    quickWinsLabel: string;
    quickWinsSuffix: string;
  };
  /** Promotes methodology's own legal-citation paragraph (rendered via
   *  the exported renderLegalCitationParagraph) to its own page for
   *  visibility, per the 2026-08-16 report redesign. Deliberately does
   *  not add any new legal wording of its own beyond a status label and
   *  a one-line restatement already implied by that paragraph - see
   *  CLAUDE.md rule 6 and trade-off 11: this section must never become a
   *  second, independent source of legal framing. */
  legalExposure: {
    eyebrow: string;
    heading: string;
    eaaDeadlineLabel: string;
    eaaDeadlineValue: string;
    eaaDeadlineNote: string;
    obligationStatusLabel: string;
    statusLabels: {
      in_scope: string;
      likely_in_scope: string;
      out_of_scope: string;
      undetermined: string;
    };
    /** One-line restatement of the status shown in the tile, same hedge
     *  level as methodology's paragraph - never new legal nuance. */
    statusShortDescriptions: {
      in_scope: string;
      likely_in_scope: string;
      out_of_scope: string;
      undetermined: string;
    };
    disclaimerNote: string;
  };
  /** Pure re-presentation of analysis.themes (rank/title/effort/impact/
   *  pages) as a dense, printable table - no new data, no new logic. */
  checklist: {
    eyebrow: string;
    heading: string;
    intro: string;
    rankColumnLabel: string;
    priorityColumnLabel: string;
    effortColumnLabel: string;
    impactColumnLabel: string;
    pagesColumnLabel: string;
  };
  themes: {
    eyebrow: string;
    /** Template: {count}. */
    headingTemplate: string;
    effortLabel: string;
    impactLabel: string;
    conformityLabel: string;
    conformityNotApplicable: string;
    conformityNonConformant: string;
    legalTagLabel: string;
    quickWinBadgeLabel: string;
    effortImpactLevels: { low: string; medium: string; high: string };
    /** Template: {pages}, {pageWord}, {totalPages}. */
    pagesOfTotalTemplate: string;
    refsLabel: string;
  };
  renderDiffEvidence: {
    eyebrow: string;
    heading: string;
    intro: string;
    rawLabel: string;
    renderedLabel: string;
    missingPercentLabel: string;
    noScreenshotAvailable: string;
    /** Template: {healthy}, {total}. */
    healthyPagesSummary: string;
    /** Template: {raw}, {rendered}. */
    visibleTextCountsTemplate: string;
    visibleTextCountsNotAvailable: string;
    /** Template: {url}, {chars}. */
    altRawTemplate: string;
    /** Template: {url}, {chars}. */
    altRenderedTemplate: string;
    /** Template: {n}. */
    altCharsKnownTemplate: string;
    altCharsUnknown: string;
  };
  coreWebVitals: {
    eyebrow: string;
    heading: string;
    intro: string;
    inpNote: string;
    pageColumnLabel: string;
    lcpColumnLabel: string;
    clsColumnLabel: string;
    tbtColumnLabel: string;
    notMeasured: string;
    ratingGoodLabel: string;
    ratingNeedsImprovementLabel: string;
    ratingPoorLabel: string;
    /** Fixed threshold values, not a template: LCP/CLS/TBT "good" band. */
    legendGoodTemplate: string;
    /** Fixed threshold values: LCP/CLS/TBT "needs improvement" band. */
    legendMidTemplate: string;
    legendPoorLabel: string;
  };
  /** Per-criterion status is trivially derived, never a legal judgment:
   *  buildConformanceRollup only ever lists a criterion when at least one
   *  finding failed it, so "non conformant" is a restatement of that
   *  fact, not a new determination (same reasoning conformance-summary.ts
   *  already documents for its own rows). */
  accessibilityStatement: {
    eyebrow: string;
    heading: string;
    intro: string;
    criterionColumnLabel: string;
    statusColumnLabel: string;
    nonConformantPartialLabel: string;
    contactHeading: string;
    contactBody: string;
    remediationPlanHeading: string;
    remediationPlanBody: string;
  };
  glossary: {
    eyebrow: string;
    heading: string;
    terms: readonly { term: string; definition: string }[];
  };
  nextSteps: {
    eyebrow: string;
    heading: string;
    questionTitle: string;
    questionBody: string;
    reauditTitle: string;
    reauditBody: string;
    postFixTitle: string;
    postFixBody: string;
  };
  findingsAppendix: {
    eyebrow: string;
    heading: string;
    intro: string;
    categoryLabels: {
      accessibility: string;
      seo: string;
      geo: string;
      performance: string;
      rendering: string;
    };
    severityLabels: {
      critical: string;
      serious: string;
      moderate: string;
      minor: string;
    };
    findingIdColumnLabel: string;
    pagesColumnLabel: string;
    pagesMaxColumnLabel: string;
    occurrencesColumnLabel: string;
    selectorColumnLabel: string;
    ruleColumnLabel: string;
    findingSingular: string;
    findingPlural: string;
    occurrenceSingular: string;
    occurrencePlural: string;
    pageSingular: string;
    pagePlural: string;
    upToLabel: string;
    wcagLabel: string;
    minorAggregateTitle: string;
    minorAggregateGroupedSuffix: string;
    minorAggregateNote: string;
    observationsCrossRefLabel: string;
  };
  methodology: {
    eyebrow: string;
    heading: string;
    /** Template: {axeVersion}, {lighthouseVersion}, {pages}, {date}. */
    toolingParagraphTemplate: string;
    /** brief section 6.6: the well-documented ~30-40% automated coverage
     *  figure, stated in every report, not only accessibility audits. */
    automatedCoverageCaveat: string;
    /** Entity-layer milestone: replaces the old single legalCitationParagraph
     *  hedge with a status-branched determination, code-rendered from
     *  ObligationAssessment (@odysseus/core's assessObligations), never
     *  written by the LLM. Template: {regimeName}, {authority},
     *  {legalCitation}, {facts}. */
    legalCitationInScopeTemplate: string;
    /** Same placeholders as legalCitationInScopeTemplate, softened
     *  framing for the case where assessObligations ran without
     *  SiteSignals (the B2C transactional-flow gate unconfirmed). */
    legalCitationLikelyInScopeTemplate: string;
    /** Fixed: an out_of_scope determination states the facts used but has
     *  no regime, authority, or citation to name. */
    legalCitationOutOfScopeParagraph: string;
    /** The pre-milestone hedge, moved here verbatim, unchanged. Rendered
     *  for status 'undetermined' and for any audit predating this
     *  milestone (manifest.siteSignals absent, or no analysis.
     *  obligationAssessment at all). No legal-exposure verdict here, per
     *  CLAUDE.md rule 6: state the criterion, never assert a law applies
     *  to this business when the determination itself could not run. */
    legalCitationUndeterminedParagraph: string;
    /** Template: {label}, the effectif band's human-readable text. */
    legalCitationEffectifFactTemplate: string;
    /** Template: {threshold}, a formatted currency amount. */
    legalCitationTurnoverFactTemplate: string;
    legalCitationTransactionalFlowFact: string;
    legalCitationTransactionalFlowUnknownFact: string;
    /** The only documented exemption route (Demarche Simplifiee), stated
     *  once per report per the milestone's acceptance criteria, appended
     *  after legalCitationInScopeTemplate/legalCitationLikelyInScopeTemplate. */
    legalCitationExemptionRouteSentence: string;
    /** Manual-SIREN milestone: appended after the main paragraph
     *  (whichever status it is) when the SIREN used came from a manual
     *  override rather than the site's own mentions-legales page, and a
     *  matching LCEN finding exists to reference. Template: {findingId}. */
    legalCitationManualSirenWithFindingTemplate: string;
    /** Same case, but no LCEN finding exists to reference - the site
     *  published an RCS or TVA number without a SIREN, so the check did
     *  not fire, yet a manual SIREN was still supplied. */
    legalCitationManualSirenNoFindingSentence: string;
    /** Both numbers stated, no editorializing about which is "correct" -
     *  a mismatch can mean the site is operated by a different legal
     *  entity than the one being audited. Template: {manualSiren},
     *  {extractedSiren}. */
    legalCitationSirenMismatchTemplate: string;
  };
  footer: {
    confidentialityLabel: string;
    pageLabel: string;
  };
}
