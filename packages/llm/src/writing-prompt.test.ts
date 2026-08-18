import { describe, expect, it } from 'vitest';
import { buildWritingSystemPrompt } from './writing-prompt.js';

// item 43: the executive summary led with the raw total findings count
// ("98 problèmes"), of which most were minor - rhetorically inflated
// relative to what actually matters. The prompt now instructs the model
// to lead with the actionable (critical + serious) count instead.
describe('item 43: the writing prompt instructs leading with the actionable count', () => {
  it('instructs the model not to lead the executive summary with the raw total', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain('Lead the executiveSummary with the actionable number');
    expect(prompt).toContain('not the raw total findings count');
  });
});

// item 3.7: a real report's recommendedActions said "Former les
// développeurs aux bonnes pratiques ARIA" and "Tester [...] avec des
// outils de lecture d'écran" to a hotel client with no in-house
// developers and no one who owns a screen reader - instructions the
// client could not act on, one of which asked them to personally perform
// exactly the manual testing the methodology section says is out of
// scope.
describe('item 3.7: the writing prompt assumes no in-house developer', () => {
  it('instructs the model to address recommendations to an agency/technical provider, not the client\'s own developers', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain('no in-house developer');
    expect(prompt).toContain('your agency');
    expect(prompt).toContain('your technical provider');
  });
});

// item 2.8 (P4, report-feedback-palais-gallien-v2.md): a real report
// stated "Les lenteurs d'affichage, causées par des scripts bloquants" -
// the scanner measured a correlation on the same page, not a proven
// causal mechanism.
describe('P4: the writing prompt avoids asserting causation the scanner did not measure', () => {
  it('instructs the model to describe measured relationships as linked, not caused, and prefer "liées à" over "causées par" in French', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain('never as one causing the other');
    expect(prompt).toContain('liées à');
    expect(prompt).toContain('causées par');
  });
});
