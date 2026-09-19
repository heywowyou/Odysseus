import { ALT_TEXT_QUALITY_HEURISTIC_RULE_ID } from '@odysseus/core';
import { describe, expect, it } from 'vitest';
import { BANNED_SEVERITY_SYNONYMS } from './severity-vocabulary-guard.js';
import { TECHNICAL_PROVIDER_PHRASES } from './provider-phrase-guard.js';
import {
  MAX_BUSINESS_IMPACT_SENTENCES,
  MAX_RECOMMENDED_ACTIONS,
  MIN_BUSINESS_IMPACT_SENTENCES,
  MIN_RECOMMENDED_ACTIONS,
  emptyWritingPerformanceEvidence,
} from './writing-schema.js';
import {
  buildWritingRetryFeedback,
  buildWritingSystemPrompt,
  buildWritingUserPrompt,
  businessFactsNote,
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

  // 2026-09-10: the catalogue room count was removed from the writing
  // pass entirely (the executiveSummary digit guard rejects any digit, so
  // a model-visible count is a guaranteed retry hazard). The prompt must
  // never name or instruct about a room count again, for any facts.
  it('never invites a room count into any field, in either language', () => {
    const fr = buildWritingSystemPrompt('fr', false, null, undefined, {
      businessType: 'hôtellerie',
      primaryGoal: 'réservations',
      languagesServed: ['fr'],
      targetMarkets: ['fr'],
      propertyType: 'hôtel',
      city: 'Bordeaux',
      sector: 'hospitality',
    });
    const en = buildWritingSystemPrompt('en', false, null, undefined, {
      businessType: 'hospitality',
      primaryGoal: 'bookings',
      languagesServed: ['en'],
      targetMarkets: ['uk'],
      propertyType: 'hotel',
      city: 'Bordeaux',
      sector: 'hospitality',
    });

    expect(fr).not.toContain('chambres');
    expect(en).not.toContain('room count');
    expect(en).not.toContain('size of the property');
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
  // The regression this replaces: the prompt used to list all three approved
  // phrases and ask the model to pick one and never mix them. Measured over
  // five live runs on 2026-09-07, the model mixed them every time and three
  // of the five exhausted the retry budget entirely. Showing exactly one
  // phrase is what makes the mixture unrepresentable, so a prompt that
  // reintroduces an alternative reintroduces the failure.
  it('shows only the assigned phrase and never an alternative, in French', () => {
    for (const assigned of TECHNICAL_PROVIDER_PHRASES.fr) {
      const prompt = buildWritingSystemPrompt('fr', false, null, assigned);
      expect(prompt).toContain(assigned);
      for (const other of TECHNICAL_PROVIDER_PHRASES.fr.filter((p) => p !== assigned)) {
        expect(prompt).not.toContain(other);
      }
    }
  });

  it('shows only the assigned phrase and never an alternative, in English', () => {
    for (const assigned of TECHNICAL_PROVIDER_PHRASES.en) {
      const prompt = buildWritingSystemPrompt('en', false, null, assigned);
      expect(prompt).toContain(assigned);
      for (const other of TECHNICAL_PROVIDER_PHRASES.en.filter((p) => p !== assigned)) {
        expect(prompt).not.toContain(other);
      }
    }
  });

  it('states that naming the provider any other way is rejected, in both languages', () => {
    expect(buildWritingSystemPrompt('fr', false, null)).toContain(
      'rejette une réponse qui nomme le prestataire autrement',
    );
    expect(buildWritingSystemPrompt('en', false, null)).toContain(
      'rejects a response that names the provider any other way',
    );
  });

  it('falls back to a valid approved phrase when none is assigned', () => {
    expect(buildWritingSystemPrompt('fr', false, null)).toContain(
      TECHNICAL_PROVIDER_PHRASES.fr[0] as string,
    );
    expect(buildWritingSystemPrompt('en', false, null)).toContain(
      TECHNICAL_PROVIDER_PHRASES.en[0] as string,
    );
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
    // Issue #309: requiring the phrase in every entry pushed it to the end
    // of almost every action; it is now named at most once per theme.
    expect(prompt).toContain('ne le nommez donc pas dans chaque entrée de recommendedActions');
    expect(prompt).toContain('Nommez-le au plus une fois par thème');
    expect(prompt).toContain(
      'Ne commencez jamais non plus une entrée de recommendedActions par cette formulation',
    );
  });

  it('separates naming the provider from opening on it, in English', () => {
    const prompt = buildWritingSystemPrompt('en', false, null);
    expect(prompt).toContain('so do not name it in every recommendedActions entry');
    expect(prompt).toContain('Name it at most once per theme');
    expect(prompt).toContain('Never begin a recommendedActions entry with that wording either');
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

  it('forbids unsupported commercial outcomes even when hedged, in French', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain('réservations, la conversion, le chiffre d’affaires');
    expect(prompt).toContain('Une précaution grammaticale ne transforme pas une affirmation non mesurée en preuve');
  });

  it('forbids unsupported commercial outcomes even when hedged, in English', () => {
    const prompt = buildWritingSystemPrompt('en', false, null);
    expect(prompt).toContain('bookings, conversion, revenue, abandonment, demand, trust, or reputation');
    expect(prompt).toContain('Hedging does not turn an unmeasured claim into evidence');
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

// Plan 067: titles are compact noun phrases, not miniature recommendations.
describe('Plan 067: the writing prompt requests noun-phrase theme titles', () => {
  it('requires a short noun phrase and forbids a full sentence, in French', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain('un groupe nominal court');
    expect(prompt).toContain('jamais une phrase complète');
    expect(prompt).toContain('Contrastes et lisibilité');
  });

  it('requires a short noun phrase and forbids a full sentence, in English', () => {
    const prompt = buildWritingSystemPrompt('en', false, null);
    expect(prompt).toContain('a short noun phrase');
    expect(prompt).toContain('never a full sentence');
    expect(prompt).toContain('Contrast and readability');
  });

  it('makes titles an explicit exception to the complete-sentence rule', () => {
    const fr = buildWritingSystemPrompt('fr', false, null);
    const en = buildWritingSystemPrompt('en', false, null);
    expect(fr).toContain("À l'exception de title");
    expect(en).toContain('Except for title');
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
    performanceEvidence: emptyWritingPerformanceEvidence(),
    summaryEvidence: {
      siteStats: {
        pagesScanned: 1,
        totalFindings: 0,
        critical: 0,
        serious: 0,
        moderate: 0,
        minor: 0,
      },
      categoriesPresent: [],
      performance: emptyWritingPerformanceEvidence(),
      limitations: ['real-user-performance-unavailable'],
    },
  };

  it('appends the rejection reason to the user prompt on retries only', () => {
    const reason = 'severity vocabulary violations in field(s): executiveSummary ("graves")';
    const base = buildWritingUserPrompt(input);
    expect(base).not.toContain('rejected by the automated guard');

    const corrected = buildWritingUserPrompt(input, buildWritingRetryFeedback(reason));
    expect(corrected.startsWith(base)).toBe(true);
    expect(corrected).toContain('rejected by the automated guard');
    expect(corrected).toContain('"graves"');
    expect(corrected).toContain('fixes every problem listed');
  });
});

// issue #106: the fa1a598 fix removed the word-level opening tic, and the
// templating moved one level down into the grammar: real stored reports
// opened 20/21 French actions on subject + devoir and closed many English
// actions on one shared final clause, all with distinct first words. The
// prompt names both constructions and caps them, the same mechanism the
// assigned-phrase prohibition uses; docs/rules/report-writing-style.md
// section 3 is the source document and must move with this.
describe('issue #106: the writing prompt caps the subject + devoir frame and shared endings', () => {
  it('names the subject + devoir construction and caps it, in French', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain('suivi immédiatement du verbe devoir');
    expect(prompt).toContain('Les boutons concernés doivent recevoir un libellé explicite');
    expect(prompt).toContain('au plus un tiers toutes priorités confondues');
  });

  it('names the obligation-modal frame and caps it, in English', () => {
    const prompt = buildWritingSystemPrompt('en', false, null);
    expect(prompt).toContain('followed straight away by an obligation modal');
    expect(prompt).toContain('The broken link must be replaced');
    expect(prompt).toContain('at most a third across all priorities');
  });

  it('requires varied sentence endings and names the measured closing tic, in French', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain('les mêmes mots après sa dernière virgule');
    expect(prompt).toContain('("..., afin que...", "..., ce qui...")');
  });

  it('requires varied sentence endings and names the measured closing tic, in English', () => {
    const prompt = buildWritingSystemPrompt('en', false, null);
    expect(prompt).toContain('the same words after its last comma');
    expect(prompt).toContain('("..., so that...", "..., which...")');
  });

  // Issue #309: the trailing provider clause is now forbidden outright, and
  // the prompt names it with the assigned phrase only.
  it('forbids the trailing provider clause with the assigned phrase, never a fixed wording', () => {
    for (const assigned of TECHNICAL_PROVIDER_PHRASES.fr) {
      const prompt = buildWritingSystemPrompt('fr', false, null, assigned);
      expect(prompt).toContain(`"..., et ${assigned} peut..."`);
      for (const other of TECHNICAL_PROVIDER_PHRASES.fr.filter((p) => p !== assigned)) {
        expect(prompt).not.toContain(other);
      }
    }
    for (const assigned of TECHNICAL_PROVIDER_PHRASES.en) {
      const prompt = buildWritingSystemPrompt('en', false, null, assigned);
      expect(prompt).toContain(`"..., and ${assigned} can..."`);
      for (const other of TECHNICAL_PROVIDER_PHRASES.en.filter((p) => p !== assigned)) {
        expect(prompt).not.toContain(other);
      }
    }
  });

  it('shows the French glossary and forbids subjective impressions', () => {
    const fr = buildWritingSystemPrompt('fr', false, null);
    expect(fr).toContain('"adresse canonique" et non "canonical(s)"');
    expect(fr).toContain('"appui" et non "tap"');
    expect(fr).toContain('"donne une impression de"');
    expect(buildWritingSystemPrompt('en', false, null)).toContain('"gives an impression of"');
  });

  // Round 1 of the issue #106 measurement (2026-09-08): the global cap in
  // the sentence-structure note alone left the stored structures at 24/25
  // and 20/21 devoir openings, so the cap is also stated where the model
  // writes actions, as a per-theme quota it can actually track. Round 2
  // measured the quota working: the same structures came back at 15/27 and
  // 9/15 devoir openings, under the 2/3 limit for the first time. Round 3
  // tried replacing the worked tail examples with an abstract description
  // plus a provider-tail quota and the devoir frame snapped back (27/27),
  // so the worked-example version is the one kept.
  it('states the per-theme quota in the recommendedActions bullet, in French', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain(
      "au plus une action par thème peut s'ouvrir sur un sujet suivi du verbe devoir",
    );
    expect(prompt).toContain('ne terminez jamais deux actions du même thème par les mêmes mots');
  });

  it('states the per-theme quota in the recommendedActions bullet, in English', () => {
    const prompt = buildWritingSystemPrompt('en', false, null);
    expect(prompt).toContain(
      'at most one action per theme may open on a subject followed by an obligation modal',
    );
    expect(prompt).toContain('never close two actions of the same theme on the same words');
  });

  it('keeps the provider-name carve-out intact next to the new construction rule', () => {
    const fr = buildWritingSystemPrompt('fr', false, null);
    expect(fr).toContain("Cette exigence de variété ne s'applique jamais au nom du prestataire");
    const en = buildWritingSystemPrompt('en', false, null);
    expect(en).toContain('This variety requirement never applies to the provider');
  });

  // The recommendedActions bullet used to model opening an action with the
  // provider phrase ("${providerPhrase} peut ajouter..."), the exact frame
  // fa1a598 forbids and this issue caps; the model follows examples over
  // rules, so the example had to go.
  it('no longer models opening an action with the assigned provider phrase', () => {
    for (const language of ['fr', 'en'] as const) {
      const phrases = TECHNICAL_PROVIDER_PHRASES[language];
      for (const assigned of phrases) {
        const prompt = buildWritingSystemPrompt(language, false, null, assigned);
        for (const phrase of phrases) {
          const sentenceStart = language === 'fr' ? `"${phrase} peut` : `"${phrase} can`;
          expect(prompt).not.toContain(sentenceStart);
        }
      }
    }
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

// plan 028, lever J: a real report referenced "la priorité 1 ci-dessus"
// pointing at content that rendered below it.
describe('plan 028: the writing prompt forbids positional references to other report content', () => {
  it('forbids "ci-dessus"/"ci-dessous" and asks for a name or rank instead, in French', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain('"ci-dessus", "ci-dessous"');
    expect(prompt).toContain('son nom ou son rang de priorité');
  });

  it('forbids positional references and asks for a name or rank instead, in English', () => {
    const prompt = buildWritingSystemPrompt('en', false, null);
    expect(prompt).toContain('"above", "below"');
    expect(prompt).toContain('by its title or priority rank instead');
  });

  it('carves out the legitimate numeric-threshold reading of below/en dessous, in both languages', () => {
    const fr = buildWritingSystemPrompt('fr', false, null);
    expect(fr).toContain('en dessous du seuil requis');
    const en = buildWritingSystemPrompt('en', false, null);
    expect(en).toContain('below the required minimum');
  });
});

// plan 028, lever K: the alt-text-quality-heuristic finding was explained
// with two different meanings across the French and English passes of the
// same audit (audit-rehearsal notes #67/#68).
describe('plan 028: buildWritingUserPrompt grounds known-drift rule IDs in a shared meaning', () => {
  const baseInput = {
    language: 'fr' as const,
    siteContext: {
      businessType: 'e-commerce',
      primaryGoal: 'sales',
      languagesServed: ['fr'],
      targetMarkets: ['fr'],
    },
    siteStats: {
      pagesScanned: 1,
      totalFindings: 1,
      critical: 0,
      serious: 0,
      moderate: 1,
      minor: 0,
    },
    performanceEvidence: emptyWritingPerformanceEvidence(),
    summaryEvidence: {
      siteStats: {
        pagesScanned: 1,
        totalFindings: 1,
        critical: 0,
        serious: 0,
        moderate: 1,
        minor: 0,
      },
      categoriesPresent: ['accessibility' as const],
      performance: emptyWritingPerformanceEvidence(),
      limitations: ['real-user-performance-unavailable'],
    },
  };

  function themeWithFinding(ruleId: string) {
    return [
      {
        themeKey: 't1',
        category: 'accessibility' as const,
        findings: [
          {
            findingId: 'f1',
            source: 'custom' as const,
            ruleId,
            category: 'accessibility' as const,
            severity: 'moderate' as const,
            wcagCriteria: [],
            title: 'Alt text may be low-value',
            description: 'description',
            pageUrls: ['https://example.com/'],
            occurrences: 1,
          },
        ],
        trustedRemediations: [],
      },
    ];
  }

  it('adds the shared meaning note when the alt-text heuristic finding is present, in French', () => {
    const prompt = buildWritingUserPrompt({
      ...baseInput,
      themes: themeWithFinding(ALT_TEXT_QUALITY_HEURISTIC_RULE_ID),
    });
    expect(prompt).toContain('alt-text-quality-heuristic');
    expect(prompt).toContain('un signal à vérifier manuellement');
  });

  it('adds the English meaning note when the language is English', () => {
    const prompt = buildWritingUserPrompt({
      ...baseInput,
      language: 'en',
      themes: themeWithFinding(ALT_TEXT_QUALITY_HEURISTIC_RULE_ID),
    });
    expect(prompt).toContain('a signal worth checking manually');
  });

  it('adds no note when the finding is not present', () => {
    const prompt = buildWritingUserPrompt({
      ...baseInput,
      themes: themeWithFinding('some-other-rule'),
    });
    expect(prompt).not.toContain('alt-text-quality-heuristic');
  });
});

// Plan 029 lever F: the siteContext widening. When the new fields are
// absent, the prompt must be byte-identical to the pre-plan-029 text and
// the fallbackNote trigger unchanged; when present, the facts must appear
// in the prompt under their guardrails.
describe('plan 029 lever F: concrete site facts in the writing prompt', () => {
  const coreOnlyContext = {
    businessType: 'hotel',
    primaryGoal: 'direct bookings',
    languagesServed: ['fr'],
    targetMarkets: ['fr'],
  };
  const factsContext = {
    ...coreOnlyContext,
    propertyType: 'hôtel 3 étoiles',
    city: 'Bordeaux',
    sector: 'hébergement touristique',
  };

  it('leaves the prompt byte-identical when the new fields are absent', () => {
    const legacy = buildWritingSystemPrompt('fr', true, null, 'votre prestataire technique');
    const widened = buildWritingSystemPrompt('fr', true, null, 'votre prestataire technique', {
      ...coreOnlyContext,
    });
    expect(widened).toBe(legacy);
    expect(buildWritingSystemPrompt('en', false, null)).toBe(
      buildWritingSystemPrompt('en', false, null, undefined, { ...coreOnlyContext }),
    );
  });

  it('returns no facts note when none of the new fields are present', () => {
    expect(businessFactsNote('fr', { ...coreOnlyContext })).toBe('');
    expect(businessFactsNote('en', { ...coreOnlyContext })).toBe('');
    expect(businessFactsNote('fr', undefined)).toBe('');
  });

  it('does not change the fallbackNote trigger', () => {
    const withFallback = buildWritingSystemPrompt('fr', true, null, undefined, {
      ...coreOnlyContext,
    });
    const withoutFallback = buildWritingSystemPrompt('fr', false, null, undefined, {
      ...coreOnlyContext,
    });
    expect(withFallback).toContain("Aucun contexte issu d'un questionnaire d'intake");
    expect(withoutFallback).not.toContain("Aucun contexte issu d'un questionnaire d'intake");
  });

  it('weaves present facts into the French prompt', () => {
    const prompt = buildWritingSystemPrompt('fr', true, null, undefined, { ...factsContext });
    expect(prompt).toContain('hôtel 3 étoiles');
    expect(prompt).not.toContain('nombre de chambres');
    expect(prompt).toContain('ville : Bordeaux');
    expect(prompt).toContain('secteur : hébergement touristique');
    expect(prompt).toContain("n'en inventez aucun autre");
    expect(prompt).toContain("jamais de comparaison avec d'autres établissements");
    expect(prompt).not.toBe(buildWritingSystemPrompt('fr', true, null, undefined));
  });

  it('weaves present facts into the English prompt', () => {
    const prompt = buildWritingSystemPrompt('en', false, null, undefined, {
      ...coreOnlyContext,
      propertyType: 'three-star hotel',
      city: 'Bordeaux',
      sector: 'tourist accommodation',
    });
    expect(prompt).toContain('property type: three-star hotel');
    expect(prompt).not.toContain('room count');
    expect(prompt).toContain('city: Bordeaux');
    expect(prompt).toContain('never a comparison with other properties');
  });

  it('lists only the facts that are present', () => {
    const note = businessFactsNote('fr', { ...coreOnlyContext, city: 'Bordeaux' });
    expect(note).toContain('ville : Bordeaux');
    expect(note).not.toContain('nombre de chambres');
    expect(note).not.toContain('hôtel 3 étoiles');
    expect(note).not.toContain('hébergement touristique');
  });

  it('the user prompt serializes present facts so the model sees the values', () => {
    const userPrompt = buildWritingUserPrompt({
      language: 'fr',
      siteContext: { ...factsContext },
      themes: [],
      siteStats: {
        pagesScanned: 1,
        totalFindings: 1,
        critical: 0,
        serious: 0,
        moderate: 1,
        minor: 0,
      },
      performanceEvidence: emptyWritingPerformanceEvidence(),
      summaryEvidence: {
        siteStats: {
          pagesScanned: 1,
          totalFindings: 1,
          critical: 0,
          serious: 0,
          moderate: 1,
          minor: 0,
        },
        categoriesPresent: [],
        performance: emptyWritingPerformanceEvidence(),
        limitations: ['real-user-performance-unavailable'],
      },
    });
    expect(userPrompt).toContain('"city": "Bordeaux"');
    expect(userPrompt).not.toContain('roomCount');
  });
});
