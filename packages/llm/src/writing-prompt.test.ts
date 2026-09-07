import { describe, expect, it } from 'vitest';
import { BANNED_SEVERITY_SYNONYMS } from './severity-vocabulary-guard.js';
import { TECHNICAL_PROVIDER_PHRASES } from './provider-phrase-guard.js';
import {
  MAX_BUSINESS_IMPACT_SENTENCES,
  MAX_RECOMMENDED_ACTIONS,
  MIN_BUSINESS_IMPACT_SENTENCES,
  MIN_RECOMMENDED_ACTIONS,
} from './writing-schema.js';
import {
  buildWritingRetryFeedback,
  buildWritingSystemPrompt,
  buildWritingUserPrompt,
} from './writing-prompt.js';

const BANNED_SECOND_PARTY_NOUNS = [
  'agence',
  'équipe interne',
  'développeur',
  'agency',
  'in-house team',
  'developer',
];

// plan 027: the provider-phrase set replaces the single mandated string.
// Every member must still name the same role (the client's external
// technical provider) and none may introduce a second party, or the "two
// parties" risk the original single-string mandate closed reopens.
describe('plan 027: the approved technical-provider phrases all name one role', () => {
  it('every French phrase names the provider and introduces no second-party noun', () => {
    for (const phrase of TECHNICAL_PROVIDER_PHRASES.fr) {
      expect(phrase.toLowerCase()).toMatch(/prestataire|équipe technique/);
      for (const banned of BANNED_SECOND_PARTY_NOUNS) {
        expect(phrase.toLowerCase()).not.toContain(banned);
      }
    }
  });

  it('every English phrase names the provider and introduces no second-party noun', () => {
    for (const phrase of TECHNICAL_PROVIDER_PHRASES.en) {
      expect(phrase.toLowerCase()).toMatch(/provider|technical team/);
      for (const banned of BANNED_SECOND_PARTY_NOUNS) {
        expect(phrase.toLowerCase()).not.toContain(banned);
      }
    }
  });

  it('offers more than one option per language, so not every report opens identically', () => {
    expect(TECHNICAL_PROVIDER_PHRASES.fr.length).toBeGreaterThan(1);
    expect(TECHNICAL_PROVIDER_PHRASES.en.length).toBeGreaterThan(1);
  });
});

// item 0.4: the writing prompt forbids the model from writing any count
// itself, since the report template now states every count.
describe('item 0.4: the writing prompt forbids the model from writing any count itself', () => {
  it('instructs the model never to write a digit in executiveSummary (French)', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain(
      "ne répétez, n'estimez ni ne référencez vous-même aucun de ces chiffres",
    );
    expect(prompt).toContain(
      "n'écrivez jamais de nombre de constats, de pages ou d'occurrences nulle part dans executiveSummary",
    );
  });

  it('instructs the model never to write a digit in executiveSummary (English)', () => {
    const prompt = buildWritingSystemPrompt('en', false, null);
    expect(prompt).toContain(
      'do not restate, estimate, or reference any of those figures yourself',
    );
    expect(prompt).toContain(
      'never write a number of findings, pages, or occurrences anywhere in executiveSummary',
    );
  });
});

// item 3.7: a real report addressed some priorities to a French phrase and
// others to another, or instructed the client to personally test something -
// instructions the client (no in-house developer) could not act on.
describe('item 3.7: the writing prompt assumes no in-house developer', () => {
  it("instructs the model to address recommendations to an external provider, not the client's own developers (French)", () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain('sans développeur interne');
    expect(prompt).toContain('prestataire externe');
  });

  it("instructs the model to address recommendations to a technical provider, not the client's own developers (English)", () => {
    const prompt = buildWritingSystemPrompt('en', false, null);
    expect(prompt).toContain('no in-house developer');
    expect(prompt).toContain('external provider');
  });

  it('forbids instructing the client to personally test keyboard navigation, not just screen readers (French)', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain('en testant la navigation au clavier');
  });

  it('forbids instructing the client to personally test keyboard navigation, not just screen readers (English)', () => {
    const prompt = buildWritingSystemPrompt('en', false, null);
    expect(prompt).toContain('not by testing keyboard navigation');
  });
});

