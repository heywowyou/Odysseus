import type { ReportStrings } from './types.js';

/**
 * Plan 046: idiomatic English editorial layer for the report's
 * executive/front-facing surfaces.
 *
 * This mirrors the French ownership boundary without translating it literally:
 * the technical annex and methodology retain their specialist vocabulary while
 * the decision-maker pages use concise, natural business English.
 */
export function applyEnglishClientFacingCopy(strings: ReportStrings): ReportStrings {
  return {
    ...strings,
    reportIntro: {
      ...strings.reportIntro,
      eyebrow: 'Your diagnostic',
      heading: 'What to address first',
      situationHeading: 'What this diagnostic helps you decide',
      situationBody:
        'This report gives you a clear view of your site across four areas: digital ' +
        'accessibility, organic search, visibility in AI assistants, and rendering quality. ' +
        'It then turns the findings into ranked fixes, separating what needs attention now, ' +
        'what can wait, and what needs further verification before work begins.',
      complicationHeading: 'What needs your attention',
      complicationBodyTemplate:
        'The analysis found {findings} distinct findings, including {criticalSerious} critical ' +
        'or serious findings, across at least {pages} of the analyzed scope. They are grouped ' +
        'into {priorities} priorities to make the fixes that matter most easy to identify.',
      consequenceRegulatory:
        'Accessibility requirements may also apply to your organization. The ' +
        '"{legalSection}" section sets out the relevant criteria and the facts available for ' +
        'your organization; your legal position should be confirmed with your adviser.',
      notALegalOpinionNote:
        'This is an automated technical diagnostic. It is not a full RGAA audit and it is not ' +
        'legal advice. Coverage limitations are set out in "{methodologySection}".',
      audienceHeading: 'How to use this report',
      journeysHeading: 'Visitor journeys reviewed',
    },
    statistics: {
      ...strings.statistics,
      eyebrow: 'Measured results',
      heading: 'What the analysis found',
      introTemplate:
        '{pages}, {findings} distinct findings after repeated instances are grouped together. ' +
        'A finding that appears on several pages is counted once.',
      priorityOwnershipTemplate:
        'Among the priority findings, {firstParty} can be fixed directly, {thirdParty} need to ' +
        'be passed to a third party, and {verifyIntent} need verification in context.',
      severityBreakdownHeading: 'Breakdown by severity',
    },
    cover: {
      ...strings.cover,
      kicker: 'Odysseus · Technical diagnostic',
      reportTitle: 'Diagnostic report',
      reportType: 'Accessibility · Performance · Organic search · Visibility in AI assistants',
      reportTypeNoPerformance: 'Accessibility · Organic search · Visibility in AI assistants',
    },
    metadata: {
      ...strings.metadata,
      eyebrow: 'Diagnostic information',
      heading: 'Scope and severity scale',
      riskSmallLabel: 'Overall findings level',
      scorecardLabel: 'Overall findings level',
      scorecardDisclaimer:
        'This grade summarizes the severity of measured findings; it is not a legal assessment.',
    },
    executiveSummary: {
      ...strings.executiveSummary,
      eyebrow: 'Summary',
      heading: 'The essentials for a decision',
      regulatoryContextKicker: 'Regulatory point to verify',
      regulatoryContextCriterion:
        'The accessibility requirements discussed in this report include those introduced by ' +
        'the European Accessibility Act and transposed into French law by loi n° 2023-171. ' +
        'Whether they apply depends on factors including company size, activity, and the services ' +
        'provided; the "Legal exposure" section compares those criteria with the facts available ' +
        'for your organization.',
      regulatoryContextCounsel:
        'The amount shown above is the statutory ceiling, not a penalty imposed on your company. ' +
        'Your position can be confirmed with your legal adviser.',
      priorityOwnershipTemplate:
        'Among the selected priorities, {firstParty} findings can be fixed directly, ' +
        '{thirdParty} need to be passed to a third party, and {verifyIntent} need verification ' +
        'in context.',
      startHereKicker: 'Start here',
      categoryImbalanceNote:
        'The most significant findings on this site are concentrated in accessibility; organic ' +
        'search and visibility in AI assistants require fewer priority fixes.',
      summaryCountsTemplate:
        'The diagnostic found {total} distinct findings, including {actionable} that are critical ' +
        'or serious ({critical} critical and {serious} serious).',
      coveredByPrioritiesTemplate:
        'The priorities below cover {covered} of them; the remainder stay documented by severity ' +
        'in "{remainingSection}".',
    },
    themes: {
      ...strings.themes,
      eyebrow: 'Correction priorities',
      headingTemplate: '{count} workstreams, ranked by priority',
      effortLabel: 'Complexity',
      impactLabel: 'Why it matters',
      affectedPagesLabel: 'Pages affected',
      ownershipCountsTemplate:
        'Correction ownership: {firstParty} to address directly, {thirdParty} to pass to a third ' +
        'party, and {verifyIntent} to verify in context.',
      whyItMattersLabel: 'Why it matters',
      observationLabel: 'What we found',
      observationWithPageTemplate:
        'This workstream includes the finding "{defect}", found on {page}. In total, it affects ' +
        '{pages} {pageWord} and {occurrences} {occurrenceWord}.',
      observationNoPageTemplate:
        'This workstream includes the finding "{defect}". In total, it affects {pages} ' +
        '{pageWord} and {occurrences} {occurrenceWord}.',
      whatYouCanDoLabel: 'How to fix it',
      complexityLabel: 'Complexity',
    },
    nextSteps: {
      ...strings.nextSteps,
      eyebrow: 'Final summary',
      heading: 'You have what you need to act',
      synthesisStake:
        'Your website is a direct point of contact with your visitors. Its accessibility, ' +
        'visibility in search engines and AI assistants, speed, and reliability all affect how ' +
        'easily people can find information and move through their journey. The priorities in ' +
        'this report show where to focus the first fixes.',
      synthesisCoverageTemplate:
        'The report identifies {priorities} priorities. Of these, {seriousCritical} include at ' +
        'least one critical or serious finding, and {quickWins} are quick wins with low ' +
        'complexity and medium or high impact.',
      synthesisCoverageFallback:
        'The priorities and severity breakdown in this report show which fixes to address first.',
      synthesisRoles:
        'Management sets and tracks the priorities. The technical provider implements the fixes. ' +
        'Communications reviews published content, and legal confirms which obligations apply.',
      synthesisReauditRecommendation:
        'Once the priority fixes are live, we recommend checking the same scope again within ' +
        'three to six months to measure what actually changed.',
      synthesisComparisonWithFieldData:
        'The follow-up check compares findings by severity, failing WCAG 2.2 AA criteria, and, ' +
        'where available, real-world Chrome UX Report data.',
      synthesisComparisonWithoutFieldData:
        'The follow-up check compares findings by severity and failing WCAG 2.2 AA criteria.',
      synthesisConversionNote:
        'Conversion rate remains a separate business metric to track in your own analytics; this ' +
        'diagnostic does not estimate it.',
      questionTitle: 'Need to clarify a point?',
      questionBodyTemplate:
        'For any question about a finding or priority, write to the Odysseus team at {email} and ' +
        'include the relevant finding identifier.',
    },
  };
}
