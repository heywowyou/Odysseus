import { describe, expect, it } from 'vitest';
import { outreachPreviewStringsV2 } from './outreach-preview/strings-v2.js';
import { OUTREACH_PROOF_CARD_CLIENT_COPY } from './outreach-preview/proof-card-client-copy.js';
import { getStrings } from './template/strings/i18n.js';

const INTERNAL_TOOL = /\b(?:scanners?|notre robot|outils? déterministes?)\b/iu;
const DEFENSIVE =
  /(?:rien n['’]est (?:inventé|deviné)|nous constatons,? nous ne concluons pas|pas une préférence esthétique)/iu;
const LEGACY_SEVERITY = /\b(?:Grave|Modérée|Mineure)\b/u;
const KNOWN_FRAGMENT = /^(?:Choisis parmi|Couvrant\b|Basé sur\b|Utilisation\s*:)/iu;

function editorialProblem(value: string): string | null {
  if (INTERNAL_TOOL.test(value)) return 'internal-tool';
  if (DEFENSIVE.test(value)) return 'defensive';
  if (LEGACY_SEVERITY.test(value)) return 'legacy-severity';
  if (KNOWN_FRAGMENT.test(value.trim())) return 'fragment';
  return null;
}

function expectCompleteSentence(value: string): void {
  expect(value.trim()).toMatch(/[.!?]$/u);
}

describe('Plan 046 French client-facing editorial contract', () => {
  const preview = outreachPreviewStringsV2('fr');
  const report = getStrings('fr');

  const previewProse = [
    preview.lede,
    preview.observedOn,
    preview.coverageIntro,
    preview.performanceNote,
    preview.scorecardDisclaimer,
    preview.cardsIntro,
    preview.offerBody,
    preview.privacyController,
    preview.privacyData,
    preview.privacyPurpose,
    preview.privacyBasis,
    preview.privacyExpiry,
    preview.privacyRights,
    ...Object.values(preview.dataOrigin),
  ];

  const executiveReportProse = [
    report.reportIntro.situationBody,
    report.reportIntro.complicationBodyTemplate,
    report.reportIntro.consequenceRegulatory,
    report.reportIntro.notALegalOpinionNote,
    report.statistics.introTemplate,
    report.statistics.priorityOwnershipTemplate,
    report.metadata.scorecardDisclaimer,
    report.executiveSummary.regulatoryContextCriterion,
    report.executiveSummary.regulatoryContextCounsel,
    report.executiveSummary.priorityOwnershipTemplate,
    report.executiveSummary.glossaryPointerSentence,
    report.executiveSummary.thirdPartySplitSentenceTemplate,
    report.executiveSummary.categoryImbalanceNote,
    report.executiveSummary.topPriorityIsNotLegalWithPointerTemplate,
    report.executiveSummary.topPriorityIsNotLegalNoPointer,
    report.executiveSummary.summaryCountsTemplate,
    report.executiveSummary.coveredByPrioritiesTemplate,
    report.themes.ownershipCountsTemplate,
    report.themes.ownershipSplitTemplate,
    report.themes.thirdPartyOnlyTemplate,
    report.themes.lcenCrossReferenceTemplate,
    report.themes.observationWithPageTemplate,
    report.themes.observationNoPageTemplate,
    report.nextSteps.synthesisStake,
    report.nextSteps.synthesisCoverageTemplate,
    report.nextSteps.synthesisCoverageFallback,
    report.nextSteps.synthesisRoles,
    report.nextSteps.synthesisReauditRecommendation,
    report.nextSteps.synthesisComparisonWithFieldData,
    report.nextSteps.synthesisComparisonWithoutFieldData,
    report.nextSteps.synthesisConversionNote,
    report.nextSteps.questionBodyTemplate,
  ];

  it('uses the canonical product, category, severity and complexity vocabulary', () => {
    expect(report.cover.kicker).toBe('Odysseus · Diagnostic technique');
    expect(report.cover.reportTitle).toBe('Rapport de diagnostic');
    expect(report.cover.reportType).toContain('Référencement naturel');
    expect(report.cover.reportType).toContain('Visibilité dans les assistants IA');
    expect(report.themes.effortLabel).toBe('Complexité');
    expect(report.themes.complexityLabel).toBe('Complexité');
    expect(preview.category.seo).toBe('Référencement naturel');
    expect(preview.category.geo).toBe('Visibilité dans les assistants IA');
    expect(preview.severity).toEqual({
      critical: 'Critique',
      serious: 'Sérieux',
      moderate: 'Modéré',
      minor: 'Mineur',
    });
  });

  it('keeps preview prose as complete sentences', () => {
    for (const value of previewProse) expectCompleteSentence(value);
  });

  it('keeps executive report prose as complete sentences', () => {
    for (const value of executiveReportProse) expectCompleteSentence(value);
  });

  it('keeps internal-tool and defensive vocabulary off prospect and executive prose', () => {
    for (const value of [...previewProse, ...executiveReportProse]) {
      expect(editorialProblem(value), value).toBeNull();
    }
  });

  it('keeps resolved French proof-card observations as one complete client-facing sentence', () => {
    for (const [ruleId, entry] of Object.entries(OUTREACH_PROOF_CARD_CLIENT_COPY)) {
      expectCompleteSentence(entry.fr);
      expect(editorialProblem(entry.fr), `${ruleId}: ${entry.fr}`).toBeNull();
      expect(entry.fr.split(/[.!?]+/u).filter((part) => part.trim().length > 0)).toHaveLength(1);
    }
  });

  it.each([
    ['fragment', 'Choisis parmi les plus graves et les plus répandus.'],
    ['internal-tool', 'Cette note mesure les constats des scanners.'],
    ['legacy-severity', 'Grave'],
    ['defensive', 'Nous constatons, nous ne concluons pas.'],
  ])('detects the %s regression fixture', (expected, value) => {
    expect(editorialProblem(value)).toBe(expected);
  });
});
