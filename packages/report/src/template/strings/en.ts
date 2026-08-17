import type { ReportStrings } from './types.js';

export const en: ReportStrings = {
  toc: {
    eyebrow: 'Contents',
    heading: "What's in this report",
    items: [
      'Summary and priority actions',
      'Legal exposure',
      'The audit in numbers',
      'Ranked priorities',
      'Priority checklist (printable)',
      'Observations outside the ranking',
      'Accessibility conformance, WCAG 2.2 level AA',
      'Render evidence: what search engines see',
      'Performance measurements',
      'Draft accessibility statement',
      'Methodology and limitations',
      'Appendix: full findings list',
      'Glossary',
      'Next steps & contact',
    ],
  },
  statistics: {
    eyebrow: '03 · The audit in numbers',
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
    wcagFailingHeading: 'WCAG conformance',
    severityBreakdownHeading: 'Breakdown by severity',
    categoryBreakdownHeading: 'Breakdown by category',
    legendCriticalText: 'blocks visitors or indexing',
    legendSeriousText: 'severely degrades usability or conformance',
    legendModerateText: 'worth fixing, not urgent',
    legendMinorText: 'optimization',
  },
  conformanceSummary: {
    eyebrow: '07 · Accessibility conformance',
    heading: 'WCAG 2.2 level AA criteria failing',
    bodyIntro:
      'A failing criterion is a conformance gap, not an aesthetic preference. This page can be handed directly to a developer, an agency, or legal counsel.',
    scopeNote: 'This list cites criteria without asserting their precise legal applicability to this site.',
    criterionColumnLabel: 'Criterion',
    criterionNameColumnLabel: 'Name',
    findingsColumnLabel: 'Findings',
    occurrencesColumnLabel: 'Occurrences',
    pagesMaxColumnLabel: 'Pages (max)',
    emptyState: 'No WCAG 2.2 level AA criteria failing were detected on this site.',
  },
  observations: {
    eyebrow: '06 · Observations',
    heading: 'Findings outside the ranking',
    wrapperTitle: 'Third-party content wrapper pages',
    wrapperBodyTemplate:
      "These pages are wrappers displaying a third-party platform's content: their content is almost entirely absent from the raw HTML. Typical fixes don't apply to third-party content. The useful decision is choosing between a direct link to the platform, a deliberate noindex, or removing these pages. Findings involved: {findingIds}.",
    legalTitle: 'Legal pages excluded from indexing',
    legalBodyTemplate:
      "These pages (terms and conditions, cookie policy, privacy policy, or similar) carry a noindex directive. This is a common and often deliberate setup for this kind of page: no corrective action is recommended by default, just confirm the choice is intentional. Findings involved: {findingIds}.",
  },
  cover: {
    kicker: 'Odysseus · Digital audit',
    reportTitle: 'Audit report',
    subtitle: 'Visibility and accessibility audit',
    siteLabel: 'Site audited',
    dateLabel: 'Audit date',
    pagesScannedLabel: 'Scope analyzed',
    pagesScannedValueTemplate: '{count} pages scanned',
    languageLabel: 'Report language',
    wcagReferentialLabel: 'Standard audited',
    riskSmallLabel: 'Technical findings severity',
    riskLevels: { low: 'Low', medium: 'Medium', high: 'High' },
  },
  executiveSummary: {
    eyebrow: '01 · Summary',
    heading: 'What to take away',
    startHereKicker: 'Where to start',
    jumpLinkLabel: 'See →',
  },
  legalExposure: {
    eyebrow: '02 · Legal exposure',
    heading: 'Legal exposure',
    eaaDeadlineLabel: 'EAA deadline',
    eaaDeadlineValue: '28 June 2025',
    eaaDeadlineNote:
      'Date the European Accessibility Act obligations enter into application, set by the directive itself.',
    obligationStatusLabel: 'Obligation status',
    statusLabels: {
      in_scope: 'Confirmed',
      likely_in_scope: 'Likely',
      out_of_scope: 'Out of scope',
      undetermined: 'Undetermined',
    },
    statusShortDescriptions: {
      in_scope: 'This site falls under a confirmed digital accessibility obligation, based on the available evidence.',
      likely_in_scope:
        'The available evidence indicates this site likely falls under a digital accessibility obligation, without full confirmation.',
      out_of_scope:
        'Based on the available evidence, this site does not fall under the digital accessibility obligation set by loi n° 2023-171.',
      undetermined:
        "The obligation status could not be established with certainty: the site does not publish a business identifier (SIREN/RCS), which prevents confirming which regulatory tier applies.",
    },
    disclaimerNote:
      'Generated from the existing obligation assessment; no additional legal interpretation has been added. A review by qualified legal counsel remains necessary.',
    undeterminedActionNote:
      "This status would become determinable if the company's SIREN number were published on the site or provided to the Odysseus team.",
  },
  checklist: {
    eyebrow: '05 · Printable checklist',
    heading: 'Priority checklist',
    intro: 'Page designed to be printed or captured on its own, no prose, just the essentials.',
    rankColumnLabel: '#',
    priorityColumnLabel: 'Priority',
    effortColumnLabel: 'Effort',
    impactColumnLabel: 'Impact',
    pagesColumnLabel: 'Pages',
  },
  themes: {
    eyebrow: '04 · Priorities',
    headingTemplate: '{count} priorities, ranked by effort and impact',
    effortLabel: 'Effort',
    impactLabel: 'Business impact',
    affectedPagesLabel: 'Affected pages',
    conformityLabel: 'Conformance',
    conformityNotApplicable: 'Not applicable',
    conformityNonConformant: 'Non-conformant',
    legalTagLabel: 'Conformance requirement',
    impactCitationLabel: 'Reference data point',
    quickWinBadgeLabel: 'Quick win',
    effortImpactLevels: { low: 'Low', medium: 'Medium', high: 'High' },
    pagesOfTotalTemplate: '{pages} {pageWord} of {totalPages}',
    refsLabel: 'Findings',
  },
  renderDiffEvidence: {
    eyebrow: '08 · Render evidence',
    heading: 'What a search engine receives before JavaScript runs',
    intro:
      'Every page is loaded twice: once with no JavaScript, the way a basic indexing crawler does, once in a full browser. The difference measures content invisible to search engines.',
    rawBarLabelTemplate: 'Raw HTML - {chars} characters',
    renderedBarLabelTemplate: 'Rendered page - {chars} characters',
    missingCaptionTemplate: 'Missing: {percent}% of visible text absent from the raw HTML, on {selector}.',
    missingCaptionNoSelectorTemplate: 'Missing: {percent}% of visible text absent from the raw HTML.',
    overflowTextTemplate:
      '{count} more pages show the same gap, detail in the technical export.',
    positiveStatementTemplate:
      "This site's commercial pages keep their text in the raw HTML: no meaningful render gap was measured.",
    positiveStatementWrapperNote:
      'The only exception is the third-party content wrapper pages, see the Observations section.',
  },
  coreWebVitals: {
    eyebrow: '09 · Performance',
    heading: 'Performance measurements',
    introTemplate: 'Median values aggregated across {pages} pages (Lighthouse), for illustration.',
    metricColumnLabel: 'Metric',
    valueColumnLabel: 'Median value',
    thresholdColumnLabel: '"Good" threshold',
    statusColumnLabel: 'Status',
    lcpLabel: 'LCP, main content',
    tbtLabel: 'TBT, blocking time',
    fcpLabel: 'FCP, first paint',
    speedIndexLabel: 'Speed Index',
    clsLabel: 'CLS, visual stability',
    notMeasured: 'Not measured',
    ratingGoodLabel: 'good',
    ratingNeedsImprovementLabel: 'needs improvement',
    ratingPoorLabel: 'poor',
  },
  accessibilityStatement: {
    eyebrow: '10 · Statement',
    heading: 'Draft accessibility statement',
    intro: 'Skeleton generated from the findings, to be completed by the client before publication.',
    criterionColumnLabel: 'Criterion',
    statusColumnLabel: 'Conformance status',
    nonConformantPartialLabel: 'Non-conformant (partially)',
    contactHeading: 'Contact',
    contactBody: '[Client to complete with a contact email address] - reporting process to be defined.',
    remediationPlanHeading: 'Remediation plan',
    remediationPlanBody: 'See the "Ranked priorities" section above for the plan.',
  },
  glossary: {
    eyebrow: '13 · Glossary',
    heading: 'Glossary',
    terms: [
      {
        term: 'WCAG 2.2',
        definition:
          'Web Content Accessibility Guidelines, the international standard of digital accessibility criteria, levels A / AA / AAA.',
      },
      {
        term: 'EAA',
        definition:
          'European Accessibility Act: the EU directive requiring digital accessibility for many products and services starting 28 June 2025.',
      },
      {
        term: 'RGAA',
        definition: 'The French official standard operationalizing the WCAG criteria for French public bodies.',
      },
      {
        term: 'EN 301 549',
        definition: 'European ICT accessibility standard, the technical reference cited by the EAA and public procurement.',
      },
      {
        term: 'Critical',
        definition: 'Highest severity: blocks an essential task for some users.',
      },
      {
        term: 'Serious',
        definition: 'Severely hinders use of the site without fully blocking it.',
      },
      {
        term: 'Moderate',
        definition: 'Complicates use for certain profiles or contexts of use.',
      },
      {
        term: 'Minor',
        definition: 'Low-impact deviation, non-blocking.',
      },
      {
        term: 'Quick win',
        definition: 'Low-effort, high-impact fix, worth prioritizing.',
      },
    ],
  },
  nextSteps: {
    eyebrow: '14 · Next steps',
    heading: 'Next steps & contact',
    questionTitle: 'Questions?',
    questionBody:
      'Any request for clarification about a finding or a priority can be sent directly to the Odysseus team, citing the relevant finding ID.',
    reauditTitle: 'Re-audits',
    reauditBody:
      'A re-audit re-runs the same scope and compares results against the previous report, finding by finding, to measure progress.',
    postFixTitle: 'Post-fix verification',
    postFixBody:
      'Once priorities are addressed, a targeted check confirms the fixed findings are genuinely resolved, without re-running a full audit.',
  },
  findingsAppendix: {
    eyebrow: '12 · Appendix',
    heading: 'Full findings list',
    intro:
      'Every finding detected by the automated tools, including those judged minor and not carried into the priorities above.',
    categoryLabels: {
      accessibility: 'Accessibility',
      seo: 'Search engine visibility (SEO)',
      geo: 'AI answer engine visibility (GEO)',
      performance: 'Performance',
      rendering: 'Rendering',
    },
    geoEmergingLabel: 'Emerging research',
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
    eyebrow: '11 · Methodology and limitations',
    heading: 'How this audit was carried out',
    toolingParagraphTemplate:
      'This audit combines several automated detection tools, all deterministic: no finding is invented or guessed. Accessibility engine axe-core {axeVersion}, performance engine Lighthouse {lighthouseVersion} on a simulated mobile profile, render comparison via two loads of each page, JavaScript disabled then enabled. Standard audited: WCAG 2.2, level AA. Scope: {pages} pages crawled on {date} starting from the homepage.',
    automatedCoverageCaveat:
      'Automated tools detect a well-documented but limited share of accessibility issues, commonly estimated between 30 and 40 percent of criteria. This is a property of any automated audit, not a reservation about this one: it guarantees every finding listed is verifiable. This audit adds an extended accessibility pass covering keyboard navigation, focus order, form error handling, video caption presence, and a heuristic red flag for alt text quality. This audit is fully automated: some accessibility properties cannot be reliably evaluated by automated tools alone and are not covered by any finding in this report.',
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
    legalCitationPointerSentence: 'See the "Legal exposure" section for the detail of this determination.',
  },
  footer: {
    confidentialityLabel: 'Confidential report',
    pageLabel: 'Page',
  },
};