// plan 027, lever A: one consistent addressee phrase per response, chosen
// from a small approved set, never mixed within one response.
describe('plan 027: the writing prompt uses one consistent addressee phrase per response, never mixed', () => {
  it('instructs the model to use the same chosen phrasing throughout, in French', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain('Ne mélangez jamais deux de ces formulations dans une même réponse');
    for (const phrase of TECHNICAL_PROVIDER_PHRASES.fr) {
      expect(prompt).toContain(phrase);
    }
  });

  it('instructs the model to use the same chosen phrasing throughout, in English', () => {
    const prompt = buildWritingSystemPrompt('en', false, null);
    expect(prompt).toContain('Never mix two of these phrasings within one response');
    for (const phrase of TECHNICAL_PROVIDER_PHRASES.en) {
      expect(prompt).toContain(phrase);
    }
  });

  // Same guard-mirroring rule the WCAG and severity notes follow: the
  // prompt says a machine checks this, because it now does
  // (provider-phrase-guard.ts). Prompt text alone did not hold the rule -
  // every French analysis regenerated on 2026-09-07 mixed two phrasings,
  // at 0.7 and at 1.0 alike.
  it('tells the model the consistency rule is machine-checked, in both languages', () => {
    expect(buildWritingSystemPrompt('fr', false, null)).toContain(
      'Un contrôle automatique vérifie ce point après chaque tentative',
    );
    expect(buildWritingSystemPrompt('en', false, null)).toContain(
      'An automated check verifies this after every attempt',
    );
  });

  // Measured 2026-09-07: requiring the phrase in every entry is what drove
  // every action to open "Demandez a votre prestataire technique de". The
  // guard rejects only mixing, so the prompt asks for consistency in the
  // words without demanding the provider be named everywhere.
  it('separates naming the provider from opening on it, in French', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain('Employez cette formulation dans chaque entrée de recommendedActions');
    expect(prompt).toContain('et surtout pas de commencer par elle');
  });

  it('separates naming the provider from opening on it, in English', () => {
    const prompt = buildWritingSystemPrompt('en', false, null);
    expect(prompt).toContain('Use that phrasing in every recommendedActions entry');
    expect(prompt).toContain('specifically does not mean starting with it');
  });
});

// item 3.7 (vocabulary half): a real report's template-bound sentence said
// "constats" while the model's own executiveSummary prose right next to it
// said "problèmes" for the same thing.
describe('item 3.7: the writing prompt enforces one consistent noun for what the audit detected', () => {
  it('instructs the model to always use "constat"/"constats" in French, never "problème(s)" or "issue(s)"', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain('"constat"/"constats"');
    expect(prompt).toContain('jamais un synonyme comme "problème(s)" ou "issue(s)"');
  });

  it('instructs the model to always use "finding"/"findings" in English', () => {
    const prompt = buildWritingSystemPrompt('en', false, null);
    expect(prompt).toContain('"finding"/"findings"');
    expect(prompt).toContain('never a synonym like "problem(s)" or "issue(s)"');
  });
});

// item 2.8 (P4): a real report asserted causation the scanner did not
// measure.
describe('P4: the writing prompt avoids asserting causation the scanner did not measure', () => {
  it('instructs the model to describe measured relationships as linked, not caused, and prefer "liées à" over "causées par" in French', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain("jamais comme l'un causant l'autre");
    expect(prompt).toContain('liées à');
    expect(prompt).toContain('causées par');
  });

  it('instructs the model to describe measured relationships as linked, not caused, in English', () => {
    const prompt = buildWritingSystemPrompt('en', false, null);
    expect(prompt).toContain('never as one causing the other');
  });
});

