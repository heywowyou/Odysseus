import type { ReportStrings } from './types.js';

export const en: ReportStrings = {
  toc: {
    eyebrow: 'Contents',
    heading: "What's in this report",
    items: [
      'The audit in numbers',
      'Summary and priority actions',
      'Accessibility conformance, WCAG 2.2 level AA',
      'Ranked priorities',
      'Observations outside the ranking',
      'Render evidence: what search engines see',
      'Performance measurements',
      'Appendix: full findings list',
      'Methodology and limitations',
    ],
    itemsScreening: [
      'The audit in numbers',
      'Executive summary',
      'Key findings',
      'Methodology and limitations',
    ],
    note: "Page numbers appear in the footer and in the PDF file's bookmarks.",
  },
  statistics: {
    eyebrow: '1 · The audit in numbers',
    heading: 'What the analysis found',
    introTemplate:
      '{pages} pages analyzed, {findings} distinct findings after collapsing repeats. A finding present on several pages counts once.',
    pagesTileLabel: 'pages analyzed',
    findingsTileLabel: 'distinct findings',
    accessibilityOccurrencesTileLabel: 'accessibility occurrences',
    pagesWithCriticalTileLabel: 'pages with at least one critical finding',
    criticalTileLabel: 'critical',
    seriousTileLabel: 'serious',
    moderateTileLabel: 'moderate',
    minorTileLabel: 'minor',
    wcagFailingDescriptionTemplate: 'WCAG 2.2 AA criteria failing across {pages} pages',
    accessibilityCategoryTileLabel: 'accessibility',
    seoRenderingCategoryTileLabel: 'SEO and rendering',
    legendCriticalText: 'blocks visitors or indexing',
    legendSeriousText: 'severely degrades usability or conformance',
    legendModerateText: 'worth fixing, not urgent',
    legendMinorText: 'optimization',
  },
  conformanceSummary: {
    eyebrow: '3 · Accessibility conformance',
    heading: 'WCAG 2.2 level AA criteria failing',
    intro:
      'The criteria below belong to the WCAG 2.2 level AA standard, which the EN 301 549 European standard references. A failing criterion is a conformance gap, not a design preference. This report cites the relevant criteria without asserting whether a specific legal obligation applies to your business, which depends on its size and sector.',
    criterionColumnLabel: 'Criterion',
    criterionNameColumnLabel: 'Name',
    findingsColumnLabel: 'Findings',
    occurrencesColumnLabel: 'Occurrences',
    pagesMaxColumnLabel: 'Pages (max)',
    note: "This page can be handed to your developer, agency, or legal counsel as-is. Each row links back to the appendix's detailed findings.",
    emptyState: 'No WCAG 2.2 level AA criteria failing were detected on this site.',
  },
  observations: {
    eyebrow: '5 · Observations',
    heading: 'Findings outside the ranking',
    intro: "These findings are real but don't call for a typical fix: the right response is a decision, not a correction.",
    wrapperTitle: 'Third-party content wrapper pages',
    wrapperBodyTemplate:
      "These pages are wrappers displaying a third-party platform's content: their content is almost entirely absent from the raw HTML. Typical fixes don't apply to third-party content. The useful decision is choosing between a direct link to the platform, a deliberate noindex, or removing these pages. Findings involved: {findingIds}.",
    legalTitle: 'Legal pages excluded from indexing',
    legalBodyTemplate:
      "These pages (terms and conditions, cookie policy, privacy policy, or similar) carry a noindex directive. This is a common and often deliberate setup for this kind of page: no corrective action is recommended by default, just confirm the choice is intentional. Findings involved: {findingIds}.",
  },
  cover: {
    reportTitle: 'Audit report',
    eyebrow: 'Visibility and accessibility audit',
    dateLabel: 'Audit date',
    pagesScannedLabel: 'Scope analyzed',
    languageLabel: 'Report language',
    wcagReferentialLabel: 'Standard audited',
    riskSmallLabel: 'Overall risk level',
    riskLevels: { low: 'Low', medium: 'Medium', high: 'High' },
    tierLabels: { screening: 'Screening report', full: 'Full audit report' },
  },
  executiveSummary: {
    eyebrow: '2 · Summary',
    heading: 'What to take away',
    whatToDoFirstHeading: 'To address first',
    seeThemeTemplate: 'See priority {rank}.',
    quickWinsLabel: 'Quick wins',
    quickWinsSuffix: 'low effort, immediate effect',
  },
  screeningFindings: {
    eyebrow: '3 · Key findings',
    heading: 'Critical and serious findings',
    intro:
      'The findings below are the ones with the most direct impact on your visitors, on search engine indexing, or on legal conformance. This screening report names and counts each issue without exact page locations, HTML selectors, or remediation guidance.',
    noneFoundNote: 'No critical or serious findings were detected on this site.',
    upgradeNote:
      'This screening report shows that these issues exist. The full audit report adds the exact page and element for every finding, plus step by step remediation guidance.',
    extendedPassHeading: 'Extended accessibility pass',
    extendedPassIntro:
      'This audit also includes an extended accessibility pass covering keyboard navigation, focus order, form error handling, video caption presence, and a heuristic red flag for alt text quality. Results below as counts only.',
    extendedPassNoneFoundNote: 'No extended accessibility pass issues were detected on this site.',
    extendedPassCountTemplate: '{count} {label} detected across the site',
    extendedPassRuleLabels: {
      keyboardTrap: { singular: 'keyboard trap', plural: 'keyboard traps' },
      focusOrderMismatch: { singular: 'confusing tab order issue', plural: 'confusing tab order issues' },
      formErrorNotAssociated: {
        singular: 'form with inaccessible error handling',
        plural: 'forms with inaccessible error handling',
      },
      videoMissingCaptions: { singular: 'video missing captions', plural: 'videos missing captions' },
      altTextQualityHeuristic: {
        singular: 'low quality alt text red flag',
        plural: 'low quality alt text red flags',
      },
    },
  },
  themes: {
    eyebrow: '4 · Priorities',
    headingTemplate: '{count} priorities, ranked by effort and impact',
    effortLabel: 'Effort',
    impactLabel: 'Business impact',
    conformityLabel: 'Conformance',
    conformityNotApplicable: 'Not applicable',
    conformityNonConformant: 'Non-conformant',
    legalTagLabel: 'Conformance requirement',
    quickWinBadgeLabel: 'Quick win',
    effortImpactLevels: { low: 'Low', medium: 'Medium', high: 'High' },
    pagesOfTotalTemplate: '{pages} {pageWord} of {totalPages}',
    refsLabel: 'Findings',
  },
  renderDiffEvidence: {
    eyebrow: '6 · Render evidence',
    heading: 'What a search engine receives before JavaScript runs',
    intro:
      'Every page is loaded twice: once with no JavaScript, the way a basic indexing crawler does, once in a full browser. The difference measures content invisible to search engines.',
    rawLabel: 'Raw view (no JavaScript)',
    renderedLabel: 'Rendered view (after JavaScript runs)',
    missingPercentLabel: 'Content missing from the raw view',
    noScreenshotAvailable: 'No screenshot available for this page',
    healthyPagesSummary: '{healthy} of {total} pages are healthy: no content missing from the raw view.',
    visibleTextCountsTemplate:
      'Visible text: {raw} characters in the raw view versus {rendered} after rendering',
    visibleTextCountsNotAvailable:
      'Character counts not measured for this page (missing-content percentage below the detection threshold).',
    altRawTemplate: 'Raw view of {url}: {chars}',
    altRenderedTemplate: 'Rendered view of {url}: {chars}',
    altCharsKnownTemplate: '{n} characters of visible text',
    altCharsUnknown: 'character count not measured',
  },
  coreWebVitals: {
    eyebrow: '7 · Performance measurements',
    heading: 'Speed and visual stability, page by page',
    intro:
      'Lab measurements taken with Lighthouse on a simulated mobile profile, with network and CPU throttling. This profile represents an entry-level phone on an average network: on a computer with a good connection, real times are noticeably shorter, but the ranking between pages stays representative. LCP and CLS are Core Web Vitals; TBT is a lab metric that approximates responsiveness.',
    inpNote: 'Real-world responsiveness (INP) requires visitor data and cannot be measured by an automated scan.',
    pageColumnLabel: 'Page',
    lcpColumnLabel: 'LCP, main content',
    clsColumnLabel: 'CLS, visual stability',
    tbtColumnLabel: 'TBT, blocking time',
    notMeasured: 'Not measured',
    ratingGoodLabel: 'good',
    ratingNeedsImprovementLabel: 'needs improvement',
    ratingPoorLabel: 'poor',
    legendGoodTemplate: 'LCP ≤ 2.5 s · CLS ≤ 0.1 · TBT ≤ 200 ms',
    legendMidTemplate: 'LCP ≤ 4 s · CLS ≤ 0.25 · TBT ≤ 600 ms',
    legendPoorLabel: 'beyond',
  },
  findingsAppendix: {
    eyebrow: '8 · Appendix',
    heading: 'Full findings list',
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
    findingIdColumnLabel: 'Finding',
    pagesColumnLabel: 'Pages',
    pagesMaxColumnLabel: 'Max pages',
    occurrencesColumnLabel: 'Occurrences',
    selectorColumnLabel: 'Sample selector',
    ruleColumnLabel: 'Rule',
    findingSingular: 'finding',
    findingPlural: 'findings',
    occurrenceSingular: 'occurrence',
    occurrencePlural: 'occurrences',
    pageSingular: 'page',
    pagePlural: 'pages',
    upToLabel: 'up to',
    wcagLabel: 'WCAG',
    minorAggregateTitle: 'Minor optimizations, condensed view',
    minorAggregateGroupedSuffix: 'grouped by rule',
    minorAggregateNote:
      'These findings are real but secondary relative to the priorities above. Full page and selector detail is available on request in the technical export.',
    observationsCrossRefLabel: 'see Observations',
  },
  methodology: {
    eyebrow: '9 · Methodology and limitations',
    heading: 'How this audit was carried out',
    toolingParagraphTemplate:
      'This audit combines several automated detection tools, all deterministic: no finding is invented or guessed. Accessibility engine axe-core {axeVersion}, performance engine Lighthouse {lighthouseVersion} on a simulated mobile profile, render comparison via two loads of each page, JavaScript disabled then enabled. Standard audited: WCAG 2.2, level AA. Scope: {pages} pages crawled on {date} starting from the homepage.',
    automatedCoverageCaveat:
      'Automated tools detect a well-documented but limited share of accessibility issues, commonly estimated between 30 and 40 percent of criteria. This is a property of any automated audit, not a reservation about this one: it guarantees every finding listed is verifiable. This audit adds an extended accessibility pass covering keyboard navigation, focus order, form error handling, video caption presence, and a heuristic red flag for alt text quality; reading order versus visual order still requires manual verification, delivered as a separate service.',
    legalCitationInScopeTemplate:
      'This site falls under the following obligation: {regimeName}, overseen by {authority} ({legalCitation}). {facts}',
    legalCitationLikelyInScopeTemplate:
      "The available evidence indicates this site likely falls under the following obligation: {regimeName}, overseen by {authority} ({legalCitation}). {facts} This assessment could not be fully confirmed without a complete review of the site's transactional flow.",
    legalCitationOutOfScopeParagraph:
      'Based on the available evidence (company size and the absence of a first party transactional flow), this site does not fall under the digital accessibility obligation set by loi n° 2023-171.',
    legalCitationUndeterminedParagraph:
      'This report cites the relevant technical criteria (WCAG 2.2, EN 301 549) without asserting whether a specific legal obligation applies to your business, which depends on its size and sector.',
    legalCitationEffectifFactTemplate: 'The company has {label} according to the Sirene registry.',
    legalCitationTurnoverFactTemplate: 'Declared annual turnover exceeds the {threshold} threshold.',
    legalCitationTransactionalFlowFact:
      'The site offers a first party transactional flow (booking, cart, or checkout).',
    legalCitationTransactionalFlowUnknownFact:
      'Whether the site offers a first party transactional flow could not be confirmed across the whole site.',
    legalCitationExemptionRouteSentence:
      'The only documented route to exemption from this obligation is a disproportionate burden waiver request filed via Demarche Simplifiee.',
    legalCitationManualSirenWithFindingTemplate:
      'The SIREN number used for this determination was provided manually; this site does not publish it itself (see finding {findingId}).',
    legalCitationManualSirenNoFindingSentence:
      'The SIREN number used for this determination was provided manually; this site does not publish this number itself.',
    legalCitationSirenMismatchTemplate:
      'The manually supplied SIREN ({manualSiren}) differs from the one published on the site ({extractedSiren}). This determination uses the manually supplied number.',
  },
  footer: {
    confidentialityLabel: 'Confidential report',
    pageLabel: 'Page',
  },
};
