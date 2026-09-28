import type { FindingCategory } from '@odysseus/core';

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
/** Keyed like rendered-priorities.ts's PriorityOwnership. */
export interface OwnershipTemplates<T> {
  'first-party-action': T;
  'third-party-escalation': T;
  'verify-intent': T;
}

/** The who-has-to-act sentence, assembled clause by clause in
 *  priority-ownership-note.ts. Split into per-clause singular/plural
 *  templates (issue #322) because one fixed sentence with three
 *  interpolated counts cannot agree with any of them, and cannot drop the
 *  clauses whose count is zero. Each clause template takes {count}; the
 *  lead-in takes {clauses}. */
export interface PriorityOwnershipStrings {
  leadTemplate: string;
  firstPartySingularTemplate: string;
  firstPartyPluralTemplate: string;
  thirdPartySingularTemplate: string;
  thirdPartyPluralTemplate: string;
  verifyIntentSingularTemplate: string;
  verifyIntentPluralTemplate: string;
  /** Between all clauses but the last pair. */
  clauseSeparator: string;
  /** Before the last clause; carries its own surrounding spacing and, in
   *  English, the serial comma the existing copy uses. */
  clauseConjunction: string;
}

export interface ReportStrings {
  accessibilityStatementGuidance: {
    heading: string;
    notFoundObservation: string;
    article47Recommendation: string;
    optionalRecommendation: string;
  };
  /** TOC row labels are no longer a separate hand-typed array (report-
   *  feedback-palais-gallien.md item 3): section-registry.ts's
   *  sectionTitle() reads each row's label from that section's own
   *  `eyebrow` field below, so introducing a fourth independent copy of a
   *  section's name is impossible, not just discouraged.
   *
   *  The six narrative group labels bind to the canonical tocGroups data in
   *  docs/report/design/report-mockup-standalone.flat.html (the reference
   *  template's TOC loop iterates the same data), plan 018 step 3. The
   *  French labels are the mockup's own wording, unchanged. */
  toc: {
    eyebrow: string;
    heading: string;
    overviewGroupLabel: string;
    priorityActionsGroupLabel: string;
    detailedResultsGroupLabel: string;
    regulatoryFrameworkGroupLabel: string;
    appendicesGroupLabel: string;
  };
  /** P3 (2026-08-21 La Corniche feedback pass): section-00, a new
   *  non-technical intro page before the résumé. Plan 018 step 5 reshaped
   *  it into a Situation, Complication, Question opening: the situation
   *  states the diagnostic's purpose, the complication states
   *  deterministic pages/findings/priorities facts plus the legal
   *  reminder, and the question renders the shared generic decision
   *  question (generic-question.ts), never a paraphrase of it. Nothing
   *  here may assert the client's bookings, traffic, growth, or legal
   *  obligations: criteria and verified inputs only. */
  reportIntro: {
    eyebrow: string;
    heading: string;
    situationHeading: string;
    situationBody: string;
    complicationHeading: string;
    /** The deterministic complication facts. {findings}, {pages} and
     *  {priorities} each arrive as a full "N noun(s)" phrase (formatNumber
     *  plus the singular/plural pairs below), since English and French
     *  both inflect the noun (issue #28: "1 pages" printed for a one-page
     *  scope; issue #322: "0 constats distincts" and "0 priorités" printed
     *  for an empty scope, where French takes the singular). Only
     *  {criticalSerious} is a bare pre-formatted count, so the sentence
     *  wording around it must stay inflection-free. The "at least" wording
     *  accounts for site-wide findings that carry no page URL. Template:
     *  {findings}, {criticalSerious}, {pages}, {priorities}. */
    complicationBodyTemplate: string;
    pageSingular: string;
    pagePlural: string;
    findingSingular: string;
    findingPlural: string;
    prioritySingular: string;
    priorityPlural: string;
    /** The legal reminder, pointing at the later legal section. Kept
     *  conditional ("peuvent s'appliquer" / "may apply") and deferring to
     *  counsel: client-claims.test.ts pins both properties. Template:
     *  {legalSection}, resolved through sectionTitle('section-02') and
     *  never a hardcoded number. */
    consequenceRegulatory: string;
    /** Overseas-domain variant: names no obligation, only where the regime
     *  question is addressed. */
    consequenceRegulatoryOverseas: string;
    /** Replaces consequenceRegulatory when the registry facts put the
     *  business under the EAA size criterion: "obligations may apply" read
     *  as contradicting the legal section's own status card. */
    consequenceRegulatoryBelowThresholds: string;
    /** The deterministic limitation statement offer-positioning.md
     *  requires, kept verbatim inside the sentence. Template:
     *  {legalSection}, {methodologySection}, both resolved through
     *  sectionTitle. */
    notALegalOpinionNote: string;
    audienceHeading: string;
    /** Role labels only. Matches
     *  the role vocabulary next-steps' synthesisRoles restates. */
    roleManagementLabel: string;
    roleTechnicalLabel: string;
    roleCommunicationsLabel: string;
    roleLegalLabel: string;
  };
  statistics: {
    eyebrow: string;
    heading: string;
    /** {pages} arrives as the full "N page(s) analyzed" phrase
     *  (formatNumber plus pagesAnalyzedSingular/pagesAnalyzedPlural
     *  below); {findings} is a bare formatted count. Template: {pages},
     *  {findings}. */
    introTemplate: string;
    pagesAnalyzedSingular: string;
    pagesAnalyzedPlural: string;
    findingsTileLabel: string;
    accessibilityOccurrencesTileLabel: string;
    /** item 1.8 (La Corniche pass): rendered only when
     *  stats.accessibilityHeuristicOccurrences > 0 - the tile above it
     *  excludes heuristic occurrences (a real report had 74 of 703, 10
     *  percent, come from alt-text-quality-heuristic alone with no
     *  caveat next to three genuinely hard counts). Template: {count}. */
    heuristicOccurrencesExcludedNoteTemplate: string;
    /** item 1.10 (La Corniche pass): rendered only when every Critique
     *  finding reduces to a small handful of rules (CRITICAL_DRIVER_MAX_
     *  RULES in statistics.ts, currently 3) - a real report had all 33
     *  Critique findings reduce to exactly 2 rules (image-alt, button-
     *  name) that both fire on every page, mechanically guaranteeing the
     *  "N/N pages" tile above without the reader knowing why until they
     *  reach the annex. Template: {rules}, a comma-joined list of
     *  translated rule titles. */
    criticalDriverNoteTemplate: string;
    /** P1.2 (2026-08-21 La Corniche feedback pass): rendered only when
     *  stats.thirdPartyAccessibilityOccurrences > 0 - surfaces the
     *  first-party/third-party split as a headline number instead of
     *  only in the annex's "À traiter avec vos prestataires tiers"
     *  section. Template: {percent}. */
    thirdPartyOccurrencesNoteTemplate: string;
    /** Template: {count}. Third-party frame-only occurrences stay in the
     *  technical annex and never enter the primary grade/counts. */
    thirdPartyFrameNoteSingularTemplate: string;
    thirdPartyFrameNotePluralTemplate: string;
    unlinkedSitemapNoteSingularTemplate: string;
    unlinkedSitemapNotePluralTemplate: string;
    /** Template: {count}. Findings of custom rules no real finding has
     *  confirmed yet (core's rule-confirmation.ts) stay in the annex's
     *  points to verify and never enter the totals or the grade. */
    unconfirmedRuleNoteSingularTemplate: string;
    unconfirmedRuleNotePluralTemplate: string;
    priorityOwnership: PriorityOwnershipStrings;
    pagesWithCriticalTileLabel: string;
    criticalTileLabel: string;
    seriousTileLabel: string;
    moderateTileLabel: string;
    minorTileLabel: string;
    /** {criteria} and {pages} each arrive as a full "N noun(s)" phrase
     *  (formatNumber plus the wcagCriterionSingular/Plural and
     *  pageSingular/Plural pairs below), so a one-criterion or one-page
     *  scope agrees grammatically (issue #28: "1 critères ... 1 pages"
     *  printed for a single-criterion, single-page failure). Template:
     *  {criteria}, {pages}. */
    wcagFailingDescriptionTemplate: string;
    wcagCriterionSingular: string;
    wcagCriterionPlural: string;
    pageSingular: string;
    pagePlural: string;
    /** B9: heading over the WCAG fail-count line, which previously sat
     *  unlabelled at the bottom of the section, unlike the severity/
     *  category blocks above it which both have one. */
    wcagFailingHeading: string;
    severityBreakdownHeading: string;
    categoryBreakdownHeading: string;
    /** item 39: shown only when computeStatistics.hasBelowThresholdRenderGap
     *  is true - "Rendu : 0" otherwise reads as contradicting section
     *  08's own reported gap, when the real explanation is a below-
     *  threshold measured percentage, not a bug or an absence of gap.
     *  item 1.12: states the threshold numerically rather than leaving it
     *  as an unexplained "below the threshold". Template: {threshold}
     *  (percent, RENDER_DIFF_EMISSION_THRESHOLD_PERCENT). */
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
    /** Points the reader at the section that does treat obligation status.
     *  Template: {section}, the referenced section's own canonical title.
     *  It used to hardcode "section 2", which named the wrong section:
     *  registry ids are stable keys, not ordinals, so a hand-typed number
     *  points wherever that section happens to sit that day (plan 018 moved
     *  `section-02` behind the evidence and the action synthesis).
     *  Referencing by title, the way accessibility-statement.ts already
     *  does, cannot drift when a section is suppressed and the ordinals
     *  shift. */
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
    /** item 1.2: rendered under the criterion table only when at least
     *  one finding maps to more than one WCAG criterion (hasMultiCriterion
     *  Finding in conformance-rollup.ts), so the occurrence column's total
     *  legitimately exceeding the accessibility-occurrences tile is
     *  explained rather than left for an agency to puzzle out. */
    multiCriterionNote: string;
    /** Issue #335: under a criterion row whose figures come from exactly
     *  the same findings as an earlier row. `{criterion}` is that row's
     *  number. */
    sameFindingsAsTemplate: string;
  };
  coverage: {
    /** Issue #324: the plain scope line, {analysed} and {found} being full
     *  "N word(s)" phrases. */
    plainSummaryTemplate: string;
    analysedPageSingular: string;
    analysedPagePlural: string;
    foundAddressSingular: string;
    foundAddressPlural: string;
    /** Templates: {inventory}, {content}, {contentCompleted},
     *  {contentPartial}, {contentFailed}, {lighthouse}, {lighthousePartial},
     *  {lighthouseFailed}, {lighthouseNotPlanned} - each a full composed
     *  "N word(s)" phrase built with the singular/plural pairs below, not a
     *  bare count (issue #28), except {contentFailed} and {lighthouseFailed}
     *  themselves, which stay a bare count against invariant static text in
     *  the template since "failed"/"en échec" never inflects. */
    summaryTemplate: string;
    inventoriedUrlSingular: string;
    inventoriedUrlPlural: string;
    pageSingular: string;
    pagePlural: string;
    completedSingular: string;
    completedPlural: string;
    partialSingular: string;
    partialPlural: string;
    measuredSingular: string;
    measuredPlural: string;
    lighthousePartialSingular: string;
    lighthousePartialPlural: string;
    notPlannedSingular: string;
    notPlannedPlural: string;
    /** Template: {inventory}. */
    legacyUnknownTemplate: string;
    /** Template: {reasons}. */
    withoutContentTemplate: string;
    /** Template: {count}. */
    guardedOmissionsTemplate: string;
    /** Template: {count}. */
    noindexTemplate: string;
    /** Template: {count}. Site-wide absence claims that need manual review
     * because blocked or failed candidate pages made the population
     * incomplete. */
    coverageLimitationTemplate: string;
    reasonLabels: Record<
      | 'discovered-not-scanned'
      | 'skipped-robots'
      | 'skipped-non-html'
      | 'skipped-external-redirect'
      | 'error'
      | 'http-error-status'
      | 'redirect-interstitial'
      | 'language-redirect'
      | 'soft-error-page'
      | 'blocked'
      | 'coverage-missing',
      { singular: string; plural: string }
    >;
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
    /** Issue #325: the accessibility-statement block printed a bare "f066"
     *  under its paragraph. Template: {findingIds}. */
    relatedFindingSingularTemplate: string;
    relatedFindingPluralTemplate: string;
  };
  remainingWork: {
    eyebrow: string;
    heading: string;
    /** Template: {count}, {prioritiesSection}. */
    introTemplate: string;
    /** Shown instead of the whole section body when the ranked priorities
     *  already account for every finding. */
    nothingRemaining: string;
    findingSingular: string;
    findingPlural: string;
    occurrenceSingular: string;
    occurrencePlural: string;
    pageSingular: string;
    pagePlural: string;
    /** Template: {findingIds}. */
    findingRefsTemplate: string;
    /** Fixed note under the heading, stating what this section is not. */
    scopeNote: string;
    /** Plan 041 Part A: label above a rule's deterministic fix snippet,
     *  shown only when one exists for that rule. */
    fixSnippetLabel: string;
    /** Shown beside a fill-in-blank snippet, whose blank the client must
     *  complete themselves rather than paste as-is. */
    fixSnippetFillInBlankNote: string;
  };
  /** The minimal cover (plan 018 step 4): kicker, commercial-name headline,
   *  the generic decision question, the report-type line, the audit date and
   *  the Odysseus signature. Everything the old cover used to carry (site,
   *  date, scope, language, referential, legal name, risk scale) moved to
   *  the metadata group below, which renders as the second physical page. */
  cover: {
    kicker: string;
    /** The document title fallback: the headline identity is nomCommercial,
     *  then the manifest hostname, then this. Also the <title> tag's first
     *  half (render-html.ts). */
    reportTitle: string;
    /** The concise report-type line. item 3.8's reasoning carries over from
     *  the old referential field: this product always audits all four
     *  categories, and a clean category is still part of what was checked.
     *  Performance is the only one a scanner-level failure can remove for a
     *  whole run (see metadata.wcagReferentialValue's note), so it is the
     *  one category with its own drop variant. */
    reportType: string;
    /** Same line with "Performance" removed, shown instead when
     *  core-web-vitals-table.ts's hasMeasuredCoreWebVitals is false. */
    reportTypeNoPerformance: string;
    /** item 3.9: no longer rendered anywhere (the old cover's "Préparé
     *  pour" line printed the client's company name a third time next to
     *  the H1 and the legal-name row, with no distinct contact-person field
     *  to hold instead). Kept in ReportStrings only because
     *  AuditManualFields.recipientName itself is left in place for a future
     *  session to wire to a real contact-person input; unused until that
     *  input exists. */
    recipientLabel: string;
  };
  /** The second physical page, between the cover and the table of contents
   *  (plan 018 step 4): audit identity and scope as a plain fact sheet, plus
   *  the risk scale the minimal cover no longer carries. Unnumbered chrome
   *  like the cover and the TOC: no SECTION_IDS entry, no live ordinal. */
  metadata: {
    eyebrow: string;
    heading: string;
    siteLabel: string;
    dateLabel: string;
    pagesScannedLabel: string;
    /** Count-agreeing noun for the pages-scanned value: a one-page audit
     *  reads "1 page analyzed", not "1 pages analyzed" (issue #28). */
    pagesScannedSingular: string;
    pagesScannedPlural: string;
    /** item 3.8: states all four categories this product always audits
     *  (CATEGORY_ORDER, statistics.ts), not conditioned on whether findings
     *  exist in each - a clean category is still part of what was checked.
     *
     *  report-feedback-la-corniche.md item 0.3: "always audits" stopped
     *  being true for Performance the moment a real site made Lighthouse
     *  fail on every page - the sheet still claimed Performance while
     *  section 09 printed nothing but "Non mesuré" rows. Performance is
     *  the only one of the four categories a scanner-level failure can
     *  remove entirely for a whole run (accessibility/SEO/GEO come from
     *  axe and custom checks, which don't share Lighthouse's failure
     *  mode), so this is the one category with its own drop variant
     *  rather than a general N-of-4 combinator. */
    wcagReferentialLabel: string;
    wcagReferentialValue: string;
    /** Same value with "Performance" removed, shown instead when
     *  hasMeasuredCoreWebVitals is false. */
    wcagReferentialValueNoPerformance: string;
    /** Rendered as its own row only when AuditManualFields.raisonSociale is
     *  present - the legal identity lives here, on the fact sheet, never
     *  above the trading name on the cover. */
    legalNameLabel: string;
    riskSmallLabel: string;
    riskLevels: { low: string; medium: string; high: string };
    /** item 42: the badge showed no scale and no stated basis for how it
     *  was derived - the reader had no way to calibrate "Élevé" or verify
     *  how the tool got there. Template: {critical}, {criticalWord},
     *  {serious}, {seriousWord} - the word params exist because item 0.5
     *  shipped "1 constats sérieux" with no singular/plural branch. */
    riskBasisTemplate: string;
    /** item P4 (La Corniche pass, raised across three feedback passes):
     *  states plainly that overallRisk is a holistic judgment (severity
     *  mix and reach), not a numeric cutoff - there is no fixed threshold
     *  to print, since none exists in how the level is actually decided
     *  (the structure pass's own model judgment, structure-prompt.ts). */
    riskScaleBasisNote: string;
    /** Plan 041 Part A: the deterministic grade shown beside the risk
     *  badge, never merged with it (the risk badge is an LLM judgement
     *  call, `overallRisk`; this grade is computed purely from scanner
     *  findings). */
    scorecardLabel: string;
    /** Mandatory sentence shown with every grade, never omitted
     *  (render-scorecard.ts enforces this by construction): the operator's
     *  chosen mitigation for showing a grade at all without overstating
     *  legal exposure (non-negotiable rule 6). */
    scorecardDisclaimer: string;
    criticalFindingSingular: string;
    criticalFindingPlural: string;
    seriousFindingSingular: string;
    seriousFindingPlural: string;
  };
  executiveSummary: {
    eyebrow: string;
    heading: string;
    /** Issue #57: the executive regulatory-context block, rendered only
     *  when the obligation engine's gate holds (status in_scope or
     *  likely_in_scope with EAA as the primary basis), the same gate as
     *  legal-exposure.ts's general EAA reference card. Carries the
     *  criterion, the unchanged eaaSanctionFigureSentence spliced from
     *  core (never restated here), and the lawyer-confirmation
     *  recommendation - never a deadline, never a verdict. */
    regulatoryContextKicker: string;
    /** The criterion-stating sentence; names the detailed legal section
     *  by title, not number. */
    regulatoryContextCriterion: string;
    /** States that the general figure above is not this client's
     *  sanction, and recommends legal confirmation. */
    regulatoryContextCounsel: string;
    priorityOwnership: PriorityOwnershipStrings;
    /** Kicker over the "where to start" jump-link box (doc §3 section 01:
     *  prose + jump links, capped at 3). */
    startHereKicker: string;
    /** item 3.5: the glossary sat 32 pages later with no pointer to it
     *  from the front of the report, so a term the client needed on page
     *  3 (constat, LCP, GEO...) went undefined until the very end.
     *  References the glossary section by name, not number, matching the
     *  existing cross-reference pattern (methodology.ts's
     *  legalCitationPointerSentence) - a hardcoded page/section number
     *  would drift the next time section ordering changes. */
    glossaryPointerSentence: string;
    /** P1.2 (2026-08-21 La Corniche feedback pass): rendered only when
     *  stats.thirdPartyAccessibilityOccurrences > 0, restating
     *  statistics.ts's own footnote in the résumé since it's the section
     *  most likely to be read in full by a non-technical director.
     *  Template: {percent}. */
    thirdPartySplitSentenceTemplate: string;
    /** P2.4 (2026-08-21 La Corniche feedback pass): rendered only when
     *  accessibility findings dominate (>= 80% of total) and SEO+GEO
     *  together contributed at least one finding - see
     *  ACCESSIBILITY_DOMINANCE_THRESHOLD in executive-summary.ts. */
    categoryImbalanceNote: string;
    /** Template: {rank}. report-feedback-palais-gallien.md item 5:
     *  standalone accessible link text ("Voir priorité 1") instead of a
     *  bare "Voir →" repeated three times, which read as a decorative
     *  arrow with no stated destination. item 3.4 (v2 pass): originally
     *  also carried {title}, duplicating the theme title already shown
     *  in the adjacent span - dropped, since the rank plus that adjacent
     *  span already give the link stand-alone text without repeating it. */
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
    /** report-feedback-la-corniche.md item 0.4: template-bound, not
     *  written by the LLM - the writing pass used to be asked to cite
     *  siteStats figures verbatim in executiveSummary, which drifted from
     *  the report's actual bound counts whenever something at render time
     *  (the LCEN manual-resolution removal, most concretely) changed the
     *  finding set after the writing pass had already run. Template:
     *  {actionable} (critical + serious count), {critical}, {serious},
     *  {total} (distinct findings). Since plan 018 step 6, rendered
     *  beneath the model's qualitative prose: the summary leads, the
     *  template-owned counts follow. */
    summaryCountsTemplate: string;
    /** The counted phrases {actionable} and {critical} are filled with, so
     *  a count of one agrees ("1 critique", "1 that is critical") instead of
     *  the fixed plural a bare number inside the template forced. Template:
     *  {count}. Chosen through html-utils.ts's pluralize. */
    actionableCountSingularTemplate: string;
    actionableCountPluralTemplate: string;
    criticalCountSingularTemplate: string;
    criticalCountPluralTemplate: string;
    /** Fix #1, 2026-08-25 report review: bridges the site-wide count in
     *  summaryCountsTemplate to the 6-card Priorities section, which does
     *  not cover every critical/serious finding (themes.ts's
     *  MAX_RENDERED_THEMES cap). Template: {covered}, {remainingSection}
     *  (section-05b's own title, via sectionTitle). {total} is the same
     *  distinct-findings total summaryCountsTemplate states, named here
     *  because that sentence ends on the critical/serious subtotal, so a
     *  bare "covers N of them" had two candidate denominators.
     *  Rendered only when there is a genuine remainder. */
    coveredByPrioritiesTemplate: string;
    /** Same sentence when some of the rest are presented in the
     *  observations section instead: {observationsSection}. */
    coveredByPrioritiesWithObservationsTemplate: string;
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
    /** out_of_scope when the registry facts, not a missing flow, resolved
     *  it: the published size criterion the facts fall under, stated as a
     *  comparison of inputs, never as an exemption verdict. */
    outOfScopeSmeShortDescription: string;
    /** Card title paired with outOfScopeSmeShortDescription. */
    outOfScopeSmeLabel: string;
    /** Public reference variants: the legal inputs in the detached showcase
     *  are fictional and must never read as a registry-backed client fact. */
    syntheticStatusShortDescriptions: {
      in_scope: string;
      likely_in_scope: string;
      out_of_scope: string;
      undetermined: string;
    };
    /** item 18: heading over the deterministic EAA-route enforcement
     *  facts (fine figure + neutral case-law state), rendered only when
     *  the resolved regime is EAA (methodology.ts's pickPrimaryBasis). */
    exposureHeading: string;
    /** Plan 020: labels the one deterministic general EAA reference.
     *  The sentence below it comes unchanged from core and is never
     *  presented as this client's exposure. */
    generalEaaReferenceHeading: string;
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
    overseasStatusLabel: string;
    overseasStatusDescription: string;
    /** item 28: the transactional/booking flow is the entire legal hook
     *  for the EAA obligation, but nothing stated whether the actual
     *  flow was in-scope for the crawl - a delegated off-domain booking
     *  engine (the common case for hotels, per project memory) sits
     *  outside a single-origin crawl entirely.
     *
     *  P0.3 (2026-08-21 La Corniche feedback pass): rewritten from a raw
     *  comma-joined dump of every page the mechanism appeared on (which
     *  included legal-notice pages like /cookies/, implying the booking
     *  funnel itself lived there) to a mechanism statement naming the
     *  actual detected component(s). Template: {vendors} (comma-joined
     *  detected vendor names), {examplePages} (a short comma-joined
     *  sample, not the exhaustive list). */
    transactionalFlowOnSiteTemplate: string;
    /** Fallback for transactionalFlowOnSiteTemplate when no known vendor
     *  prefix matched any evidence selector - still a component, just not
     *  attributable to a named product. Template: {examplePages}. */
    transactionalFlowOnSiteNoVendorTemplate: string;
    /** No placeholders: deliberately does not name the delegated
     *  provider's domain, even when the redirect check resolved one -
     *  the detector's booking-intent text match cannot reliably tell a
     *  room-booking engine apart from an unrelated activity/tour vendor
     *  that happens to use the same "book"/"réserver" vocabulary, and a
     *  wrongly named provider in this legally sensitive section is worse
     *  than an unnamed one. The provider's domain was never crawled as
     *  part of this audit (a single-origin crawl by design) either
     *  way. */
    transactionalFlowDelegatedTemplate: string;
    /** item 0.1/1.11: printed instead of sirenTemplate whenever a real
     *  Sirene lookup succeeded (ObligationAssessment.registrySnapshot is
     *  set) - "report, don't conclude" requires every registry input
     *  stated, not just the SIREN. Template: {denomination}, {siren},
     *  {effectifs}, {date}, {source}. */
    registrySnapshotTemplate: string;
    /** Fallback for {effectifs} above when the headcount band is null
     *  (Sirene's field unreliable for this entity, or the lookup never
     *  resolved one). */
    registrySnapshotEffectifsUnavailable: string;
    syntheticRegistrySnapshotTemplate: string;
    syntheticRegistrySnapshotNote: string;
    /** P2.1 (2026-08-21 La Corniche feedback pass): rendered under
     *  registrySnapshotTemplate whenever a real snapshot exists - a
     *  registry denomination can carry formatting artifacts (an
     *  unbalanced parenthesis, seen on a real report) that read as a
     *  scraping error without this note. */
    /** A7b: the LCEN identification obligation block. Renders only when the
     *  lcen-mentions-legales-missing finding is present. Every legal word in
     *  it is spliced from regimes.ts; these strings carry only the framing
     *  and the scan-limitation caveat. docs/rules/obligation-basis.md section 8bis. */
    lcenKicker: string;
    lcenObserved: string;
    lcenSourceTemplate: string;
    lcenScanLimitNote: string;
    registrySnapshotVerbatimNote: string;
    syntheticDisclaimerNote: string;
    /** item 0.1: shown when a manual hasTransactionalFlow override
     *  disagrees with the detector (ObligationAssessment.
     *  siteSignalResolutions.hasTransactionalFlow.detectedValue set).
     *  Template: {manualValue}, one of transactionalFlowConflictManual
     *  Absent/Present below. */
    transactionalFlowConflictTemplate: string;
    transactionalFlowConflictDetectedAbsent: string;
    transactionalFlowConflictDetectedPresent: string;
    transactionalFlowConflictManualAbsent: string;
    transactionalFlowConflictManualPresent: string;
    /** Issue #42: shown when the obligation engine resolved the flow gate
     *  to likely_in_scope via a 'transactional-flow-inconclusive' fact -
     *  booking controls were detected but their destination could not be
     *  established, which is a stronger hint than a plain "to be
     *  confirmed" and must not be silently interchangeable with a clean
     *  negative. Template: {examplePages}, a short comma-joined sample. */
    transactionalFlowInconclusiveTemplate: string;
    /** Fallback when the stored siteSignals carry no resolvable example
     *  pages for the inconclusive detection. */
    transactionalFlowInconclusiveNoExample: string;
  };
  /** Pure re-presentation of analysis.themes (rank/title/effort/impact/
   *  pages) as a dense, printable table - no new data, no new logic. */
  checklist: {
    eyebrow: string;
    heading: string;
    /** Issue #317: the tag that marks this page as the light printable
     *  insert, so its light ground reads as intended between dark pages. */
    insertTag: string;
    intro: string;
    rankColumnLabel: string;
    priorityColumnLabel: string;
    complexityColumnLabel: string;
    impactColumnLabel: string;
    pagesColumnLabel: string;
    /** item 35: the printable checklist was a near-exact restatement of
     *  the priorities section with nothing added - these three columns
     *  give it something the priorities cards don't: finding IDs and
     *  WCAG criteria to look up, and blank space to actually use the
     *  page as a working checklist (note status/owner/date by hand). */
    findingsColumnLabel: string;
    wcagColumnLabel: string;
    /** item 2.7: no company name or date lives on this page - once printed
     *  or captured alone (the promise its own intro states) it carried no
     *  way to tell whose checklist it was or from when. Template:
     *  {company}, {date}. */
    identifierTemplate: string;
  };
  themes: {
    eyebrow: string;
    /** Template: {count}. */
    headingTemplate: string;
    /** P1.5 (2026-08-21 La Corniche feedback pass): a coarse, deterministic
     *  aggregate developer-day band computed off the rendered priority
     *  cards' own effort labels (packages/core's
     *  estimateAggregateEffortDays) - not an LLM-generated claim.
     *  Template: {min}, {max}, {count}. */
    aggregateEffortEstimateTemplate: string;
    effortLabel: string;
    impactLabel: string;
    /** Complexity/effort rating values, grammatically separate from the
     *  impact ramp: French "complexité" is feminine ("Élevée"/"Moyenne"),
     *  so the card and checklist complexity columns cannot reuse
     *  effortImpactLevels without a gender error (issue #305). */
    effortLevels: { low: string; medium: string; high: string };
    affectedPagesLabel: string;
    conformityLabel: string;
    conformityNotApplicable: string;
    /** P2.2 (2026-08-21 La Corniche feedback pass): shown inline,
     *  parenthetically, next to the first rendered card whose
     *  conformityValue is conformityNotApplicable - not repeated on
     *  every card that shares the value. Issue #47: the gloss sits on
     *  the card's "Exigence de conformité" box (which states
     *  conformityNotApplicable for non-accessibility themes), not on the
     *  footer strip, which no longer prints a second "Sans objet" line
     *  saying the same thing. */
    conformityNotApplicableGloss: string;
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
    /** D7: names the metric the priority's own findings are about. Was
     *  hardcoded to LCP, which put "median LCP at 4 s" under a priority
     *  about total blocking time. Templates: {metric}, {value}, {gap},
     *  {threshold} - values arrive pre-formatted with their own unit,
     *  since TBT is quoted in ms where LCP is quoted in seconds. */
    measuredCoreWebVitalGapTemplate: string;
    /** 2026-08-22 revenue-impact wiring. Template: {turnover}, {impact}
     *  (both pre-formatted euro amounts via formatNumber; the currency
     *  marker is baked into the template text itself, same convention as
     *  next-steps.ts's reauditPricingTemplate). Rendered only when the
     *  cited stat is 'scales-down' and the client's own Sirene-sourced
     *  turnover is known (ObligationAssessment.registrySnapshot.
     *  turnoverEur) - never a guessed revenue figure. Deliberately hedged
     *  language ("up to", "a single-study estimate") rather than a bare
     *  number: see CLAUDE.md's reference-stats trade-offs for why an
     *  unhedged euro figure was rejected as overclaiming. */
    revenueImpactTemplate: string;
    quickWinBadgeLabel: string;
    actionLevelLabels: { priority: string; important: string; improvement: string };
    /** item 27: theme.recommendedActions (llm-output.ts, LLM-writable,
     *  already validated for language and severity vocabulary) was
     *  generated on every analysis but never rendered - a theme card
     *  stated the problem and its impact without ever stating what to do
     *  about it. */
    recommendedActionsLabel: string;
    reviewedRemediationLabel: string;
    /** Plan 041 Part A: label above a priority rule's deterministic fix
     *  snippet, shown only when one exists for that rule. */
    fixSnippetLabel: string;
    /** Shown beside a fill-in-blank snippet, whose blank the client must
     *  complete themselves rather than paste as-is. */
    fixSnippetFillInBlankNote: string;
    /** A priority card's correction ownership, naming only the non-zero
     *  groups. Template: {parts}, the joined ownershipPartTemplates. */
    ownershipSummaryTemplate: string;
    /** One non-zero ownership group. Template: {count}. */
    ownershipPartTemplates: OwnershipTemplates<string>;
    /** Every correction of the card sits in one group, so a "breakdown"
     *  would list a single item. `many` template: {count}. */
    ownershipSingleGroupTemplates: OwnershipTemplates<{ one: string; many: string }>;
    effortImpactLevels: { low: string; medium: string; high: string };
    /** Template: {pages}, {pageWord}, {totalPages}. */
    pagesOfTotalTemplate: string;
    refsLabel: string;
    /** P1.2 (2026-08-21 La Corniche feedback pass): rendered only when a
     *  theme's findings span both first- and third-party pages. Template:
     *  {firstPartyPages}, {firstPartyPageWord}, {thirdPartyPages},
     *  {thirdPartyPageWord}, {vendor}. */
    ownershipSplitTemplate: string;
    /** Fallback for {vendor} above when no known vendor prefix matched
     *  any third-party finding's selector. */
    ownershipSplitUnknownVendorLabel: string;
    /** Fix #2, 2026-08-25 report review: companion to ownershipSplitTemplate
     *  for the case that template deliberately skips, a theme whose
     *  findings are entirely third-party. Template: {vendor} (a known
     *  vendor name, or ownershipSplitUnknownVendorLabel as fallback). */
    thirdPartyOnlyTemplate: string;
    /** Fix #3, 2026-08-25 report review: rendered on a priority card whose
     *  findings include the LCEN identification finding, pointing back to
     *  the legal-exposure section where the criterion, citation and scan
     *  observation are spliced deterministically (CLAUDE.md trade-off 28).
     *  Template: {legalSection} (section-02's own title, via
     *  sectionTitle). */
    lcenCrossReferenceTemplate: string;
    /** Plan 018 step 6, card block 2: label over theme.businessImpact,
     *  so the card reads outcome ("why it matters") before evidence. */
    whyItMattersLabel: string;
    /** Plan 018 step 6, card block 3: label over the deterministic
     *  observation. The block is never counts alone: the representative
     *  defect label always leads the sentence, and the representative
     *  page plus the exact page and occurrence counts state that
     *  defect's scale. */
    observationLabel: string;
    /** Card block 3 body when the priority's evidence carries at least
     *  one page URL. Template: {defect} (the representative finding's
     *  shared-helper display label), {page} (the representative page
     *  URL), {pages}, {pageWord}, {occurrences}, {occurrenceWord}. */
    observationWithPageTemplate: string;
    /** Card block 3 body for zero-page evidence: no finding in the
     *  priority carries a page URL, so no page can be named. Template:
     *  same params as observationWithPageTemplate minus {page}. */
    observationNoPageTemplate: string;
    /** Plan 018 step 6, card block 4: label over the existing recommended
     *  and reviewed remediation lists and the ownership notes. */
    whatYouCanDoLabel: string;
    /** Printed at the top of a priority card's continuation when the card
     *  breaks across pages, so the second fragment names the card it
     *  belongs to. Template: {rank}. */
    continuedCardTemplate: string;
    /** Plan 018 step 6, card block 6: footer metadata label over
     * theme.effort. The plan renames this footer item "Complexity" and
     * confines the word to this one detailed card (plan 018 step 5
     * removes effort from the opening's action sentence). */
    complexityLabel: string;
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
    /** Shown in place of the two character-count bars when both
     *  rawTextLength and renderedTextLength are unmeasured for a page
     *  (item 0.3: drawing bars from unknown data is worse than drawing
     *  none, so the pair is suppressed entirely rather than labelled
     *  with a placeholder). */
    charCountsUnavailableNote: string;
    /** Template: {percent}, {selector}. */
    missingCaptionTemplate: string;
    /** B2: same sentence with no trailing "sur {selector}" clause, used
     *  when no selector is known (the 5-20% missingPercent band, where no
     *  render-diff finding exists to read one from) rather than filling
     *  the clause with a bare hyphen. Template: {percent}. */
    missingCaptionNoSelectorTemplate: string;
    /** Template: {count}. Shown when more than 3 pages met the inclusion
     *  threshold, e.g. "5 autres pages presentent le meme ecart, detail
     *  dans l'export technique." Plural form; count is always > 1 to
     *  reach this template (see overflowTextSingularTemplate). */
    overflowTextTemplate: string;
    /** item 3.2: count === 1 case ("1 autre page présente..."), which the
     *  plural template above got wrong when used for every count
     *  ("1 autres pages présentent..."). */
    overflowTextSingularTemplate: string;
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
    /** Labels the simulated Lighthouse block so it cannot be mistaken for
     *  the preceding Chrome UX Report field-data table. */
    labHeading: string;
    /** Template: {pages}, a full "N page(s)" phrase built with
     *  pageSingular/pagePlural below, not a bare count - issue #28. */
    labIntroTemplate: string;
    pageSingular: string;
    pagePlural: string;
    metricColumnLabel: string;
    valueColumnLabel: string;
    realUserValueColumnLabel: string;
    /** item 1.7/B2: a metric's aggregated finding severity is driven by
     *  the worst page (severity.ts's maxSeverity dedupe rule), not the
     *  median this table otherwise shows - showing the worst page's own
     *  value here lets a "Critique" finding sitting next to a median-based
     *  "a ameliorer" status make sense without extra prose. */
    worstPageColumnLabel: string;
    /** Shown in the worst-page column when the worst page equals the
     *  median (no outlier). */
    worstPageSameAsMedian: string;
    /** One-line footnote under the table explaining what the worst-page
     *  column is and why it can outrank the median's own status. */
    worstPageFootnote: string;
    thresholdColumnLabel: string;
    statusColumnLabel: string;
    lcpLabel: string;
    tbtLabel: string;
    fcpLabel: string;
    speedIndexLabel: string;
    clsLabel: string;
    notMeasured: string;
    unstableMeasurement: string;
    unstableNoteTemplate: string;
    ratingGoodLabel: string;
    ratingNeedsImprovementLabel: string;
    ratingPoorLabel: string;
    /** report-feedback-la-corniche.md item 0.3: shown instead of the
     *  whole table (thresholds and worst-page footnote included) when
     *  hasMeasuredCoreWebVitals is false - a real report had Lighthouse
     *  fail on every single page and still printed a 5-row table of
     *  "Non mesuré" as though it were data, with the cover claiming
     *  Performance among the audited categories. */
    allUnmeasuredNote: string;
    /** Milestone 8.6: Chrome UX Report (CrUX) real-user field data,
     *  rendered as a second block under the existing lab-data table
     *  (same section, not a new one - see manifest.ts's own doc comment
     *  on why lab and field data are kept as two blocks of one story
     *  rather than two competing sections). */
    realUserHeading: string;
    realUserIntro: string;
    /** Shown when CrUX has no public record for this origin (most
     *  audited sites, given CrUX's own minimum-traffic threshold) or
     *  CRUX_API_KEY was not configured for this audit. Both cases render
     *  identically on purpose (manifest.ts's own doc comment): the
     *  distinction only matters for internal debugging, never to the
     *  client, and this note must never read as a pass. */
    realUserNoDataNote: string;
    /** 2026-08-22, La Corniche report review: lab data (above) measures
     *  a deliberately harsh worst-case simulation (4x CPU throttling,
     *  simulated slow mobile network, single cold run), while CrUX
     *  measures real visitors on real devices and real connections - a
     *  large gap between the two (a real report showed lab LCP over 8x
     *  CrUX's) is expected, not a data error, but read unexplained on
     *  facing tables it looks like the report contradicts itself. Shown
     *  only when both blocks actually render (lab data was measured AND
     *  CrUX has a public record) - the gap only exists to explain once
     *  both numbers are on the page together. */
    realUserGapNote: string;
    /** Issue #334: under the lab table when the lab LCP median is at least
     *  LAB_FIELD_LCP_DIVERGENCE_FACTOR times a good real-user p75. The
     *  lab median carries a " *" pointing here. `{lab}` and `{field}` are
     *  formatted durations. */
    labLcpDivergenceTemplate: string;
    /** Public reference variants: source field measurements remain useful,
     *  but must not read as measurements belonging to the synthetic example
     *  hostname. */
    referenceRealUserHeading: string;
    referenceRealUserNoDataNote: string;
    referenceRealUserGapNote: string;
    referenceLabLcpDivergenceTemplate: string;
    inpLabel: string;
  };
  /** Milestone 10. A deterministic splice comparing this site's own
   *  severity-weighted score against the frozen benchmark cohort's
   *  scores - never an LLM sentence (design doc, "In-report percentile
   *  section"). Absent from a report entirely (see
   *  hasBenchmarkPercentile in benchmark-percentile.ts) until manifest.ts's
   *  optional benchmarkPercentile field is populated for that audit. */
  benchmarkPercentile: {
    eyebrow: string;
    heading: string;
    /** Template: {percentile}, {cohortSize}. The percentile is the design
     *  doc's literal definition (share of the cohort with a strictly
     *  lower, meaning better, score), stated as-is rather than reframed
     *  as "you beat X%", so the report never claims more than the
     *  computed fact says. */
    scoredBodyTemplate: string;
    /** Template: {earliest}, {latest}. Printed beside the percentile so
     *  the reader sees the comparison's own provenance, never a bare
     *  number. */
    scanDateRangeTemplate: string;
    /** Shown instead of a percentile when the cohort has not yet reached
     *  the minimum floor - never a fabricated approximate number. */
    tooSmallBody: string;
  };
  /** Plan 051: the re-audit's findings delta, rendered only when the
   *  orchestration layer found a delivered baseline audit. Every sentence
   *  is deterministic; nothing here is model-written. */
  findingsDelta: {
    eyebrow: string;
    heading: string;
    /** Template: {date}, the baseline audit's date. */
    introTemplate: string;
    countLabels: {
      new: string;
      'newly-observable': string;
      'changed-severity': string;
      resolved: string;
      'not-comparable': string;
      persistent: string;
    };
    newHeading: string;
    /** Plan 059: findings from a check or surface the baseline audit could
     *  not observe - never framed as a new regression. */
    newlyObservableHeading: string;
    newlyObservableNote: string;
    changedSeverityHeading: string;
    resolvedHeading: string;
    /** A finding no longer detected is not proof of a fix: the page may
     *  not have been analysed this time. Stated under the resolved table. */
    resolvedNote: string;
    /** Plan 059: baseline findings whose check or surface is no longer
     *  comparable - disclosed, never counted as resolved. */
    notComparableHeading: string;
    notComparableNote: string;
    /** Plan 059: scope/inventory changes disclosed beside rescoped
     *  pairing, only when both runs carried coverage signatures. */
    scopeChangedNote: string;
    inventoryChangedNote: string;
    findingColumnLabel: string;
    severityColumnLabel: string;
    pagesColumnLabel: string;
    previousColumnLabel: string;
    currentColumnLabel: string;
    /** Template: {count}. Singular and plural, chosen by pluralize. */
    persistentNoteSingular: string;
    persistentNotePlural: string;
    noChangesBody: string;
    /** Shown when a tool version or the normalization changed, so rows
     *  whose severity moved are counted as still present. */
    severitySuppressedNote: string;
    normalizationChangedNote: string;
    versionsHeading: string;
    /** Template: {tool}, {before}, {after}. */
    versionRowTemplate: string;
    versionUnavailable: string;
    toolLabels: {
      odysseusVersion: string;
      findingsSchemaVersion: string;
      axeCoreVersion: string;
      lighthouseVersion: string;
      playwrightVersion: string;
      chromiumVersion: string;
    };
    /** Template: {before}, {after}. */
    maxPagesChangedTemplate: string;
    maxDepthChangedTemplate: string;
    noPageLimit: string;
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
    /** Plan 018 step 7: one compact synthesis before the full legal
     *  reference replaces the former three sales cards. */
    /** Stake recap. States what the report is about in business terms and
     *  never invents a financial amount; any approved financial view is
     *  Plan 020's, inserted once in the executive summary. */
    synthesisStake: string;
    /** Deterministic coverage recap, assembled clause by clause in
     *  next-steps.ts from the same RenderedPriority view the priority and
     *  checklist sections consume, so no figure is ever invented here.
     *
     *  Issue #322: a single template with three interpolated counts and
     *  hardcoded plural verbs printed "1 correspondent à des gains
     *  rapides". Each clause now carries its own agreement, a clause
     *  whose count is zero is dropped, and a report with fewer than two
     *  priorities falls back to synthesisCoverageFallback rather than
     *  needing a third set of "parmi elles" singular forms for a
     *  breakdown that would say nothing.
     *
     *  leadTemplate takes {priorities} (a full "N priorités" phrase) and
     *  {clauses}; each clause template takes {count}. */
    synthesisCoverage: {
      leadTemplate: string;
      prioritySingularTemplate: string;
      priorityPluralTemplate: string;
      seriousCriticalSingularTemplate: string;
      seriousCriticalPluralTemplate: string;
      quickWinsSingularTemplate: string;
      quickWinsPluralTemplate: string;
      clauseSeparator: string;
      clauseConjunction: string;
    };
    /** Number-free fallback for synthesisCoverageTemplate, rendered when
     *  no rendered-priorities view reaches this section. */
    synthesisCoverageFallback: string;
    /** Next responsible roles, role labels only (management, technical
     *  provider or IT, communications, legal), consistent with the
     *  reading-guide roles in reportIntro. */
    synthesisRoles: string;
    /** Re-audit recommendation: after priority corrections, normally
     *  within three to six months. */
    synthesisReauditRecommendation: string;
    /** What a re-audit comparison covers when the manifest carries CrUX
     *  field data (manifest.cruxFieldData.available). Scanner-computable
     *  facts only; must never promise a conversion or revenue change. */
    synthesisComparisonWithFieldData: string;
    /** Same comparison for the public reference: field measurements belong to
     *  the anonymized source audit, not the synthetic showcase identity. */
    synthesisComparisonWithReferenceFieldData: string;
    /** Same comparison when no CrUX field data exists for the origin: must
     *  never name field data that does not exist. */
    synthesisComparisonWithoutFieldData: string;
    /** Names the client's own conversion rate strictly as their separate
     *  measurement, never as something this report estimates or promises. */
    synthesisConversionNote: string;
    questionTitle: string;
    /** Template: {email}. item 30 [REGRESSION]: previously said requests
     *  could go "directly to the Odysseus team" with no stated address -
     *  flagged once already, recurred once. */
    questionBodyTemplate: string;
    /** item 3.12: the re-audit offer must state a price, a lead time, and
     *  a way to order it - the one page in the report with commercial
     *  upside converting nothing. Template: {price}, {days}, {email}.
     *  Figures come only from ODYSSEUS_REAUDIT_PRICE_EUR_HT /
     *  ODYSSEUS_REAUDIT_LEAD_TIME_DAYS in html-utils.ts, never from copy. */
    reauditPricingTemplate: string;
    /** item 31: no authorship, terms, or liability block anywhere in a
     *  paid deliverable that may be forwarded to counsel. Template:
     *  {producer}, {renderDate}, {renderQualifier}, {scanDate},
     *  {scanQualifier}, {reportId}.
     *
     *  Issue #58: the build identities used to be interpolated here
     *  directly, so an unresolved build printed the word "unknown" to the
     *  client. They now arrive pre-composed through the qualifier
     *  templates below, which the caller selects or omits, because whether
     *  a build is fit to print is a decision and not a formatting
     *  detail. */
    authorshipTemplate: string;
    /** Issue #325: build and template identifiers used to sit inside the
     *  authorship sentence ("build de rendu 28fd0b8, modèle 3"). They now
     *  render on their own discreet line after it. Template: {details},
     *  the render qualifier and, when known, the scan qualifier. */
    provenanceTemplate: string;
    /** Render detail on the provenance line, when the render build is
     *  known. Template: {renderBuild}, {templateVersion}. */
    renderQualifierTemplate: string;
    /** Same position, when the render build could not be resolved. The
     *  template version is always known, so the line still has something
     *  to say. Template: {templateVersion}. */
    renderQualifierWithoutBuildTemplate: string;
    /** Scan detail on the provenance line, when the scan build is known.
     *  Omitted entirely otherwise: unlike the render qualifier there is
     *  nothing else in it. Template: {scanBuild}. */
    scanQualifierTemplate: string;
    /** item 3.13: no issuer identity (legal entity, signatory,
     *  registration number) anywhere in the document - a professionalism
     *  and liability-exposure gap for a paid French deliverable.
     *  Template: {signatory}, {registrationNumber}. A3 (2026-08-24): the
     *  placeholder is filled; the label says SIRET now that the full
     *  fourteen-digit number is known - see ODYSSEUS_REGISTRATION_NUMBER
     *  (html-utils.ts), where label and number are documented as moving
     *  together so the two can never disagree. */
    issuerBlockTemplate: string;
    liabilityStatement: string;
  };
  findingsAppendix: {
    eyebrow: string;
    heading: string;
    intro: string;
    /** Keyed by FindingCategory rather than spelled out, so adding a
     *  category to the locked contract fails here in both language files
     *  until both are given a label - which is how the 'privacy'
     *  addition (2026-08-24) was caught, rather than rendering an
     *  undefined label in a client's report. */
    categoryLabels: Record<FindingCategory, string>;
    /** Badge text for a reference-stat whose confidence is 'emerging',
     *  milestone 8.5c - quarantines GEO citations per the source
     *  research doc's Stage 3 recommendation. */
    geoEmergingLabel: string;
    /** report-feedback-la-corniche.md item 1.4: markup owned by a
     *  third-party plugin, embed, or nested iframe (Popup Maker, Gravity
     *  Forms, a preview widget, a booking engine's own consent/captcha
     *  frame) - the client's agency cannot edit this code, so these
     *  findings render in their own block, named with the vendor when
     *  known, rather than mixed with the client's own defects. */
    thirdPartyHeading: string;
    thirdPartyIntro: string;
    /** The block of findings from custom rules not yet confirmed on real
     *  sites: reported so the client can check them, never counted. */
    toVerifyHeading: string;
    toVerifyIntro: string;
    /** P2.3 (2026-08-21 La Corniche feedback pass): explains why a
     *  third-party finding can be counted among the headline "sérieux"
     *  total while this section separately notes the observed
     *  implementation needs no action - both true, but unexplained
     *  before this note existed. */
    thirdPartyCountedInTotalsNote: string;
    /** Plan 075: every finding in the section sits inside an embedded
     *  third-party frame, and Q1 keeps those out of the headline totals and
     *  the grade. The counted-in-totals note would contradict the statistics
     *  page's own frame note, so this one is shown instead. */
    thirdPartyFramesExcludedNote: string;
    /** Plan 075: the section mixes frame-confined findings (outside the
     *  totals) with in-page vendor findings (counted), so the note states
     *  both. */
    thirdPartyMixedTotalsNote: string;
    /** Shown for a frame-crossing selector (Playwright's `>>>`
     *  combinator) matching none of the known vendor prefixes - still
     *  third-party code, just not attributable to a named product. */
    unknownVendorLabel: string;
    severityLabels: {
      critical: string;
      serious: string;
      moderate: string;
      minor: string;
    };
    findingIdColumnLabel: string;
    pagesColumnLabel: string;
    /** item 3.1: shown in place of the full URL list when a finding's
     *  pages equal the total crawled - "toutes les pages" reads better
     *  than reprinting the same N URLs the crawled-pages block above
     *  already lists. Template: {count}. */
    allPagesAnalyzedTemplate: string;
    /** item 3.1: appended after a capped URL list (PAGE_URL_LIST_CAP in
     *  findings-appendix.ts) when a finding hits more pages than shown.
     *  Template: {count}, the number NOT shown. */
    andNMoreTemplate: string;
    /** Singular form of the above. A remaining count of exactly one is
     *  common (a capped list one item over its cap), and French "et 1
     *  autres" is simply wrong. Template: {count}. */
    andNMoreSingularTemplate: string;
    /** B4: a site-wide resource finding (Lighthouse's image/asset audits)
     *  collapses every affected file into one row, so the selector column
     *  states a file count and a sub-row lists the files. Template:
     *  {count}. */
    affectedFilesCountTemplate: string;
    /** Singular form of the above. Real reports hit this: an audit whose
     *  collapsed row covers exactly one file rendered "1 fichiers
     *  concernes". Template: {count}. */
    affectedFilesCountSingularTemplate: string;
    affectedFilesLabel: string;
    /** Used instead of affectedFilesLabel when the stored occurrences were
     *  capped, so the list below is a sample and not the whole set. */
    affectedFilesSampleLabel: string;
    /** A resource Lighthouse names by its inline content, not a URL. */
    inlineResourceLabel: string;
    /** 2026-08-22, La Corniche report review: two or more findings in the
     *  same rule group frequently share the exact same page-URL set (the
     *  same booking widget missing an alt attribute on every page it
     *  appears on, say) - a real report repeated the identical 5 URLs +
     *  "et 21 autres" under nearly every finding in some groups, the bulk
     *  of the annex's length for no new information. Shown for every
     *  finding after the first whose page-URL set exactly matches an
     *  earlier finding's in the same rule group, in place of repeating
     *  the list. Template: {findingId}, the earlier finding whose list to
     *  look at. */
    samePagesAsTemplate: string;
    pagesMaxColumnLabel: string;
    occurrencesColumnLabel: string;
    selectorColumnLabel: string;
    findingSingular: string;
    findingPlural: string;
    occurrenceSingular: string;
    occurrencePlural: string;
    pageSingular: string;
    pagePlural: string;
    wcagLabel: string;
    observationsCrossRefLabel: string;
    /** Fix #6, 2026-08-25 report review: rendered under a first-party rule
     *  group when the same rule id also has occurrences in the third-party
     *  section (item 1.4's partition), so a reader is not left thinking a
     *  rule's footprint here is its entire footprint. Template: {count},
     *  {thirdPartyHeading} (this same block's own thirdPartyHeading
     *  string). Issue #322: the singular form exists because the note
     *  printed "Encore 1 occurrences de cette règle concernent un
     *  composant tiers" whenever exactly one occurrence was split off. */
    splitGroupThirdPartyNoteTemplate: string;
    splitGroupThirdPartyNoteSingularTemplate: string;
    /** item 29: the list of crawled URLs was not printed anywhere - the
     *  client had no way to verify the scope they paid for beyond a bare
     *  count on the cover. Template: {count}. */
    crawledPagesHeadingTemplate: string;
  };
  methodology: {
    eyebrow: string;
    heading: string;
    /** Template: {axeVersion}, {lighthouseVersion}, {pages} (a full "N
     *  page(s)" phrase built with pagesScannedSingular/Plural below, not a
     *  bare count - issue #28), {date}. */
    toolingParagraphTemplate: string;
    pagesScannedSingular: string;
    pagesScannedPlural: string;
    /** 2026-08-25: states which languages the crawl actually reached, on a
     *  site that publishes more than one. A real report said "65 pages
     *  analysees" for a trilingual site having visited only the French one.
     *  Templates: {languages}. */
    languageCoverageTemplate: string;
    /** Appended when a language was discovered but no page of it scanned -
     *  the case the sentence above exists to make impossible to miss.
     *  Templates: {languages}. */
    languageNotScannedTemplate: string;
    /** Milestone 9b.5. Templates: {total}, {linked}, {sitemapOnly}. */
    sitemapCoverageTemplate: string;
    /** Same disclosure when operator seeds contributed pages. Templates:
     *  {total}, {linked}, {seeded}, {sitemapOnly}. */
    sitemapCoverageWithSeedsTemplate: string;
    /** Same disclosure when every visited page was reached through links,
     *  so the sentence does not read "422 pages, including 422".
     *  Templates: {total}. */
    sitemapCoverageAllLinkedTemplate: string;
    /** Rendered when sitemap resolution or the configured cap prevented
     *  complete declared-page coverage. Templates: {failed}, {filtered},
     *  {omitted}. */
    sitemapIncompleteTemplate: string;
    /** brief section 6.6: the well-documented ~30-40% automated coverage
     *  figure, stated in every report, not only accessibility audits. */
    automatedCoverageCaveat: string;
    /** item 1.10/B8: shown only when the extended accessibility pass
     *  (keyboard traps, focus order, form errors, video captions) found
     *  zero findings across all four checks - a clean result is currently
     *  invisible to the client despite the pass being named in
     *  toolingParagraphTemplate/automatedCoverageCaveat's neighbourhood. */
    extendedPassNoneFoundNote: string;
    /** item 1.7 (La Corniche pass): extendedPassNoneFoundNote above only
     *  ever rendered when all four checks found nothing - one finding on
     *  any single check silently suppressed the whole note, so the other
     *  three checks, which genuinely found nothing, went unstated on a
     *  real report. Rendered instead of extendedPassNoneFoundNote
     *  whenever at least one check found something. Template: {checks},
     *  a comma-joined list of "{label} ({status})" built from the four
     *  extendedPassCheck*Label strings below and either
     *  extendedPassCheckCleanLabel or a count using extendedPassCheckFound
     *  Singular/Plural. */
    extendedPassResultTemplate: string;
    extendedPassCheckKeyboardTrapsLabel: string;
    extendedPassCheckFocusOrderLabel: string;
    extendedPassCheckFormErrorsLabel: string;
    extendedPassCheckVideoCaptionsLabel: string;
    extendedPassCheckPlaceholderLabelsLabel: string;
    extendedPassCheckCleanLabel: string;
    extendedPassCheckFoundSingular: string;
    extendedPassCheckFoundPlural: string;
    /** Rendered only when both deterministic privacy/security checks ran
     * clean. This is a check result, never a legal-compliance conclusion. */
    privacySecurityChecksClean: string;
    /** Rendered when either check was unavailable, including historical
     * audits that predate their coverage provenance. */
    privacySecurityChecksUnavailable: string;
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
    /** Public reference variants: the criteria remain the same, but the
     *  observed inputs are synthetic showcase data rather than client data. */
    legalCitationSyntheticInScopeTemplate: string;
    legalCitationSyntheticLikelyInScopeTemplate: string;
    legalCitationSyntheticOutOfScopeParagraph: string;
    legalCitationSyntheticUndeterminedParagraph: string;
    /** Template: {label}, the effectif band's human-readable text. */
    legalCitationEffectifFactTemplate: string;
    legalCitationSyntheticEffectifFactTemplate: string;
    /** Template: {amount}, {threshold}, formatted currency amounts. */
    legalCitationTurnoverFactTemplate: string;
    /** Under 10 staff, turnover above EUR 2M, no balance sheet available:
     *  the exemption can be neither confirmed nor ruled out. */
    legalCitationSmeBalanceSheetUnknownFactTemplate: string;
    /** Template: {effectif}, {turnover}. */
    legalCitationSmeFactTemplate: string;
    legalCitationSyntheticSmeFactTemplate: string;
    /** item 41: names the specific detected flow type (e.g. "réservation
     *  en ligne") instead of listing "réservation, panier ou paiement"
     *  with "ou", which read as the tool being unsure which one it
     *  detected. Template: {flowType}. "de premier niveau" (internal
     *  jargon) is dropped from the sentence entirely. */
    /** Template: {flowType}, {location}. */
    legalCitationTransactionalFlowFactTemplate: string;
    /** item 0.7: {location} is "directement en ligne" when the flow was
     *  found on-site, or a delegated qualifier when the only evidence is a
     *  third-party redirect, so this sentence can't contradict the fuller
     *  delegated-provider note legal-exposure.ts renders a few paragraphs
     *  later. */
    legalCitationTransactionalFlowLocationOnSite: string;
    legalCitationTransactionalFlowLocationDelegated: string;
    legalCitationTransactionalFlowUnknownFact: string;
    /** Issue #42: the fact kind 'transactional-flow-inconclusive'
     *  sentence - booking controls were found but their destination could
     *  not be established, so the flow gate could not be resolved either
     *  way. Distinct from legalCitationNoTransactionalFlowFact's clean
     *  negative. */
    legalCitationTransactionalFlowInconclusiveFact: string;
    /** Issue #294: the fact kind 'transactional-flow-form-only' sentence
     *  - the only flow evidence is a form element, which alone does not
     *  establish a transactional flow. Distinct from
     *  legalCitationTransactionalFlowInconclusiveFact's booking controls. */
    legalCitationTransactionalFlowFormOnlyFact: string;
    legalCitationNoTransactionalFlowFact: string;
    legalCitationSirenMissingFact: string;
    legalCitationOverseasJurisdictionFact: string;
    /** Template: {reason}. */
    legalCitationSireneLookupFailedTemplate: string;
    /** Plain-language labels for the specific flow type(s) actually
     *  detected (SiteSignals.transactionalFlowEvidence's own `kind`),
     *  substituted into legalCitationTransactionalFlowFactTemplate's
     *  {flowType}. */
    transactionalFlowTypeLabels: { booking: string; cartOrPayment: string; both: string };
    /** Manual-SIREN milestone: appended after the main paragraph
     *  (whichever status it is) when the SIREN used came from a manual
     *  override rather than the site's own mentions-legales page, and a
     *  matching LCEN finding exists to reference. Template: {findingId}. */
    legalCitationManualSirenWithFindingTemplate: string;
    /** Same case, but no LCEN finding exists to reference - the site
     *  published an RCS or TVA number without a SIREN, so the check did
     *  not fire, yet a manual SIREN was still supplied. */
    legalCitationManualSirenNoFindingSentence: string;
    syntheticSirenProvenanceNote: string;
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
     *  than zero. Template: {count}, count always > 1 (see the singular
     *  variant below for count === 1). */
    socialExclusionDisclosureTemplate: string;
    /** item 3.2 [REGRESSION]: the plural template above used to be
     *  reused for every count via a literal "page(s)"/"ont été
     *  exclues" placeholder that leaked into a real report verbatim
     *  ("1 page(s) ont été exclues") instead of agreeing with a
     *  singular count. */
    socialExclusionDisclosureSingularTemplate: string;
    /** item 3.11: "20 pages" appeared throughout the report with nothing
     *  stating it is a configured cap, not full site coverage. Only
     *  rendered when the crawl actually hit the cap (visitedCount >=
     *  maxPages). Template: {maxPages}. */
    crawlCapDisclosureTemplate: string;
    /** Manual-input-layer milestone: when the operator has confirmed
     *  where the SIREN/RCS/TVA is displayed on the site
     *  (AuditManualFields.sirenSourceUrl), the lcen-mentions-legales-
     *  missing finding is suppressed and this sentence states where it
     *  was found instead. Template: {url}. */
    sirenSourceResolvedTemplate: string;
    /** Plan 036: the methodology-section half of the LCEN coverage
     *  disclosure (binding decision 5, both placements), rendered only
     *  when the lcen-mentions-legales-missing finding fired. States what
     *  was checked, that legal information may exist elsewhere, and the
     *  lawyer recommendation, per the design's approved coverage wording.
     *  Never states breach, a deadline, or a sanction amount. Template:
     *  {url}. */
    mentionsLegalesCoverageTemplate: string;
    /** Plan 075 K6: the same disclosure when no legal-notice link was
     *  found and the check read the visited pages instead, so the report
     *  never names a link the site does not have. Template: {pages}. */
    mentionsLegalesFallbackCoverageTemplate: string;
    /** {pages} for one visited page. */
    mentionsLegalesFallbackPageSingular: string;
    /** {pages} for several visited pages. Template: {count}. */
    mentionsLegalesFallbackPagePlural: string;
    /** P0.1 (2026-08-21 La Corniche feedback pass): renders when Lighthouse
     *  failed on at least one page, giving the real per-reason failure
     *  counts instead of a dead-end pointer with no follow-through. */
    lighthouseFailureIntroSentence: string;
    /** Template: {count}, {total}, {reason}. One line per distinct
     *  failure cause across the scan. */
    lighthouseFailureReasonTemplate: string;
    /** The client-facing wording for each cause a failed Lighthouse run can
     *  have. The tool's own message is an internal one ("runLighthouseIsolated:
     *  worker for <url> exited before returning a result (code 1, signal
     *  null)") and must never reach a client: it names an internal function and
     *  a process exit signal, which the plain-language rule forbids, and its
     *  literal "null" trips render-lint's stringified-null rule and aborts the
     *  render outright. Causes are the ones actually observed across stored
     *  scans; anything unrecognized falls back to `unknown` rather than leaking
     *  the raw text. */
    lighthouseFailureReasons: {
      browserUnreachable: string;
      processStopped: string;
      timedOut: string;
      unknown: string;
    };
  };
  footer: {
    confidentialityLabel: string;
    pageLabel: string;
  };
  /** Plan 032 (issue #162): the audit fallback gate
   *  (docs/rules/llm-layer-rules.md section 10, trade-off 23) skips the
   *  structure and writing passes when an audit's findings are thin, so
   *  this static, honest note replaces the model-written prose. Strictly
   *  factual: it invents no theme, praise, or risk level, claims no
   *  manual pass, and scopes every statement to what the automated
   *  tools actually detected. */
  fallbackAnalysis: {
    noteHeading: string;
    noteBody: string;
    /** The one static sentence the analysis stage stores as both the
     *  fallback analysis' executiveSummary and notes, so the persisted
     *  artifact states in plain language why its themes are empty. */
    summarySentence: string;
  };
}