// plan 024 step 2 / plan 027: the client gave a stylistic rule requiring
// full subject-verb-complement sentences; plan 027 adds an opening-variety
// instruction on top, addressing the measured "Ces constats"/"Les constats"
// repetition.
describe('the writing prompt requires full subject-verb-complement sentences with varied openings', () => {
  it('requires complete sentences with an explicit subject, verb, and complement, in French', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain('un sujet explicite, un verbe et un complément');
    expect(prompt).toContain(
      "Le formulaire de réservation ne signale pas ses erreurs de saisie, si bien qu'un client qui se trompe de date ne comprend pas pourquoi sa demande échoue",
    );
  });

  it('requires complete sentences with an explicit subject, verb, and complement, in English', () => {
    const prompt = buildWritingSystemPrompt('en', false, null);
    expect(prompt).toContain('an explicit subject, a verb, and a complement');
    expect(prompt).toContain(
      'The reservation form does not flag its input errors, so a customer who enters the wrong date does not understand why the request failed',
    );
  });

  it('instructs the model to vary businessImpact openings across themes, in French', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain('Ne commencez pas systématiquement par "Ces constats"');
  });

  it('instructs the model to vary businessImpact openings across themes, in English', () => {
    const prompt = buildWritingSystemPrompt('en', false, null);
    expect(prompt).toContain('Do not begin every one with "These findings"');
  });

  // The prompt used to cite docs/rules/report-writing-style.md by path and
  // promise "four complete worked examples" the model has no way to open.
  // The register document is the source; the prompt has to carry the
  // substance itself.
  it("carries the register document's opening structures instead of citing its path", () => {
    for (const language of ['fr', 'en'] as const) {
      const prompt = buildWritingSystemPrompt(language, false, null);
      expect(prompt).not.toContain('docs/rules/report-writing-style.md');
    }
    const fr = buildWritingSystemPrompt('fr', false, null);
    expect(fr).toContain('sur le visiteur');
    expect(fr).toContain('sur la page concernée');
    expect(fr).toContain('sur la conséquence directe');
    expect(fr).toContain('des structures à imiter, jamais des phrases à recopier');
  });
});

// docs/rules/llm-layer-rules.md section 6: guards pinned to shared
// constants so the prompt and the guard state the same number/phrase.
describe('the writing prompt states the WCAG version and business-claim rules the guards enforce', () => {
  it('instructs the model to cite exactly the version the guard requires, in French', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain('citez exactement la version 2.2, jamais une autre version');
  });

  it('instructs the model to cite exactly the version the guard requires, in English', () => {
    const prompt = buildWritingSystemPrompt('en', false, null);
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

// issue #21: the severity-vocabulary note names the banned words
// themselves, from the same table the guard enforces, in both languages.
describe('issue #21: the writing prompt names the banned severity synonyms', () => {
  it('lists every banned French synonym in the system prompt', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    for (const word of BANNED_SEVERITY_SYNONYMS.fr) {
      expect(prompt).toContain(word);
    }
    expect(prompt).toContain('strictement interdits');
  });

  it('lists every banned English synonym in the system prompt', () => {
    const prompt = buildWritingSystemPrompt('en', false, null);
    for (const word of BANNED_SEVERITY_SYNONYMS.en) {
      expect(prompt).toContain(word);
    }
    expect(prompt).toContain('banned outright');
  });
});

// plan 019 step 6: outcome-oriented theme titles, not bare topic labels.
describe('plan 019: the writing prompt requests outcome-oriented titles without inviting claims', () => {
  it('asks the title to state the useful outcome or decision, in French', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain("énonce le résultat utile ou la décision qu'il permet de prendre");
  });

  it('asks the title to state the useful outcome or decision, in English', () => {
    const prompt = buildWritingSystemPrompt('en', false, null);
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

  it('forbids adding claims, numbers, or business facts the input does not contain, in French', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain(
      "n'ajoutez ni chiffre, ni fait commercial, ni bénéfice chiffré, ni aucune autre affirmation que les données d'entrée ne contiennent pas",
    );
  });
});

// issue #55, revised by plan 027: the executive summary's closing sentence
// must be grammatically sound and grounded, and now offers several varied
// examples instead of the one canned sentence every report had converged
// on copying verbatim.
describe('issue #55 / plan 027: the writing prompt varies the executive summary closing examples', () => {
  it('requires a grammatically complete, formal final sentence, in French', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain('phrase grammaticalement correcte, complète et formelle');
    expect(prompt).toContain('Ne terminez jamais sur une formulation familière ou incomplète');
  });

  it('requires a grammatically complete, formal final sentence, in English', () => {
    const prompt = buildWritingSystemPrompt('en', false, null);
    expect(prompt).toContain('grammatically correct, complete, formal sentence');
    expect(prompt).toContain('Never close on over-familiar or incomplete phrasing');
  });

  it('grounds the closing sentence in measured findings instead of unmeasured abstractions, in French', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain('des familles de constats présentes dans votre entrée');
  });

  // Measured 2026-09-07: showing three example closings and forbidding
  // their reuse did not work - four consecutive French runs opened the
  // closing on example two's words, one copying twenty-three of them. The
  // example was the anchor, so the examples are gone and the prompt says
  // the absence is deliberate.
  it('offers no closing template and says so, in both languages', () => {
    const fr = buildWritingSystemPrompt('fr', false, null);
    expect(fr).toContain('Aucun modèle de phrase ne vous est fourni pour cette clôture');
    expect(fr).not.toContain("En traitant d'abord les thèmes classés en tête de ce rapport");

    const en = buildWritingSystemPrompt('en', false, null);
    expect(en).toContain('You are deliberately given no template sentence for this close');
    expect(en).not.toContain('By addressing the themes ranked first in this report');
  });

  it('no longer copies the single retired canned sentence from before plan 027', () => {
    const fr = buildWritingSystemPrompt('fr', false, null);
    expect(fr).not.toContain('Pris ensemble, ces constats appellent une correction méthodique');
    const en = buildWritingSystemPrompt('en', false, null);
    expect(en).not.toContain('Taken together, these findings call for a methodical correction');
  });
});

