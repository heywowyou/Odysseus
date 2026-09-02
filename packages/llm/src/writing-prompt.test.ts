import { describe, expect, it } from 'vitest';
import { BANNED_SEVERITY_SYNONYMS } from './severity-vocabulary-guard.js';
import {
  buildWritingRetryFeedback,
  buildWritingSystemPrompt,
  buildWritingUserPrompt,
} from './writing-prompt.js';

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
    expect(prompt).toContain(
      'do not restate, estimate, or reference any of those figures yourself',
    );
    expect(prompt).toContain(
      'never write a number of findings, pages, or occurrences anywhere in executiveSummary',
    );
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
  it("instructs the model to address recommendations to a technical provider, not the client's own developers", () => {
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

// plan 024 step 2: the client gave a stylistic rule, verbatim and in all
// caps: "TOUJOURS AVOIR DES PHRASES AVEC VERBES SUJET COMPLEMENTS ET DES
// VIRGULES". It was never encoded in the prompt, so nothing stopped the
// model from writing terse noun-phrase fragments in the prose fields.
describe('the writing prompt requires full subject-verb-complement sentences with commas', () => {
  it('requires every prose field to be written as complete sentences with an explicit subject, verb, and complement', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain(
      'as complete sentences with an explicit subject, a verb, and a complement',
    );
    expect(prompt).toContain('use commas to separate their clauses');
  });

  it('gives one full-sentence example per language against the fragment form', () => {
    const fr = buildWritingSystemPrompt('fr', false, null);
    expect(fr).toContain('Les contrastes sont insuffisants, donc les textes sont illisibles');
    const en = buildWritingSystemPrompt('en', false, null);
    expect(en).toContain('The contrast is insufficient, so the text is unreadable');
  });
});

// docs/rules/llm-layer-rules.md section 6: the first live run mixed WCAG 2.1
// and 2.2 citations, and wrote "la page la plus rentable du site" with no
// traffic or revenue data in the input. Both notes are paired with
// guards (wcag-citation-guard.ts, business-claim-guard.ts); these tests
// pin the instruction side of each pair to the same shared constants.
describe('the writing prompt states the WCAG version and business-claim rules the guards enforce', () => {
  it('instructs the model to cite exactly the version the guard requires', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain('cite version 2.2 exactly, never another version');
  });

  it('names the French fault phrase the business-claim guard rejects', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain('la page la plus rentable');
  });

  it('names the English fault phrase the business-claim guard rejects', () => {
    const prompt = buildWritingSystemPrompt('en', false, null);
    expect(prompt).toContain('the most profitable page');
  });
});

// issue #21: the severity-vocabulary note used to present only the four
// canonical words, so the model avoided the banned synonyms by luck; a
// French run reached for "graves" on eight consecutive attempts and every
// retry was rejected because the guard's reason never reached the model.
// These tests pin the instruction side: the prompt names the banned words
// (from the same table the guard enforces), and retries append the
// rejection reason as a correction.
describe('issue #21: the writing prompt names the banned severity synonyms', () => {
  it('lists every banned French synonym in the system prompt', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    for (const word of BANNED_SEVERITY_SYNONYMS.fr) {
      expect(prompt).toContain(word);
    }
    expect(prompt).toContain('banned outright');
  });

  it('lists every banned English synonym in the system prompt', () => {
    const prompt = buildWritingSystemPrompt('en', false, null);
    for (const word of BANNED_SEVERITY_SYNONYMS.en) {
      expect(prompt).toContain(word);
    }
  });
});

// plan 019 step 6: new writing runs should produce outcome-oriented theme
// titles, not bare topic labels. The instruction must not reopen the door
// to invented claims: the outcome stated has to come from the theme's own
// findings, with no numbers or business facts the input does not contain.
describe('plan 019: the writing prompt requests outcome-oriented titles without inviting claims', () => {
  it('asks the title to state the useful outcome or decision, not just the topic', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain(
      'states the useful outcome or the decision it supports, not just the topic',
    );
  });

  it('gives one outcome-oriented example per language', () => {
    const fr = buildWritingSystemPrompt('fr', false, null);
    expect(fr).toContain('Corriger les contrastes pour rendre les textes lisibles');
    const en = buildWritingSystemPrompt('en', false, null);
    expect(en).toContain('Fix contrast so text becomes readable');
  });

  it('forbids adding claims, numbers, or business facts the input does not contain', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain(
      'do not add a number, a business fact, a benefit figure, or any other claim the input data does not contain',
    );
  });
});

describe('buildWritingRetryFeedback and the user-prompt correction', () => {
  const input = {
    language: 'fr' as const,
    siteContext: {
      businessType: 'e-commerce',
      primaryGoal: 'sales',
      languagesServed: ['fr'],
      targetMarkets: ['fr'],
    },
    themes: [],
    siteStats: {
      pagesScanned: 1,
      totalFindings: 0,
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
    },
    dominantPerformanceMetric: null,
  };

  it('appends the rejection reason to the user prompt on retries only', () => {
    const reason = 'severity vocabulary violations in field(s): executiveSummary ("graves")';
    const base = buildWritingUserPrompt(input);
    expect(base).not.toContain('rejected by the automated guard');

    const corrected = buildWritingUserPrompt(input, buildWritingRetryFeedback(reason));
    expect(corrected.startsWith(base)).toBe(true);
    expect(corrected).toContain('rejected by the automated guard');
    expect(corrected).toContain('"graves"');
    expect(corrected).toContain('fixes exactly this problem');
  });
});
