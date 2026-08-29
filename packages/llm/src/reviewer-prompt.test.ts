import { describe, expect, it } from 'vitest';
import { buildReviewerSystemPrompt } from './reviewer-prompt.js';

// Validation campaign finding, 2026-08-29 (sas-fernande.fr fr + en
// re-analyses): the first reviewer prompt flagged 10 of 11 businessImpact
// fields as "unsupported" for stating exactly the generic commercial
// consequences ("may cost bookings, leads, sales, trust") the writing
// prompt instructs the model to write. The carve-out below is the fix;
// these tests pin its two sides so the prompt does not silently drift
// back to literal-claim-only matching.
describe('the reviewer prompt separates generic consequences from site-specific facts', () => {
  it('states that generic commercial consequences are never unsupported', () => {
    const prompt = buildReviewerSystemPrompt();
    expect(prompt).toContain('generic commercial consequences');
    expect(prompt).toContain('never "unsupported"');
  });

  it('reserves unsupported for site-specific rankings, attribution, and unhedged causal claims', () => {
    const prompt = buildReviewerSystemPrompt();
    expect(prompt).toContain('most visited, most profitable, or most important');
    expect(prompt).toContain('stated as fact rather than as a possibility');
  });
});
