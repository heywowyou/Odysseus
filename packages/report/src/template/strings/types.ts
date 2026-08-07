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
    items: readonly [string, string, string, string, string, string, string, string, string];
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
  findingsAppendix: {
    eyebrow: string;
    heading: string;
    intro: string;
    categoryLabels: {
      accessibility: string;
      seo: string;
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
    /** Manual site-signal override milestone: mirrors
     *  legalCitationManualSirenWithFindingTemplate's role but for
     *  hasTransactionalFlow - appended after the main paragraph when the
     *  auditor manually asserted the site's transactional-flow status
     *  rather than relying on the automated detector. Template: {reason}. */
    legalCitationManualTransactionalFlowWithReasonTemplate: string;
    /** Same case, no reason supplied. */
    legalCitationManualTransactionalFlowNoReasonSentence: string;
    /** Appended after either of the two above only when the manual
     *  override actually disagreed with the detector - stated plainly,
     *  no editorializing about which is "correct". */
    legalCitationTransactionalFlowDisagreementSentence: string;
  };
  footer: {
    confidentialityLabel: string;
    pageLabel: string;
  };
}
