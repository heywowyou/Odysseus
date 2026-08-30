import { describe, expect, it } from 'vitest';
import { findLanguageComplianceViolationsInFields } from '../language-guard.js';
import { findLegalConsequenceViolationsInFields } from '../legal-consequence-guard.js';
import { findAliasViolations } from './guards/alias-guard.js';
import {
  findObservationScopeViolations,
  OBSERVATION_TRIGGER_TERMS,
} from './guards/observation-scope-guard.js';
import { findOutreachFormatViolations } from './guards/outreach-format-guard.js';
import { findOutreachNumberViolations } from './guards/outreach-number-guard.js';
import { findOutreachStructureViolations } from './guards/outreach-structure-guard.js';
import { findOutreachVocabularyViolations } from './guards/outreach-vocabulary-guard.js';
import type { OutreachProseInput } from './outreach-input.js';
import {
  buildOutreachRetryFeedback,
  buildOutreachSystemPrompt,
  buildOutreachUserPrompt,
  TOUCH1_LENGTH_EXAMPLES,
} from './outreach-prompt.js';
import { outreachProseFields, outreachTouch1OutputSchema } from './outreach-schema.js';

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
    expect(prompt).toContain('A greeting of any kind');
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

  it('states a hard per-field word requirement derived from the touch limits', () => {
    const prompt = buildOutreachSystemPrompt(touch1Input());
    expect(prompt).toContain('at least 25 words and at most 30 words');
    expect(prompt).toContain('60 to 90 words');
  });

  it('embeds the worked length example for the input language and not the other', () => {
    const frPrompt = buildOutreachSystemPrompt(touch1Input());
    expect(frPrompt).toContain('"evidenceRef": "e1"');
    expect(frPrompt).toContain('Une partie de votre site reste invisible');
    expect(frPrompt).not.toContain('Part of your website stays invisible');

    const enPrompt = buildOutreachSystemPrompt(touch1Input({ language: 'en' }));
    expect(enPrompt).toContain('Part of your website stays invisible');
    expect(enPrompt).not.toContain('Une partie de votre site reste invisible');
  });

  it('places the example and the word-floor reminder after every other instruction, immediately before the JSON instruction', () => {
    const prompt = buildOutreachSystemPrompt(touch1Input());
    const prohibitionsAt = prompt.indexOf('Never write any of the following');
    const exampleAt = prompt.indexOf('A correctly sized response for this message');
    const reminderAt = prompt.indexOf('A response under 60 words is rejected');
    const jsonAt = prompt.indexOf('Respond with structured JSON');
    expect(prohibitionsAt).toBeGreaterThan(-1);
    expect(exampleAt).toBeGreaterThan(prohibitionsAt);
    expect(reminderAt).toBeGreaterThan(exampleAt);
    expect(jsonAt).toBeGreaterThan(reminderAt);
  });

  it('carries the example verbatim, so the prompt cannot drift from the tested constant', () => {
    const prompt = buildOutreachSystemPrompt(touch1Input());
    expect(prompt).toContain(JSON.stringify(TOUCH1_LENGTH_EXAMPLES.fr, null, 2));
  });

  it('warns that the length guard rejects short responses, with the same framing as the language instruction', () => {
    const prompt = buildOutreachSystemPrompt(touch1Input());
    expect(prompt).toContain('checked by an automated guard after every attempt');
    expect(prompt).toContain('must stay between 60 and 90 words');
    expect(prompt).toContain('rejected and you will be asked again');
  });

  it('anchors the response length to the example with a relative floor', () => {
    const prompt = buildOutreachSystemPrompt(touch1Input());
    expect(prompt).toContain("at least as long as the example's three fields");
  });
});

