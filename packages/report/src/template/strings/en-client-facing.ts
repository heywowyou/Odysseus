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
        'This report gives you a clear view of your site across five areas: digital ' +
        'accessibility, loading speed, organic search, visibility in AI assistants, and ' +
        'rendering quality. ' +
        'It then turns the findings into ranked fixes, separating what needs attention now, ' +
        'what can wait, and what needs further verification before work begins.',
      complicationHeading: 'What needs your attention',
      complicationBodyTemplate:
        'The analysis found {findings}, including {criticalSerious} critical or serious, ' +
        'across at least {pages} of the analyzed scope. Grouping them into {priorities} makes ' +
        'the fixes that matter most easy to identify.',
      prioritySingular: 'priority',
      priorityPlural: 'priorities',
      consequenceRegulatory:
        'Accessibility requirements may also apply to your organization. The ' +
        '"{legalSection}" section sets out the relevant criteria and the facts available for ' +
        'your organization; your legal position should be confirmed with your adviser.',
      notALegalOpinionNote:
        'This is an automated technical diagnostic. It is not a full RGAA audit and it is not ' +
        'legal advice. Coverage limitations are set out in "{methodologySection}".',
      audienceHeading: 'How to use this report',
    },
    statistics: {
      ...strings.statistics,
      eyebrow: 'Measured results',
      heading: 'What the analysis found',
      introTemplate:
        '{pages}, {findings} distinct findings after repeated instances are grouped together. ' +
        'A finding that appears on several pages is counted once.',
      priorityOwnership: {
        leadTemplate: 'Among the priority findings, {clauses}.',
        firstPartySingularTemplate: '{count} can be fixed directly',
        firstPartyPluralTemplate: '{count} can be fixed directly',
        thirdPartySingularTemplate: '{count} needs to be passed to a third party',
        thirdPartyPluralTemplate: '{count} need to be passed to a third party',
        verifyIntentSingularTemplate: '{count} needs verification in context',
        verifyIntentPluralTemplate: '{count} need verification in context',
        clauseSeparator: ', ',
        clauseConjunction: ', and ',
      },
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
      // Issue #313: both fields on the second sheet used to share the same
      // label, printing "OVERALL FINDINGS LEVEL" twice - once over the letter
      // grade, once over the Low/Medium/High bar. The grade and the severity
      // level are different objects; keep the two labels distinct.
      riskSmallLabel: 'Severity level',
      scorecardLabel: 'Overall grade',
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
      priorityOwnership: {
        leadTemplate: 'Among the selected priorities, {clauses}.',
        firstPartySingularTemplate: '{count} finding can be fixed directly',
        firstPartyPluralTemplate: '{count} findings can be fixed directly',
        thirdPartySingularTemplate: '{count} needs to be passed to a third party',
        thirdPartyPluralTemplate: '{count} need to be passed to a third party',
        verifyIntentSingularTemplate: '{count} needs verification in context',
        verifyIntentPluralTemplate: '{count} need verification in context',
        clauseSeparator: ', ',
        clauseConjunction: ', and ',
      },
      startHereKicker: 'Start here',
      categoryImbalanceNote:
        'The most significant findings on this site are concentrated in accessibility; organic ' +
        'search and visibility in AI assistants require fewer priority fixes.',
      summaryCountsTemplate:
        'The diagnostic found {total} distinct findings, including {actionable} ' +
        '({critical} and {serious} serious).',
      coveredByPrioritiesTemplate:
        'The priorities in the "{prioritiesSection}" section cover {covered} of the {total}; the ' +
        'remainder are grouped by area in "{remainingSection}".',
      coveredByPrioritiesWithObservationsTemplate:
        'The priorities in the "{prioritiesSection}" section cover {covered} of the {total}; the ' +
        'remainder are presented in "{remainingSection}" and "{observationsSection}".',
    },
    themes: {
      ...strings.themes,
      eyebrow: 'Correction priorities',
      headingTemplate: '{count} workstreams, ranked by priority',
      effortLabel: 'Complexity',
      impactLabel: 'Impact',
      affectedPagesLabel: 'Pages affected',
      ownershipSummaryTemplate: 'Correction ownership: {parts}.',
      ownershipPartTemplates: {
        'first-party-action': '{count} to address directly',
        'third-party-escalation': '{count} to pass to a third party',
        'verify-intent': '{count} to verify in context',
      },
      ownershipSingleGroupTemplates: {
        'first-party-action': {
          one: 'The correction in this workstream can be addressed directly.',
          many: 'All {count} corrections in this workstream can be addressed directly.',
        },
        'third-party-escalation': {
          one: 'The correction in this workstream must be passed to a third party.',
          many: 'All {count} corrections in this workstream must be passed to a third party.',
        },
        'verify-intent': {
          one: 'The correction in this workstream needs verification in context.',
          many: 'All {count} corrections in this workstream need verification in context.',
        },
      },
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
      synthesisCoverage: {
        leadTemplate: 'The report identifies {priorities}. Of these, {clauses}.',
        prioritySingularTemplate: '{count} priority',
        priorityPluralTemplate: '{count} priorities',
        seriousCriticalSingularTemplate:
          '{count} includes at least one critical or serious finding',
        seriousCriticalPluralTemplate: '{count} include at least one critical or serious finding',
        quickWinsSingularTemplate:
          '{count} is a quick win with low complexity and medium or high impact',
        quickWinsPluralTemplate:
          '{count} are quick wins with low complexity and medium or high impact',
        clauseSeparator: ', ',
        clauseConjunction: ', and ',
      },
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