// plan 027 step 4: raised caps with floors, stated dynamically from the
// same constants writing-schema.ts enforces, never a second hardcoded copy.
describe('plan 027: the writing prompt states the raised, floored length limits from the shared constants', () => {
  it('states the businessImpact sentence range in French', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain(
      `Entre ${MIN_BUSINESS_IMPACT_SENTENCES} et ${MAX_BUSINESS_IMPACT_SENTENCES} phrases`,
    );
  });

  it('states the businessImpact sentence range in English', () => {
    const prompt = buildWritingSystemPrompt('en', false, null);
    expect(prompt).toContain(
      `Between ${MIN_BUSINESS_IMPACT_SENTENCES} and ${MAX_BUSINESS_IMPACT_SENTENCES} sentences`,
    );
  });

  it('states the recommendedActions count range in French', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain(
      `entre ${MIN_RECOMMENDED_ACTIONS} et ${MAX_RECOMMENDED_ACTIONS} étapes concrètes`,
    );
  });

  it('states the recommendedActions count range in English', () => {
    const prompt = buildWritingSystemPrompt('en', false, null);
    expect(prompt).toContain(
      `between ${MIN_RECOMMENDED_ACTIONS} and ${MAX_RECOMMENDED_ACTIONS} concrete next steps`,
    );
  });
});

describe('the writing prompt requests JSON-only output and states the language instruction', () => {
  it('ends the French prompt on the JSON-only instruction', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain('Répondez uniquement avec un JSON structuré');
    expect(prompt).toContain("une réponse qui n'est pas en français sera rejetée");
  });

  it('ends the English prompt on the JSON-only instruction', () => {
    const prompt = buildWritingSystemPrompt('en', false, null);
    expect(prompt).toContain('Respond with structured JSON matching the required schema only');
    expect(prompt).toContain('entirely in English');
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

// Operator instruction, 2026-09-07: the report must hold a high-end
// consulting register and formal address across every field. The rule
// existed only in docs/rules/report-writing-style.md section 1, which the
// model cannot open, and the word "vouvoiement" appeared once in the whole
// prompt, inside the closing-sentence note.
describe('the writing prompt sets one formal consulting register for every field', () => {
  it('requires vouvoiement everywhere, in French', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain("Le vouvoiement est la seule forme d'adresse");
    expect(prompt).toContain('cabinet de conseil de premier plan');
    expect(prompt).toContain('Ne tutoyez jamais le client');
  });

  it('requires a formal consulting register everywhere, in English', () => {
    const prompt = buildWritingSystemPrompt('en', false, null);
    expect(prompt).toContain('leading consulting firm');
    expect(prompt).toContain('Address the client formally throughout');
  });

  it('states the register before the per-field instructions it governs', () => {
    for (const language of ['fr', 'en'] as const) {
      const prompt = buildWritingSystemPrompt(language, false, null);
      const register = prompt.indexOf(
        language === 'fr' ? 'Le registre est celui' : 'The register is that of',
      );
      expect(register).toBeGreaterThan(-1);
      expect(register).toBeLessThan(prompt.indexOf('recommendedActions'));
    }
  });
});
