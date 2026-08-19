import { describe, expect, it } from 'vitest';
import { buildWritingSystemPrompt } from './writing-prompt.js';

// item 43: the executive summary led with the raw total findings count
// ("98 problèmes"), of which most were minor - rhetorically inflated
// relative to what actually matters. Originally fixed by having the
// prompt instruct the model to lead with the actionable (critical +
// serious) count itself; report-feedback-la-corniche.md item 0.4
// superseded that: the model's own restated counts drifted from the
// report's actual bound counts whenever render-time finding resolution
// changed the finding set after the writing pass had already run (a real
// report stated "94 constats" while the cover/tile/chart all said 93).
// The counts, including which one leads, now live entirely in the report
// template (executive-summary.ts's summaryCountsTemplate, which leads
// with the actionable count) - the prompt's job is only to make sure the
// model never writes a competing number of its own.
describe('item 0.4: the writing prompt forbids the model from writing any count itself', () => {
  it('instructs the model never to write a digit in executiveSummary, since the template now states every count', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain('do not restate, estimate, or reference any of those figures yourself');
    expect(prompt).toContain('never write a number of findings, pages, or occurrences anywhere in executiveSummary');
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
  it('instructs the model to address recommendations to a technical provider, not the client\'s own developers', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain('no in-house developer');
    expect(prompt).toContain('your technical provider');
  });
});

// report-feedback-la-corniche.md item 3.6: a real report addressed some
// priorities to "votre prestataire technique" and others to "votre
// agence" - the same recommendation-writing job under two different
// names, reading as two different parties to the client. The previous
// version of this prompt (haaitza's item 3.7, above) explicitly offered
// both "your agency" and "your technical provider" as interchangeable,
// which is exactly what let the model drift between them across themes.
describe('item 3.6: the writing prompt uses one consistent addressee phrase, never both', () => {
  it('does not offer "your agency" as an interchangeable alternate phrase (only as a "never switch to" example)', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).not.toContain('hand to "your agency" or "your technical provider"');
  });

  it('instructs the model to use the exact same phrase every time, never switching mid-report', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain('Use this exact same phrase every time');
    expect(prompt).toContain('never switch to');
  });

  it('forbids instructing the client to personally test keyboard navigation, not just screen readers', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain('not by testing keyboard navigation');
  });
});

// report-feedback-la-corniche.md item 3.7 (vocabulary half): a real
// report's template-bound sentence said "constats" while the model's own
// executiveSummary prose right next to it said "problèmes" for the same
// thing - a client reading both in the same paragraph had to work out
// they were the same noun.
describe('item 3.7: the writing prompt enforces one consistent noun for what the audit detected', () => {
  it('instructs the model to always use "constat"/"constats" in French, never "problème(s)" or "issue(s)"', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain('"constat"/"constats"');
    expect(prompt).toContain('never a synonym like "problème(s)" or "issue(s)"');
  });

  it('instructs the model to always use "finding"/"findings" in English', () => {
    const prompt = buildWritingSystemPrompt('en', false, null);
    expect(prompt).toContain('"finding"/"findings"');
    expect(prompt).toContain('never a synonym like "problem(s)" or "issue(s)"');
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
