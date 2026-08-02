import type { ReportStrings } from './types.js';

export const en: ReportStrings = {
  cover: {
    reportTitle: 'Audit report',
    dateLabel: 'Audit date',
  },
  executiveSummary: {
    heading: 'Executive summary',
    overallRiskLabel: 'Overall risk level',
    riskLevels: { low: 'Low', medium: 'Medium', high: 'High' },
  },
  whatToDoFirst: {
    heading: 'What to do first',
    intro: 'What deserves your attention first, explained plainly, without technical jargon.',
  },
  themes: {
    heading: 'Priorities',
    priorityLabel: 'Priority',
    effortLabel: 'Estimated effort',
    impactLabel: 'Estimated impact',
    legalRelevanceLabel: 'Regulatory framework involved',
    recommendedActionsLabel: 'Recommended actions',
    affectedPagesLabel: 'Affected pages',
    effortImpactLevels: { low: 'Low', medium: 'Medium', high: 'High' },
  },
  renderDiffEvidence: {
    heading: 'Raw versus rendered',
    intro:
      'What a search engine receives before JavaScript runs, compared with what a visitor actually sees.',
    rawLabel: 'Raw view (no JavaScript)',
    renderedLabel: 'Rendered view (after JavaScript runs)',
    missingPercentLabel: 'Content missing from the raw view',
    noScreenshotAvailable: 'No screenshot available for this page',
  },
  coreWebVitals: {
    heading: 'Performance signals (Core Web Vitals)',
    intro:
      'Loading speed and visual stability measurements, page by page. These numbers come from a lab test and can vary from one run to another.',
    pageColumnLabel: 'Page',
    lcpColumnLabel: 'LCP (main content load time)',
    clsColumnLabel: 'CLS (visual stability)',
    tbtColumnLabel: 'TBT (blocking time)',
    notMeasured: 'Not measured',
  },
  findingsAppendix: {
    heading: 'Appendix: full findings list',
    intro:
      'Every finding detected by the automated tools, including those judged minor and not carried into the priorities above.',
    categoryLabels: {
      accessibility: 'Accessibility',
      seo: 'Search engine visibility (SEO)',
      performance: 'Performance',
      rendering: 'Rendering',
    },
    severityLabels: {
      critical: 'Critical',
      serious: 'Serious',
      moderate: 'Moderate',
      minor: 'Minor',
    },
    ruleColumnLabel: 'Rule',
    pagesColumnLabel: 'Pages',
    occurrencesColumnLabel: 'Occurrences',
    wcagColumnLabel: 'WCAG criteria',
  },
  methodology: {
    heading: 'Methodology',
    toolingIntro:
      'This audit combines several automated detection tools, all deterministic: no finding is invented or guessed.',
    axeVersionLabel: 'Accessibility engine (axe-core), version',
    lighthouseVersionLabel: 'Performance engine (Lighthouse), version',
    wcagTagSetLabel: 'Conformance level audited: WCAG 2.2, level AA',
    automatedCoverageCaveat:
      'Automated tools detect a well-documented but limited share of accessibility issues, commonly estimated between 30 and 40 percent. Keyboard navigation, focus order, alt text quality, form error handling, and video captions require manual checking, performed separately from this automated analysis.',
  },
  limitations: {
    heading: 'Limitations of this audit',
    body:
      'This audit relies on automated detection tools and the criteria they actually cover. Some aspects of accessibility and conformance require additional human verification, not covered automatically: keyboard navigation, focus order, alt text quality, form error handling, video captions. This report cites the relevant technical criteria (WCAG 2.2, EN 301 549) without asserting whether a specific legal obligation applies to your business, which depends on its size and sector.',
  },
};
