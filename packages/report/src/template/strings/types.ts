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
  /** TOC row labels are no longer a separate hand-typed array (report-
   *  feedback-palais-gallien.md item 3): section-registry.ts's
   *  sectionTitle() reads each row's label from that section's own
   *  `eyebrow` field below, so introducing a fourth independent copy of a
   *  section's name is impossible, not just discouraged. */
  toc: {
    eyebrow: string;
    heading: string;
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
    /** B9: heading over the WCAG fail-count line, which previously sat
     *  unlabelled at the bottom of the section, unlike the severity/
     *  category blocks above it which both have one. */
    wcagFailingHeading: string;
    severityBreakdownHeading: string;
    categoryBreakdownHeading: string;
    /** item 39: shown only when computeStatistics.hasBelowThresholdRenderGap
     *  is true - "Rendu : 0" otherwise reads as contradicting section
     *  08's own reported gap, when the real explanation is a below-
     *  threshold measured percentage, not a bug or an absence of gap. */
    belowThresholdRenderGapNote: string;
    legendCriticalText: string;
    legendSeriousText: string;
    legendModerateText: string;
    legendMinorText: string;
  };
  conformanceSummary: {
    eyebrow: string;
    heading: string;
    /** report.reference.html's first, longer fixed paragraph. */
    bodyIntro: string;
    /** report.reference.html's second, small fixed paragraph - restates
     *  that this criteria list doesn't rule on legal applicability, shown
     *  unconditionally (CLAUDE.md rule 6: state the criteria, never a
     *  verdict, regardless of whether section 11 reached a determination
     *  elsewhere). */
    scopeNote: string;
    criterionColumnLabel: string;
    criterionNameColumnLabel: string;
    findingsColumnLabel: string;
    occurrencesColumnLabel: string;
    pagesMaxColumnLabel: string;
    emptyState: string;
    /** item 8: heuristic-sourced findings (alt-text-quality-heuristic)
     *  never contribute to the criterion table above - they render here
     *  instead, in their own visually distinct block, so a heuristic red
     *  flag can never read as a confirmed WCAG criterion failure. */
    heuristicSectionHeading: string;
    heuristicSectionNote: string;
  };
  observations: {
    eyebrow: string;
    heading: string;
    wrapperTitle: string;
    /** Template: {findingIds}. */
    wrapperBodyTemplate: string;
    legalTitle: string;
    /** Template: {findingIds}. */
    legalBodyTemplate: string;
  };
  cover: {
    kicker: string;
    reportTitle: string;
    subtitle: string;
    siteLabel: string;
    dateLabel: string;
    pagesScannedLabel: string;
    /** Template: {count}. */
    pagesScannedValueTemplate: string;
    languageLabel: string;
    wcagReferentialLabel: string;
    riskSmallLabel: string;
    riskLevels: { low: string; medium: string; high: string };
    /** item 42: the badge showed no scale and no stated basis for how it
     *  was derived - the reader had no way to calibrate "Élevé" or verify
     *  how the tool got there. Template: {critical}, {serious}. */
    riskBasisTemplate: string;
    /** Manual-input-layer milestone: shown in the field grid only when
     *  AuditManualFields.recipientName is present. */
    recipientLabel: string;
    /** Rendered as a secondary line under the headline company identity
     *  only when AuditManualFields.raisonSociale is present. */
    legalNameLabel: string;
  };
  executiveSummary: {
    eyebrow: string;
    heading: string;
    /** Kicker over the "where to start" jump-link box (doc §3 section 01:
     *  prose + jump links, capped at 3). */
    startHereKicker: string;
    /** Template: {rank}, {title}. report-feedback-palais-gallien.md item
     *  5: standalone accessible link text ("Voir priorité 1 : lenteur
     *  d'affichage") instead of a bare "Voir →" repeated three times,
     *  which read as a decorative arrow with no stated destination. */
    jumpLinkLabelTemplate: string;
    /** item 16: shown only when the #1-ranked theme is not itself a
     *  legal-conformity item (theme.legalRelevance undefined), so the
     *  four pages of legal framing preceding the executive summary don't
     *  leave the reader to notice on their own that the lead
     *  recommendation is commercial, not legal. Template: {legalRank},
     *  the rank of the first theme (among those rendered) that does
     *  carry legalRelevance. */
    topPriorityIsNotLegalWithPointerTemplate: string;
    /** Same case, but no legal-relevant theme is among those rendered at
     *  all (no {legalRank} to point to). */
    topPriorityIsNotLegalNoPointer: string;
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
    /** item 17: relabeled from "Échéance EAA" (deadline, implying
     *  upcoming) - the obligation has been in force since this date, not
     *  approaching it. */
    eaaDeadlineLabel: string;
    eaaDeadlineValue: string;
    /** Template: {duration}, computed at render time from the fixed EAA
     *  date to the report's own generation date (never hardcoded, so it
     *  stays accurate as reports keep being generated after this date). */
    eaaDeadlineNoteTemplate: string;
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
    /** item 18: heading over the deterministic EAA-route enforcement
     *  facts (fine figure + neutral case-law state), rendered only when
     *  the resolved regime is EAA (methodology.ts's pickPrimaryBasis). */
    exposureHeading: string;
    /** item 24: prints the SIREN the headcount band's Sirene lookup was
     *  based on, so a lawyer or auditor can independently verify which
     *  entity the determination concerns. Template: {siren}, {date} (the
     *  audit date, the closest available proxy for when the Sirene-
     *  derived headcount band was current - no separate Sirene-lookup
     *  timestamp is stored). */
    sirenTemplate: string;
    sirenLabel: string;
    /** Shown instead of sirenTemplate when no SIREN was ever resolved for
     *  this scan (neither extracted nor manually supplied) - stated
     *  explicitly rather than omitting the field silently. */
    sirenUnavailable: string;
    disclaimerNote: string;
    /** B7: shown only when status is 'undetermined'. Names the single
     *  action that would resolve the status (publishing or supplying a
     *  SIREN) without asserting what the answer would be - CLAUDE.md rule
     *  6, "we report, we do not conclude". */
    undeterminedActionNote: string;
    /** item 28: the transactional/booking flow is the entire legal hook
     *  for the EAA obligation, but nothing stated whether the actual
     *  flow was in-scope for the crawl - a delegated off-domain booking
     *  engine (the common case for hotels, per project memory) sits
     *  outside a single-origin crawl entirely. Template: {pages}, a
     *  comma-joined list of crawled page URLs where the flow itself was
     *  found. */
    transactionalFlowOnSiteTemplate: string;
    /** Template: {domain}, the delegated booking-engine provider domain
     *  the redirect check resolved to (never crawled as part of this
     *  audit - a single-origin crawl by design). */
    transactionalFlowDelegatedTemplate: string;
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
    /** item 35: the printable checklist was a near-exact restatement of
     *  the priorities section with nothing added - these three columns
     *  give it something the priorities cards don't: finding IDs and
     *  WCAG criteria to look up, and blank space to actually use the
     *  page as a working checklist (note status/owner/date by hand). */
    findingsColumnLabel: string;
    wcagColumnLabel: string;
    statusDateColumnLabel: string;
  };
  themes: {
    eyebrow: string;
    /** Template: {count}. */
    headingTemplate: string;
    effortLabel: string;
    impactLabel: string;
    affectedPagesLabel: string;
    conformityLabel: string;
    conformityNotApplicable: string;
    conformityNonConformant: string;
    legalTagLabel: string;
    /** Label prefix for a reference-stat citation note, milestone 8.5c -
     *  shared by themes.ts (accessibility/seo themes) and
     *  findings-appendix.ts's geo section. */
    impactCitationLabel: string;
    /** item 14: Template: {value}, {gap}, {threshold} (all in seconds).
     *  Rendered under a per-0.1s performance citation only when this
     *  site's own measured LCP is above the "good" threshold, so the
     *  reader has the real gap next to the stat instead of being left to
     *  multiply the citation's 0.1s figure by an assumed gap themselves. */
    measuredLcpGapTemplate: string;
    quickWinBadgeLabel: string;
    /** item 27: theme.recommendedActions (llm-output.ts, LLM-writable,
     *  already validated for language and severity vocabulary) was
     *  generated on every analysis but never rendered - a theme card
     *  stated the problem and its impact without ever stating what to do
     *  about it. */
    recommendedActionsLabel: string;
    effortImpactLevels: { low: string; medium: string; high: string };
    /** Template: {pages}, {pageWord}, {totalPages}. */
    pagesOfTotalTemplate: string;
    refsLabel: string;
  };
  /** Doc §3: bars only, no screenshots - two proportional-width bars
   *  (raw vs rendered visible-text length) plus a one-line caption, never
   *  an <img>. Capped at the 3 worst pages by missingPercent. */
  renderDiffEvidence: {
    eyebrow: string;
    heading: string;
    intro: string;
    /** Template: {chars}. Bar caption above the raw-HTML bar. */
    rawBarLabelTemplate: string;
    /** Template: {chars}. Bar caption above the rendered bar. */
    renderedBarLabelTemplate: string;
    /** Template: {percent}, {selector}. */
    missingCaptionTemplate: string;
    /** B2: same sentence with no trailing "sur {selector}" clause, used
     *  when no selector is known (the 5-20% missingPercent band, where no
     *  render-diff finding exists to read one from) rather than filling
     *  the clause with a bare hyphen. Template: {percent}. */
    missingCaptionNoSelectorTemplate: string;
    /** Template: {count}. Shown when more than 3 pages met the inclusion
     *  threshold, e.g. "5 autres pages presentent le meme ecart, detail
     *  dans l'export technique." */
    overflowTextTemplate: string;
    /** B6: shown instead of an empty section when no commercial page has
     *  a meaningful render-diff gap after wrapper/legal pages are
     *  excluded - an absence of evidence is still evidence, not a blank
     *  box. */
    positiveStatementTemplate: string;
    /** Appended after positiveStatementTemplate only when at least one
     *  wrapper/legal page was excluded from consideration, naming that
     *  exception with a pointer to Observations rather than letting it go
     *  unmentioned. */
    positiveStatementWrapperNote: string;
  };
  /** Doc §3 section 09: 5 aggregated medians (LCP, TBT, FCP, Speed Index,
   *  CLS) across the whole scan, not a per-page table. */
  coreWebVitals: {
    eyebrow: string;
    heading: string;
    /** Template: {pages}. */
    introTemplate: string;
    metricColumnLabel: string;
    valueColumnLabel: string;
    thresholdColumnLabel: string;
    statusColumnLabel: string;
    lcpLabel: string;
    tbtLabel: string;
    fcpLabel: string;
    speedIndexLabel: string;
    clsLabel: string;
    notMeasured: string;
    ratingGoodLabel: string;
    ratingNeedsImprovementLabel: string;
    ratingPoorLabel: string;
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
    /** item 20: binary conforme/non-conforme per criterion - RGAA and
     *  EN 301 549 have no three-value status at the per-criterion level,
     *  only at the whole-document level. Replaces the old
     *  nonConformantPartialLabel, which blended the two vocabularies
     *  into a string that exists in neither. */
    nonConformantLabel: string;
    contactHeading: string;
    contactBody: string;
    /** Template: {email}. item 21: a scraped (provenance 'detected')
     *  contact email must never render as a finished value in a
     *  document the client might publish as-is. */
    contactEmailToConfirmTemplate: string;
    remediationPlanHeading: string;
    /** Template: {section}, the live canonical title of the priorities
     *  section (section-registry.ts's sectionTitle for 'section-04'),
     *  interpolated at render time rather than quoted as a fixed string -
     *  report-feedback-palais-gallien.md item 4: the previous fixed
     *  quote ("Priorités classées") matched neither the TOC label nor
     *  the section's own eyebrow, a broken cross-reference. */
    remediationPlanBodyTemplate: string;
    /** item 22: the six fields a real déclaration d'accessibilité needs
     *  beyond the per-criterion table and contact/remediation blocks,
     *  rendered as labeled "to complete" placeholders (this section was
     *  already described as a skeleton the client completes before
     *  publishing; these are visible gaps in that skeleton, not new
     *  data collection this session). */
    firstPublicationDateLabel: string;
    technologiesLabel: string;
    testEnvironmentLabel: string;
    nonAccessibleContentLabel: string;
    feedbackProcedureLabel: string;
    recoursePathLabel: string;
    toCompletePlaceholder: string;
  };
  glossary: {
    eyebrow: string;
    heading: string;
    /** item 33: `id` lets glossary.ts scope this list to the terms that
     *  actually appear in a given report (glossary.ts's
     *  GLOSSARY_TERM_CONDITIONS) rather than a static list that includes
     *  RGAA on an EAA-route report (which never mentions it, per item 19)
     *  and omits every performance-metric abbreviation and GEO/SEO term
     *  the report does use. `id` values are language-neutral and must
     *  match 1:1 between fr.ts and en.ts. */
    terms: readonly { id: string; term: string; definition: string }[];
  };
  nextSteps: {
    eyebrow: string;
    heading: string;
    questionTitle: string;
    /** Template: {email}. item 30 [REGRESSION]: previously said requests
     *  could go "directly to the Odysseus team" with no stated address -
     *  flagged once already, recurred once. */
    questionBodyTemplate: string;
    reauditTitle: string;
    reauditBody: string;
    postFixTitle: string;
    postFixBody: string;
    /** item 31: no authorship, terms, or liability block anywhere in a
     *  paid deliverable that may be forwarded to counsel. Template:
     *  {producer}, {date}, {version}, {reportId}. */
    authorshipTemplate: string;
    liabilityStatement: string;
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
    /** Badge text for a reference-stat whose confidence is 'emerging',
     *  milestone 8.5c - quarantines GEO citations per the source
     *  research doc's Stage 3 recommendation. */
    geoEmergingLabel: string;
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
    findingSingular: string;
    findingPlural: string;
    occurrenceSingular: string;
    occurrencePlural: string;
    pageSingular: string;
    pagePlural: string;
    upToLabel: string;
    wcagLabel: string;
    observationsCrossRefLabel: string;
    /** item 29: the list of crawled URLs was not printed anywhere - the
     *  client had no way to verify the scope they paid for beyond a bare
     *  count on the cover. Template: {count}. */
    crawledPagesHeadingTemplate: string;
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
    /** item 41: names the specific detected flow type (e.g. "réservation
     *  en ligne") instead of listing "réservation, panier ou paiement"
     *  with "ou", which read as the tool being unsure which one it
     *  detected. Template: {flowType}. "de premier niveau" (internal
     *  jargon) is dropped from the sentence entirely. */
    legalCitationTransactionalFlowFactTemplate: string;
    legalCitationTransactionalFlowUnknownFact: string;
    /** Plain-language labels for the specific flow type(s) actually
     *  detected (SiteSignals.transactionalFlowEvidence's own `kind`),
     *  substituted into legalCitationTransactionalFlowFactTemplate's
     *  {flowType}. */
    transactionalFlowTypeLabels: { booking: string; cartOrPayment: string; both: string };
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
    /** B9: replaces the full legal-citation paragraph (which used to be
     *  rendered a second time here, verbatim, duplicating legal-exposure's
     *  own copy of the same paragraph) with a one-line pointer back to
     *  that section - trade-off 11's "one function, called from two
     *  render sites" still holds, only the second render site changed
     *  from a full repeat to a cross-reference. */
    legalCitationPointerSentence: string;
    /** Manual-input-layer milestone: states how many pages the crawl
     *  excluded as third-party social platform links, per the versioned
     *  default exclusion list (packages/scanner/src/config/
     *  social-exclusion.json). Only rendered when the count is greater
     *  than zero. Template: {count}. */
    socialExclusionDisclosureTemplate: string;
    /** Manual-input-layer milestone: when the operator has confirmed
     *  where the SIREN/RCS/TVA is displayed on the site
     *  (AuditManualFields.sirenSourceUrl), the lcen-mentions-legales-
     *  missing finding is suppressed and this sentence states where it
     *  was found instead. Template: {url}. */
    sirenSourceResolvedTemplate: string;
  };
  footer: {
    confidentialityLabel: string;
    pageLabel: string;
  };
}
