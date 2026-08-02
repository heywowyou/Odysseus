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
  cover: {
    reportTitle: string;
    dateLabel: string;
  };
  executiveSummary: {
    heading: string;
    overallRiskLabel: string;
    riskLevels: { low: string; medium: string; high: string };
  };
  whatToDoFirst: {
    heading: string;
    intro: string;
  };
  themes: {
    heading: string;
    priorityLabel: string;
    effortLabel: string;
    impactLabel: string;
    legalRelevanceLabel: string;
    recommendedActionsLabel: string;
    affectedPagesLabel: string;
    effortImpactLevels: { low: string; medium: string; high: string };
  };
  renderDiffEvidence: {
    heading: string;
    intro: string;
    rawLabel: string;
    renderedLabel: string;
    missingPercentLabel: string;
    noScreenshotAvailable: string;
  };
  coreWebVitals: {
    heading: string;
    intro: string;
    pageColumnLabel: string;
    lcpColumnLabel: string;
    clsColumnLabel: string;
    tbtColumnLabel: string;
    notMeasured: string;
  };
  findingsAppendix: {
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
    ruleColumnLabel: string;
    pagesColumnLabel: string;
    occurrencesColumnLabel: string;
    wcagColumnLabel: string;
  };
  methodology: {
    heading: string;
    toolingIntro: string;
    axeVersionLabel: string;
    lighthouseVersionLabel: string;
    wcagTagSetLabel: string;
    /** brief section 6.6: the well-documented ~30-40% automated coverage
     *  figure, stated in every report, not only accessibility audits. */
    automatedCoverageCaveat: string;
  };
  limitations: {
    heading: string;
    /** brief section 6.6 restated for the client: keyboard navigation,
     *  focus order, alt text quality, form error handling, and media
     *  captions require manual checking. No legal-exposure verdict here,
     *  per CLAUDE.md rule 6: state the criterion, never assert a law
     *  applies to this business. */
    body: string;
  };
}
