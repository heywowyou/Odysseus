import type { ReportStrings } from './types.js';

export const en: ReportStrings = {
  toc: {
    eyebrow: 'Contents',
    heading: "What's in this report",
  },
  reportIntro: {
    eyebrow: 'About this report',
    heading: 'How to read this report',
    audienceHeading: 'Who each part of this report is for',
    audienceYouLabel: 'You (director)',
    audienceAgencyLabel: 'Your provider / web agency',
    audienceCounselLabel: 'Your legal counsel',
    measuresHeading: 'What this audit measures',
    measuresAccessibility: 'Accessibility: can customers with disabilities book and navigate your site?',
    measuresSeo: 'SEO: does Google correctly understand your pages?',
    measuresGeo: 'AI visibility (GEO): can AI assistants (ChatGPT and equivalents) understand and recommend your business?',
    measuresRendering: 'Rendering: does your content exist even without JavaScript, for the most basic crawlers and screen readers?',
    consequencesHeading: 'What this concretely changes for you',
    consequenceBooking: 'Customers who cannot complete a booking.',
    consequenceRegulatory: 'A regulatory exposure already documented (see the "Legal exposure" section).',
    consequenceVisibility: 'Reduced visibility in search results and AI assistants.',
    notALegalOpinionNote:
      'What this report is not: legal advice (see the "Legal exposure" section); an exhaustive audit, since automated detection covers roughly 30 to 40 percent of accessibility criteria (see "Methodology and limits").',
    nextActionsHeading: 'Your three next actions',
    nextActionItemTemplate: '{title}, pass on to: {contact} (effort: {effort}).',
    contactAgency: 'your agency',
    contactAgencyAndVendor: 'your agency and the relevant third-party provider',
    contactUnknownVendor: 'the relevant third-party provider',
  },
  statistics: {
    eyebrow: 'The audit in numbers',
    heading: 'What the analysis found',
    introTemplate:
      '{pages} pages analyzed, {findings} distinct findings after collapsing repeats. A finding present on several pages counts once.',
    pagesTileLabel: 'pages analyzed',
    findingsTileLabel: 'distinct findings',
    accessibilityOccurrencesTileLabel: 'accessibility occurrences',
    heuristicOccurrencesExcludedNoteTemplate:
      "This figure excludes {count} further occurrences from a heuristic signal on alt-text quality, which is not a deterministic conformance test (see the \"Signals to verify\" section).",
    criticalDriverNoteTemplate: 'These critical findings come only from: {rules}.',
    thirdPartyOccurrencesNoteTemplate:
      // B6: see the French entry for why this names the containing
      // numbered section rather than the sub-heading alone.
      '{percent}% of these occurrences come from third-party components (forms, popups, booking widget) - see "To address with your third-party providers", in the technical appendix.',
    pagesWithCriticalTileLabel: 'pages with at least one critical finding',
    criticalTileLabel: 'critical',
    seriousTileLabel: 'serious',
    moderateTileLabel: 'moderate',
    minorTileLabel: 'minor',
    wcagFailingDescriptionTemplate: 'WCAG 2.2 AA criteria failing across {pages} pages',
    wcagFailingHeading: 'WCAG conformance',
    severityBreakdownHeading: 'Breakdown by severity',
    categoryBreakdownHeading: 'Breakdown by category',
    belowThresholdRenderGapNote:
      'The "Rendering" category shows 0 findings, but a real render gap was measured on at least one page, below the {threshold}% threshold at which a finding is actually generated (see the "Render evidence" section).',
    legendCriticalText: 'blocks visitors or indexing',
    legendSeriousText: 'severely degrades usability or conformance',
    legendModerateText: 'worth fixing, not urgent',
    legendMinorText: 'optimization',
  },
  conformanceSummary: {
    eyebrow: 'Accessibility conformance',
    heading: 'WCAG 2.2 level AA criteria failing',
    bodyIntro:
      'A failing criterion is a conformance gap, not an aesthetic preference. This page can be handed directly to a developer, an agency, or legal counsel.',
    scopeNote:
      'This list of technical criteria does not, on its own, imply a conclusion about this site\'s legal obligation: it is technical, not legal, and does not contradict the obligation status established in the "{section}" section.',
    criterionColumnLabel: 'Criterion',
    criterionNameColumnLabel: 'Name',
    findingsColumnLabel: 'Findings',
    occurrencesColumnLabel: 'Occurrences',
    pagesMaxColumnLabel: 'Pages affected',
    emptyState: 'No WCAG 2.2 level AA criteria failing were detected on this site.',
    heuristicSectionHeading: 'Signals to verify',
    heuristicSectionNote:
      'These rows come from a heuristic signal on alt-text quality, not a deterministic conformance test: they flag alt text that may be low-value (generic, a raw filename, or duplicated), without asserting a confirmed non-conformance. A manual review is needed before treating these as conformance gaps.',
    multiCriterionNote:
      "A finding mapped to more than one WCAG criterion is counted under each row: the Occurrences column's total can therefore exceed the accessibility-occurrences count stated elsewhere in this report.",
  },
  observations: {
    eyebrow: 'Observations',
    heading: 'Findings outside the ranking',
    wrapperTitle: 'Third-party content wrapper pages',
    wrapperBodyTemplate:
      "These pages are wrappers displaying a third-party platform's content: their content is almost entirely absent from the raw HTML. Typical fixes don't apply to third-party content. The useful decision is choosing between a direct link to the platform, a deliberate noindex, or removing these pages. Findings involved: {findingIds}.",
    legalTitle: 'Legal pages excluded from indexing',
    legalBodyTemplate:
      "These pages (terms and conditions, cookie policy, privacy policy, or similar) are of a kind usually excluded from indexing (noindex). This is a common and often deliberate setup for this kind of page: no corrective action is recommended by default, just confirm the choice is intentional and that a noindex directive is actually in place. Findings involved: {findingIds}.",
  },
  remainingWork: {
    eyebrow: 'Still to address',
    heading: 'The remaining findings, grouped by theme',
    introTemplate:
      'The ranked priorities in section {prioritiesSection} cover what to fix first. The remaining {count} findings are grouped below by area and by rule, each with the corresponding action. Every line points back to the finding numbers in the annex.',
    nothingRemaining:
      'Every finding in this audit is covered by the ranked priorities. This section has nothing to add.',
    findingSingular: 'finding',
    findingPlural: 'findings',
    occurrenceSingular: 'occurrence',
    occurrencePlural: 'occurrences',
    pageSingular: 'page',
    pagePlural: 'pages',
    findingRefsTemplate: 'Findings: {findingIds}',
    scopeNote:
      'The actions given describe the correction the detected rule calls for. They do not replace the judgment of whoever will work on the site.',
  },
  cover: {
    kicker: 'Odysseus · Digital audit',
    reportTitle: 'Audit report',
    subtitle: 'Accessibility, performance, SEO and GEO audit',
    subtitleNoPerformance: 'Accessibility, SEO and GEO audit',
    siteLabel: 'Site audited',
    dateLabel: 'Audit date',
    pagesScannedLabel: 'Scope analyzed',
    pagesScannedValueTemplate: '{count} pages analyzed',
    languageLabel: 'Report language',
    wcagReferentialLabel: 'Standard audited',
    wcagReferentialValue: 'WCAG 2.2 AA · Performance · SEO · GEO',
    wcagReferentialValueNoPerformance: 'WCAG 2.2 AA · SEO · GEO',
    riskSmallLabel: 'Technical findings severity',
    riskLevels: { low: 'Low', medium: 'Medium', high: 'High' },
    riskBasisTemplate: 'Based on {critical} {criticalWord} and {serious} {seriousWord}',
    riskScaleBasisNote:
      'This level reflects a holistic assessment of the severity and reach of findings across the site, not a single numeric threshold.',
    criticalFindingSingular: 'critical finding',
    criticalFindingPlural: 'critical findings',
    seriousFindingSingular: 'serious finding',
    seriousFindingPlural: 'serious findings',
    recipientLabel: 'Prepared for',
    legalNameLabel: 'Legal name',
  },
  executiveSummary: {
    eyebrow: 'Summary',
    heading: 'What to take away',
    startHereKicker: 'Where to start',
    glossaryPointerSentence: 'Technical terms used in this report are defined in the "Glossary" section.',
    thirdPartySplitSentenceTemplate:
      '{percent}% of accessibility occurrences come from third-party components (forms, popups, booking widget), not the site itself.',
    categoryImbalanceNote:
      'This site has few significant SEO and GEO findings relative to accessibility: most of the priorities below concern accessibility.',
    jumpLinkLabelTemplate: 'See priority {rank}',
    topPriorityIsNotLegalWithPointerTemplate:
      'Priority 1 above is not tied to any accessibility criterion: it was ranked first based on its effort-to-impact ratio. The priorities tied to an accessibility criterion rank at position {legalRank}. Other obligations unrelated to accessibility may apply separately: see the "Legal exposure" section.',
    topPriorityIsNotLegalNoPointer:
      'Priority 1 above is not tied to any accessibility criterion: it was ranked first based on its effort-to-impact ratio. None of the priorities in this report are tied to an accessibility criterion. Other obligations unrelated to accessibility may apply separately: see the "Legal exposure" section for the detail.',
    summaryCountsTemplate: 'The audit identified {actionable} priority findings ({critical} critical and {serious} serious) out of {total} findings in total.',
  },
  legalExposure: {
    eyebrow: 'Legal exposure',
    heading: 'Legal exposure',
    eaaDeadlineLabel: 'In application since',
    eaaDeadlineValue: '28 June 2025',
    eaaDeadlineNoteTemplate:
      'Date the European Accessibility Act obligations enter into application, set by the directive itself. The obligations have therefore already been in force for {duration}, not upcoming.',
    obligationStatusLabel: 'Obligation status',
    statusLabels: {
      // See the matching fr.ts comment: "Confirmed" read as a settled
      // legal conclusion, which docs/obligation-basis.md section 7
      // forbids. "Criteria met" states what the available data shows
      // without asserting the conclusion itself.
      in_scope: 'Criteria met',
      likely_in_scope: 'Likely',
      out_of_scope: 'Out of scope',
      undetermined: 'Undetermined',
    },
    statusShortDescriptions: {
      in_scope: 'Based on the available evidence, this site meets the criteria for a digital accessibility obligation.',
      likely_in_scope:
        'The available evidence indicates this site likely falls under a digital accessibility obligation, without full confirmation.',
      // item 0.1 (La Corniche pass): see the matching fr.ts comment - this
      // used to restate legalCitationOutOfScopeParagraph below almost
      // word for word.
      out_of_scope: 'This site does not currently fall under the digital accessibility obligation.',
      undetermined:
        "The obligation status could not be established with certainty: the site does not publish a business identifier (SIREN/RCS), which prevents confirming which regulatory tier applies.",
    },
    exposureHeading: 'Exposure if non-compliant',
    sirenLabel: 'SIREN',
    sirenTemplate: 'SIREN {siren}, as found during this audit ({date}).',
    sirenUnavailable: 'No SIREN number could be identified for this site during this audit.',
    registrySnapshotTemplate:
      'Sirene registry data: {denomination}, SIREN {siren}, {effectifs}, retrieved on {date} ({source}).',
    registrySnapshotEffectifsUnavailable: 'headcount band unavailable',
    lcenKicker: 'Another applicable obligation',
    lcenObserved:
      'The scan found no SIREN, RCS or VAT number published on the pages of this site it visited.',
    lcenSourceTemplate: 'Source: {citation}. Competent authority: {authority}.',
    lcenScanLimitNote:
      'A scan visits a limited number of pages and can miss one where this information appears. This obligation does not depend on the outcome of the accessibility analysis above. Have your situation confirmed by a legal adviser.',
    registrySnapshotVerbatimNote:
      "This denomination is reproduced exactly as it appears in the Sirene registry, associated with the SIREN above, not derived from the domain name.",
    transactionalFlowConflictTemplate:
      'Conflicting signal: automated detection found a transactional flow on this site, but a manual confirmation states {manualValue}. Verify before relying on this status.',
    transactionalFlowConflictManualAbsent: 'no such flow exists',
    transactionalFlowConflictManualPresent: 'it does exist',
    disclaimerNote:
      'Generated from the existing obligation assessment; no additional legal interpretation has been added. A review by qualified legal counsel remains necessary.',
    undeterminedActionNote:
      "This status would become determinable if the company's SIREN number were published on the site or provided to the Odysseus team.",
    transactionalFlowOnSiteTemplate:
      'A booking widget is integrated via a component present across the audited scope ({vendors}). Example pages where it was found: {examplePages}.',
    transactionalFlowOnSiteNoVendorTemplate:
      'The identified transactional flow is integrated directly on the site, via a component present on several pages of the audited scope. Example pages where it was found: {examplePages}.',
    transactionalFlowDelegatedTemplate:
      "The identified transactional flow is delegated to a third-party provider ({domain}). That domain was not crawled as part of this audit, which stays confined to the audited site's own domain.",
    transactionalFlowDelegatedDomainUnknown: 'domain not identified',
  },
  checklist: {
    eyebrow: 'Printable checklist',
    heading: 'Priority checklist',
    intro: 'Page designed to be printed or captured on its own, no prose, just the essentials. Pass this on to your technical provider.',
    rankColumnLabel: '#',
    priorityColumnLabel: 'Priority',
    effortColumnLabel: 'Effort',
    impactColumnLabel: 'Impact',
    pagesColumnLabel: 'Pages',
    findingsColumnLabel: 'Findings',
    wcagColumnLabel: 'WCAG',
    identifierTemplate: '{company} · {date}',
  },
  themes: {
    eyebrow: 'Priorities',
    headingTemplate: '{count} priorities, ranked by effort and impact',
    aggregateEffortEstimateTemplate:
      "Overall estimate: {min} to {max} development days for all {count} priorities below (a broad, non-contractual estimate). A priority involving a third-party component additionally depends on its provider's own timeline.",
    effortLabel: 'Effort',
    impactLabel: 'Business impact',
    affectedPagesLabel: 'Affected pages',
    conformityLabel: 'Conformance',
    conformityNotApplicable: 'Not applicable',
    conformityNotApplicableGloss: 'this priority is not an accessibility matter',
    conformityNonConformant: 'Non-conformant',
    legalTagLabel: 'Conformance requirement',
    impactCitationLabel: 'Reference data point',
    measuredCoreWebVitalGapTemplate:
      'Measured gap on this site: median {metric} at {value}, {gap} above the "good" threshold ({threshold}).',
    revenueImpactTemplate:
      'Based on your reported turnover ({turnover} EUR), and if this association held for your business, the order of magnitude would be up to {impact} EUR per year. This is an indicative estimate based on a single study, not a guaranteed forecast.',
    quickWinBadgeLabel: 'Quick win',
    recommendedActionsLabel: 'Recommended actions',
    effortImpactLevels: { low: 'Low', medium: 'Medium', high: 'High' },
    pagesOfTotalTemplate: '{pages} {pageWord} of {totalPages}',
    refsLabel: 'Findings',
    ownershipSplitTemplate:
      'This priority covers {firstPartyPages} {firstPartyPageWord} on your own site (your agency can fix these) and {thirdPartyPages} {thirdPartyPageWord} belonging to {vendor} (pass on to its provider); a page can fall into both.',
    ownershipSplitUnknownVendorLabel: 'a third-party component',
  },
  renderDiffEvidence: {
    eyebrow: 'Render evidence',
    heading: 'What a search engine receives before JavaScript runs',
    intro:
      'Every page is loaded twice: once with no JavaScript, the way a basic indexing crawler does, once in a full browser. The difference measures content invisible to search engines.',
    rawBarLabelTemplate: 'Raw HTML - {chars} characters',
    renderedBarLabelTemplate: 'Rendered page - {chars} characters',
    charCountsUnavailableNote: 'Character count not measured for this page.',
    missingCaptionTemplate: 'Missing: {percent}% of visible text absent from the raw HTML, on {selector}.',
    missingCaptionNoSelectorTemplate: 'Missing: {percent}% of visible text absent from the raw HTML.',
    overflowTextTemplate: '{count} more pages across the site show a comparable rendering gap.',
    overflowTextSingularTemplate: '1 more page across the site shows a comparable rendering gap.',
    positiveStatementTemplate:
      "This site's commercial pages keep their text in the raw HTML: no meaningful render gap was measured.",
    positiveStatementWrapperNote:
      'The only exception is the third-party content wrapper pages, see the Observations section.',
  },
  coreWebVitals: {
    eyebrow: 'Performance',
    heading: 'Performance measurements',
    introTemplate:
      'Median values aggregated across {pages} pages. Simulated mobile with network throttling, single run, lab data (Lighthouse) rather than field data.',
    metricColumnLabel: 'Metric',
    valueColumnLabel: 'Median value',
    worstPageColumnLabel: 'Worst page',
    worstPageSameAsMedian: 'Same as median',
    worstPageFootnote:
      'A finding is graded from its worst page, not the median: a "Critical" status can coexist with a median "needs improvement" status when a single page is markedly slower than the rest.',
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
    allUnmeasuredNote:
      'Performance measurement (Lighthouse) did not complete for this site on this audit, so no performance finding is reported here. See the "Methodology and limitations" section for detail.',
    realUserHeading: 'Real-user data (Chrome UX Report)',
    realUserIntro:
      'Field data from real Chrome visitors to this site over the last 28 days, where public data exists, complementing the simulated lab measurements above.',
    realUserNoDataNote:
      'No public Chrome UX Report data exists for this site, most often because it does not yet receive enough Chrome traffic to meet Google\'s reporting threshold. This is not a pass or a fail, it simply means no real-user comparison is available for this audit.',
    realUserGapNote:
      'A large gap between the values above and below is expected: the lab measurement deliberately simulates harsh conditions (CPU and network throttling, a single run), while real-user data reflects visitors on a variety of devices and connections. The two measure different questions, they do not contradict each other.',
    inpLabel: 'INP, responsiveness',
  },
  accessibilityStatement: {
    eyebrow: 'Statement',
    heading: 'Draft accessibility statement',
    intro: 'Skeleton generated from the findings, to be completed by the client before publication.',
    criterionColumnLabel: 'Criterion',
    statusColumnLabel: 'Conformance status',
    nonConformantLabel: 'Non-conformant',
    contactHeading: 'Contact',
    contactBody: '[Client to complete with a contact email address] - reporting process to be defined.',
    contactEmailToConfirmTemplate: '{email} (auto-detected, to confirm before publication)',
    remediationPlanHeading: 'Remediation plan',
    remediationPlanBodyTemplate: 'See the "{section}" section above for the plan.',
    firstPublicationDateLabel: 'Date of first publication',
    technologiesLabel: 'Technologies relied upon',
    testEnvironmentLabel: 'Test environment',
    nonAccessibleContentLabel: 'Known non-accessible content',
    feedbackProcedureLabel: 'Feedback procedure',
    recoursePathLabel: 'Recourse path (Défenseur des droits)',
    toCompletePlaceholder: 'To be completed by the client',
  },
  glossary: {
    eyebrow: 'Glossary',
    heading: 'Glossary',
    terms: [
      {
        id: 'wcag',
        term: 'WCAG 2.2',
        definition:
          'Web Content Accessibility Guidelines, the international standard of digital accessibility criteria, levels A / AA / AAA.',
      },
      {
        id: 'eaa',
        term: 'EAA',
        definition:
          'European Accessibility Act: the EU directive requiring digital accessibility for many products and services starting 28 June 2025.',
      },
      {
        id: 'rgaa',
        term: 'RGAA',
        definition: 'The French official standard operationalizing the WCAG criteria for French public bodies.',
      },
      {
        id: 'en301549',
        term: 'EN 301 549',
        definition: 'European ICT accessibility standard, the technical reference cited by the EAA and public procurement.',
      },
      {
        id: 'critical',
        term: 'Critical',
        definition: 'Highest severity: blocks an essential task for some users.',
      },
      {
        id: 'serious',
        term: 'Serious',
        definition: 'Severely hinders use of the site without fully blocking it.',
      },
      {
        id: 'moderate',
        term: 'Moderate',
        definition: 'Complicates use for certain profiles or contexts of use.',
      },
      {
        id: 'minor',
        term: 'Minor',
        definition: 'Low-impact deviation, non-blocking.',
      },
      {
        id: 'quick-win',
        term: 'Quick win',
        definition: 'Low-effort, high-impact fix, worth prioritizing.',
      },
      {
        id: 'lcp',
        term: 'LCP (Largest Contentful Paint)',
        definition: 'Load time of the largest visible element on the page, an indicator of perceived speed.',
      },
      {
        id: 'fcp',
        term: 'FCP (First Contentful Paint)',
        definition: 'Time before the first content appears on screen.',
      },
      {
        id: 'tbt',
        term: 'TBT (Total Blocking Time)',
        definition: "Total blocking time: how long the page is unresponsive to a user's interactions.",
      },
      {
        id: 'cls',
        term: 'CLS (Cumulative Layout Shift)',
        definition: 'Visual stability: measures unexpected element movement while the page is loading.',
      },
      {
        id: 'speed-index',
        term: 'Speed Index',
        definition: "How quickly a page's visible content fills in while it loads.",
      },
      {
        id: 'seo',
        term: 'SEO',
        definition: 'Search engine optimization: improving visibility in search engine results.',
      },
      {
        id: 'geo',
        term: 'GEO',
        definition:
          'Generative engine optimization: visibility in AI answer engines, distinct from classic search visibility.',
      },
      {
        id: 'constat-vs-occurrence',
        term: 'Finding / Occurrence',
        definition:
          'A finding is one distinct problem after grouping; an occurrence is each individual appearance of it on the site. One finding can carry several occurrences.',
      },
      {
        id: 'selecteur',
        term: 'Selector',
        definition: "A technical expression pinpointing the element concerned in the page's code.",
      },
      {
        id: 'dgccrf',
        term: 'DGCCRF',
        definition:
          "The French consumer protection authority (Direction générale de la concurrence, de la consommation et de la répression des fraudes), the market surveillance authority named in this report.",
      },
      {
        id: 'parcours-transactionnel',
        term: 'Transactional flow',
        definition:
          'A site feature allowing a booking, cart, or payment directly online - the criterion that triggers the EAA obligation.',
      },
      {
        id: 'sans-objet',
        term: 'Not applicable',
        definition:
          "Used for a priority that is not a conformity question at all (e.g. performance, SEO): the conformity column simply does not apply to that kind of finding.",
      },
      {
        id: 'recherche-emergente',
        term: 'Emerging research',
        definition:
          'Flags a statistic cited for context whose methodology or evidence base is still young - distinct from an established statistic, cited without this caveat.',
      },
      {
        id: 'signaux-a-verifier',
        term: 'Signals to verify',
        definition:
          "Heuristic flags on the likely quality of some content (e.g. generic or duplicated alt text), distinct from confirmed WCAG criteria failures: they indicate a doubt worth a manual check, not an established non-conformity.",
      },
      {
        id: 'pages-concernees',
        term: 'Pages affected',
        definition:
          "Total distinct pages touched by at least one finding for this criterion, across every finding for that criterion combined (a union, not one finding's own count taken alone).",
      },
      {
        id: 'rendu',
        term: 'Rendering',
        definition:
          'Category of findings about the gap between a page\'s raw HTML content and its content once JavaScript has run - relevant to what a search engine or screen reader may miss.',
      },
      {
        id: 'sirene',
        term: 'Sirene',
        definition:
          "France's official business registry (INSEE), used here to verify company size and confirm which entity a finding concerns.",
      },
      {
        id: 'effort',
        term: 'Effort',
        definition:
          'Qualitative estimate (Low / Medium / High) of the work needed to fix a priority, derived from the rule family and occurrence concentration.',
      },
      {
        id: 'impact-commercial',
        term: 'Business impact',
        definition:
          'Qualitative estimate (Low / Medium / High) of a fix\'s expected effect on customer experience, conversion, or visibility - distinct from the finding\'s technical severity.',
      },
    ],
  },
  nextSteps: {
    eyebrow: 'Next steps',
    heading: 'Next steps & contact',
    questionTitle: 'Questions?',
    questionBodyTemplate:
      'Any request for clarification about a finding or a priority can be sent to the Odysseus team at {email}, citing the relevant finding ID.',
    reauditTitle: 'Re-audits',
    reauditBody:
      'A re-audit re-runs the same scope and compares results against the previous report, finding by finding, to measure progress.',
    reauditPricingTemplate:
      'Indicative price: EUR {price} excl. VAT, within {days} business days of confirming fixes are live. To request one, write to {email}.',
    postFixTitle: 'Post-fix verification',
    postFixBody:
      'Once priorities are addressed, a targeted check confirms the fixed findings are genuinely resolved, without re-running a full audit.',
    authorshipTemplate: 'Report produced by {producer}, generated on {date} (build {version}), report ID {reportId}.',
    issuerBlockTemplate: 'Signatory: {signatory}. SIRET: {registrationNumber}.',
    liabilityStatement:
      'This report reproduces technical findings detected by automated tools, together with explanations and prioritization. It does not constitute legal advice; see the "Legal exposure" section and the methodology for coverage limits. Odysseus cannot be held liable for decisions made on the sole basis of this document.',
  },
  findingsAppendix: {
    eyebrow: 'Technical appendix',
    heading: 'Full findings list',
    intro:
      'Every finding detected by the automated tools, including those judged minor and not carried into the priorities above. Pass this on to your technical provider.',
    categoryLabels: {
      accessibility: 'Accessibility',
      seo: 'Search engine visibility (SEO)',
      geo: 'AI answer engine visibility (GEO)',
      performance: 'Performance',
      rendering: 'Rendering',
      privacy: 'Privacy and security',
    },
    geoEmergingLabel: 'Emerging research',
    thirdPartyHeading: 'To resolve with your third-party providers',
    thirdPartyIntro:
      "These findings are in code belonging to a third-party plugin, widget, or embedded frame (booking engine, cookie banner, preview panel, form). Your agency cannot edit this code directly: the fix goes through the vendor or provider concerned.",
    thirdPartyCountedInTotalsNote:
      'These findings still count toward the severity totals at the top of the report: it is a real conformance gap under the standard, even when the specific implementation observed here already turns out to be correct.',
    unknownVendorLabel: 'Third-party component, provider not identified',
    severityLabels: {
      critical: 'Critical',
      serious: 'Serious',
      moderate: 'Moderate',
      minor: 'Minor',
    },
    findingIdColumnLabel: 'Finding',
    pagesColumnLabel: 'Pages',
    allPagesAnalyzedTemplate: 'All pages analysed ({count})',
    andNMoreTemplate: 'and {count} more',
    andNMoreSingularTemplate: 'and {count} more',
    affectedFilesCountTemplate: '{count} files affected',
    affectedFilesCountSingularTemplate: '{count} file affected',
    affectedFilesLabel: 'Files',
    affectedFilesSampleLabel: 'Files (examples)',
    samePagesAsTemplate: 'Same pages as {findingId}',
    pagesMaxColumnLabel: 'Max pages',
    occurrencesColumnLabel: 'Occurrences',
    selectorColumnLabel: 'Sample selector',
    findingSingular: 'finding',
    findingPlural: 'findings',
    occurrenceSingular: 'occurrence',
    occurrencePlural: 'occurrences',
    pageSingular: 'page',
    pagePlural: 'pages',
    wcagLabel: 'WCAG',
    observationsCrossRefLabel: 'see Observations',
    crawledPagesHeadingTemplate: 'Pages analyzed ({count})',
  },
  methodology: {
    eyebrow: 'Methodology and limitations',
    heading: 'How this audit was carried out',
    languageCoverageTemplate: 'Languages covered by this analysis: {languages}.',
    languageNotScannedTemplate:
      'No page was analyzed for the following languages, although the site publishes them: {languages}.',
    toolingParagraphTemplate:
      'This audit combines several automated detection tools, all deterministic: no finding is invented or guessed. Accessibility engine axe-core {axeVersion}, performance engine Lighthouse {lighthouseVersion} on a simulated mobile profile, render comparison via two loads of each page, JavaScript disabled then enabled. Standard audited: WCAG 2.2, level AA. Scope: {pages} pages analyzed on {date} starting from the homepage. A URL that merely leads to the homepage for a language (for example /en) is not counted as an analyzed page, because it carries no content of its own; the pages in that language are crawled normally.',
    automatedCoverageCaveat:
      'Automated tools detect a well-documented but limited share of accessibility issues, a commonly cited industry estimate placing that share between 30 and 40 percent of criteria (a general estimate with no single attributable source, unlike the figures cited elsewhere in this report). This is a property of any automated audit, not a reservation about this one: it guarantees every finding listed is verifiable. This audit adds an extended accessibility pass covering keyboard navigation, focus order, form error handling, video caption presence, and a heuristic red flag for alt text quality. This audit is fully automated: some accessibility properties cannot be reliably evaluated by automated tools alone and are not covered by any finding in this report.',
    extendedPassNoneFoundNote:
      'Extended accessibility pass result: no keyboard trap, no focus-order mismatch, no form error left unassociated with its field, and no video missing captions was detected on the pages analyzed.',
    extendedPassResultTemplate: 'Extended accessibility pass result: {checks}.',
    extendedPassCheckKeyboardTrapsLabel: 'keyboard traps',
    extendedPassCheckFocusOrderLabel: 'focus order',
    extendedPassCheckFormErrorsLabel: 'form errors left unassociated with their field',
    extendedPassCheckVideoCaptionsLabel: 'video captions',
    extendedPassCheckCleanLabel: 'no issue detected',
    extendedPassCheckFoundSingular: 'finding detected',
    extendedPassCheckFoundPlural: 'findings detected',
    legalCitationInScopeTemplate:
      'Based on the available evidence, this site meets the criteria set for the following obligation: {regimeName}, overseen by {authority} ({legalCitation}). {facts} This reading is not a definitive legal qualification; confirmation by legal counsel is still recommended.',
    legalCitationLikelyInScopeTemplate:
      "The available evidence indicates this site likely falls under the following obligation: {regimeName}, overseen by {authority} ({legalCitation}). {facts} This assessment could not be fully confirmed without a complete review of the site's transactional flow.",
    legalCitationOutOfScopeParagraph:
      'Based on the available evidence (company size and the absence of a booking, cart, or checkout flow directly online), this site does not fall under the digital accessibility obligation set by loi n° 2023-171.',
    legalCitationUndeterminedParagraph:
      'This report cites the relevant technical criteria (WCAG 2.2, EN 301 549) without asserting whether a specific legal obligation applies to your business, which depends on its size and sector.',
    legalCitationEffectifFactTemplate: 'The company has {label} according to the Sirene registry.',
    legalCitationTurnoverFactTemplate: 'Declared annual turnover exceeds the {threshold} threshold.',
    legalCitationTransactionalFlowFactTemplate: 'The site offers a {flowType} {location}.',
    legalCitationTransactionalFlowLocationOnSite: 'directly online',
    legalCitationTransactionalFlowLocationDelegated: 'online, delegated to a third-party provider',
    legalCitationTransactionalFlowUnknownFact:
      'Whether the site offers a booking, cart, or checkout flow directly online could not be confirmed across the whole site.',
    transactionalFlowTypeLabels: {
      booking: 'booking flow',
      cartOrPayment: 'cart or checkout flow',
      both: 'booking, cart, or checkout flow',
    },
    // P1.3 (2026-08-21 La Corniche feedback pass): "filed via" read as an
    // already-completed action rather than an available path.
    legalCitationExemptionRouteSentence:
      'The exemption route documented to date is a disproportionate burden waiver request, to be filed via Démarches Simplifiées.',
    legalCitationManualSirenWithFindingTemplate:
      'The SIREN number used for this determination was provided manually; this site does not publish it itself (see finding {findingId}).',
    legalCitationManualSirenNoFindingSentence:
      'The SIREN number used for this determination was provided manually; this site does not publish this number itself.',
    legalCitationSirenMismatchTemplate:
      'The manually supplied SIREN ({manualSiren}) differs from the one published on the site ({extractedSiren}). This determination uses the manually supplied number.',
    legalCitationPointerSentence: 'See the "Legal exposure" section for the detail of this determination.',
    socialExclusionDisclosureTemplate:
      '{count} pages were excluded from this scan as links to a third-party social platform, per Odysseus\'s default exclusion list.',
    socialExclusionDisclosureSingularTemplate:
      '1 page was excluded from this scan as a link to a third-party social platform, per Odysseus\'s default exclusion list.',
    crawlCapDisclosureTemplate:
      '{maxPages} pages is a configured cap for this audit, not the whole site: the site may have additional pages that were not analyzed.',
    sirenSourceResolvedTemplate: 'The SIREN number was confirmed as displayed on this page of the site: {url}.',
    lighthouseFailureIntroSentence:
      'Performance measurement (Lighthouse) did not complete on this site for this audit. Failure detail:',
    lighthouseFailureReasonTemplate: '{count}/{total} pages: {reason}',
  },
  footer: {
    confidentialityLabel: 'Confidential report',
    pageLabel: 'Page',
  },
};
