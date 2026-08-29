import { describe, expect, it } from 'vitest';
import type { OutreachProseInput } from './outreach-input.js';
import { buildOutreachSystemPrompt, buildOutreachUserPrompt } from './outreach-prompt.js';

function touch1Input(overrides: Partial<OutreachProseInput> = {}): OutreachProseInput {
  return {
    language: 'fr',
    touch: 1,
    businessName: 'Hôtel des Voyageurs',
    evidence: {
      alias: 'e1',
      observation: "Une partie du contenu ne s'affiche pas sans JavaScript.",
      pageRole: 'homepage',
    },
    ageFramingPermitted: false,
    ...overrides,
  };
}

function touch2Input(overrides: Partial<OutreachProseInput> = {}): OutreachProseInput {
  return {
    language: 'fr',
    touch: 2,
    businessName: 'Hôtel des Voyageurs',
    evidence: {
      alias: 'e2',
      observation: 'La navigation au clavier reste bloquée sur un élément.',
      pageRole: 'booking',
    },
    ageFramingPermitted: true,
    ...overrides,
  };
}

function touch3Input(overrides: Partial<OutreachProseInput> = {}): OutreachProseInput {
  return {
    language: 'fr',
    touch: 3,
    businessName: 'Hôtel des Voyageurs',
    ageFramingPermitted: false,
    ...overrides,
  };
}

describe('buildOutreachSystemPrompt - touch 1', () => {
  it('states the word budget and the subject character bound', () => {
    const prompt = buildOutreachSystemPrompt(touch1Input());
    expect(prompt).toContain('60 to 90 words');
    expect(prompt).toContain('at most 78 characters');
  });

  it('requires the question field to end in a question mark and the others not to', () => {
    const prompt = buildOutreachSystemPrompt(touch1Input());
    expect(prompt).toContain('question must end with a question mark');
  });

  it('echoes the selected alias and forbids writing it in prose', () => {
    const prompt = buildOutreachSystemPrompt(touch1Input());
    expect(prompt).toContain('"e1"');
    expect(prompt).toContain('Never write the alias itself');
  });

  it('states every doctrine prohibition directly rather than by reference', () => {
    const prompt = buildOutreachSystemPrompt(touch1Input());
    expect(prompt).toContain('Any mention of a competitor');
    expect(prompt).toContain('phone call or a meeting');
    expect(prompt).toContain('named salutation');
    expect(prompt).toContain('free-mail address');
    expect(prompt).toContain('offer price');
    expect(prompt).toContain('curiosity-gap subject line');
    expect(prompt).toContain('predates June 2025');
    expect(prompt).toContain('Markdown formatting, HTML tags, or a URL');
  });

  it('includes concrete prohibited examples so the model sees the shape, not just the rule', () => {
    const prompt = buildOutreachSystemPrompt(touch1Input());
    expect(prompt).toContain('Cher Jean,');
  });

  it('instructs the model to write in French for a French input', () => {
    const prompt = buildOutreachSystemPrompt(touch1Input());
    expect(prompt).toContain('Write entirely in French');
  });

  it('does not mention age framing for touch 1', () => {
    const prompt = buildOutreachSystemPrompt(touch1Input());
    expect(prompt).not.toContain('Age-related vision');
  });
});

describe('buildOutreachSystemPrompt - touch 2', () => {
  it('requires exactly two sentences and no question mark', () => {
    const prompt = buildOutreachSystemPrompt(touch2Input());
    expect(prompt).toContain('exactly two sentences');
    expect(prompt).toContain('Neither sentence may end in a question mark');
  });

  it('permits age framing only when the input allows it', () => {
    const allowed = buildOutreachSystemPrompt(touch2Input());
    expect(allowed).toContain('Age-related vision and dexterity decline past sixty is a permitted');

    const disallowed = buildOutreachSystemPrompt(touch2Input({ ageFramingPermitted: false }));
    expect(disallowed).toContain('has not been approved for that framing');
    expect(disallowed).not.toContain(
      'Age-related vision and dexterity decline past sixty is a permitted',
    );
  });
});

describe('buildOutreachSystemPrompt - touch 3', () => {
  it('states no evidence is shown', () => {
    const prompt = buildOutreachSystemPrompt(touch3Input());
    expect(prompt).toContain('No evidence is shown to you for this message');
  });

  it('describes the appended deterministic block without letting the model write legal content', () => {
    const prompt = buildOutreachSystemPrompt(touch3Input());
    expect(prompt).toContain('appended immediately after your sentence by code you do not see');
    expect(prompt).toContain('do not state any legal conclusion yourself');
  });

  it('requires exactly one sentence and no question mark', () => {
    const prompt = buildOutreachSystemPrompt(touch3Input());
    expect(prompt).toContain('exactly one sentence');
    expect(prompt).toContain('must not end in a question mark');
  });
});

describe('buildOutreachUserPrompt', () => {
  it('serializes the input as JSON', () => {
    const prompt = buildOutreachUserPrompt(touch1Input());
    expect(prompt).toContain('"businessName": "Hôtel des Voyageurs"');
    expect(prompt).toContain('"alias": "e1"');
  });

  it('never carries a finding id, a raw URL, or a withheld evidence field, since the input type has no field for them', () => {
    const prompt = buildOutreachUserPrompt(touch1Input());
    expect(prompt).not.toContain('fact_');
    expect(prompt).not.toContain('http');
    expect(prompt).not.toContain('sha256');
    expect(prompt).not.toContain('wcagCriteria');
    expect(prompt).not.toContain('severity');
    expect(prompt).not.toContain('observationKey');
  });
});
