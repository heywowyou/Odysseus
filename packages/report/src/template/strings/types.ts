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
    /** brief section 6.6 restated for the client, merged with the old
     *  standalone "limitations" section per docs/report-v2-refactor.md
     *  B15 (the two duplicated near-verbatim). No legal-exposure verdict
     *  here, per CLAUDE.md rule 6: state the criterion, never assert a
     *  law applies to this business. */
    legalCitationParagraph: string;
  };
  footer: {
    confidentialityLabel: string;
    pageLabel: string;
  };
}