describe('TOUCH1_LENGTH_EXAMPLES - the examples themselves', () => {
  // Issue #12: the model wrote 31-38 words against the 60-word floor on six
  // consecutive live attempts. The worked example is the length anchor, so
  // it must itself satisfy the exact schema and guard battery the retry loop
  // enforces - an example that fails a guard would teach the model a shape
  // every attempt then gets rejected for.
  const languages = ['fr', 'en'] as const;

  for (const language of languages) {
    it(`parses and passes every outreach guard for ${language}`, () => {
      const output = outreachTouch1OutputSchema.parse(TOUCH1_LENGTH_EXAMPLES[language]);
      const input = touch1Input({ language });

      expect(findAliasViolations(input, output)).toEqual([]);

      const fields = outreachProseFields(output);
      expect(findOutreachVocabularyViolations(fields, language)).toEqual([]);
      expect(findLegalConsequenceViolationsInFields(fields, language)).toEqual([]);
      expect(findOutreachNumberViolations(fields)).toEqual([]);
      expect(findOutreachFormatViolations(fields)).toEqual([]);
      expect(
        findLanguageComplianceViolationsInFields(fields, language, { dualDetect: true }),
      ).toEqual([]);
      expect(findOutreachStructureViolations(output)).toEqual([]);
    });
  }

  it('sizes both examples inside the enforced 60-90 word range, away from either edge', () => {
    for (const language of languages) {
      const output = TOUCH1_LENGTH_EXAMPLES[language];
      const words = [output.opening, output.evidenceSentence, output.question]
        .join(' ')
        .trim()
        .split(/\s+/).length;
      expect(words).toBeGreaterThanOrEqual(60);
      expect(words).toBeLessThanOrEqual(90);
    }
  });

  it('leaks no observation trigger term, whichever observation key production selects', () => {
    for (const language of languages) {
      const output = TOUCH1_LENGTH_EXAMPLES[language];
      for (const selectedKey of Object.keys(OBSERVATION_TRIGGER_TERMS)) {
        expect(findObservationScopeViolations(output, selectedKey)).toEqual([]);
      }
    }
  });
});

describe('buildOutreachSystemPrompt - touch 2', () => {
  it('requires exactly two sentences and no question mark', () => {
    const prompt = buildOutreachSystemPrompt(touch2Input());
    expect(prompt).toContain('exactly two sentences');
    expect(prompt).toContain('Neither sentence may end in a question mark');
  });

  it('carries no worked length example, which is a touch-1 device', () => {
    const prompt = buildOutreachSystemPrompt(touch2Input());
    expect(prompt).not.toContain('A correctly sized response for this message');
    expect(prompt).not.toContain('"evidenceRef": "e1"');
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

describe('buildOutreachRetryFeedback', () => {
  it('states the reason and the fix for a generic rejection', () => {
    const feedback = buildOutreachRetryFeedback('alias violation in field(s): evidenceSentence');
    expect(feedback).toContain(
      'rejected by the automated guard: alias violation in field(s): evidenceSentence',
    );
    expect(feedback).toContain('fixes exactly this problem');
    expect(feedback).not.toContain('words');
  });

  it('spells out the word arithmetic for a word-count shortfall', () => {
    const feedback = buildOutreachRetryFeedback(
      'structure violation in field(s): touch1-body (too-few-words: 56)',
      { count: 56, min: 60 },
    );
    expect(feedback).toContain('contained 56 words, below the required minimum of 60');
    expect(feedback).toContain('at least 62 words');
    expect(feedback).toContain('at least 6 more words than last time');
  });
});

describe('buildOutreachUserPrompt', () => {
  it('serializes the input as JSON', () => {
    const prompt = buildOutreachUserPrompt(touch1Input());
    expect(prompt).toContain('"businessName": "Hôtel des Voyageurs"');
    expect(prompt).toContain('"alias": "e1"');
  });

  it('carries no correction paragraph on a first attempt', () => {
    const prompt = buildOutreachUserPrompt(touch1Input());
    expect(prompt).not.toContain('rejected by the automated guard');
  });

  it('embeds the retry feedback paragraph verbatim on a retry attempt', () => {
    const feedback = buildOutreachRetryFeedback(
      'structure violation in field(s): touch1-body (too-few-words: 52)',
    );
    const prompt = buildOutreachUserPrompt(touch1Input(), feedback);
    expect(prompt).toContain(
      'rejected by the automated guard: structure violation in field(s): touch1-body (too-few-words: 52)',
    );
    expect(prompt).toContain('fixes exactly this problem');
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
