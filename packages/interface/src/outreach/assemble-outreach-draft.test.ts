import { describe, expect, it } from 'vitest';
import { buildOutreachFactsBlock, type OutreachFactsBlock } from '@odysseus/core';
import type { OutreachProseOutput } from '@odysseus/llm';
import { assembleOutreachDraft, type AssembledOutreachDraft } from './assemble-outreach-draft.js';

const PREVIEW_URL = 'https://www.odysseusaudit.com/apercu/abc123';
const PRIVACY_URL = 'https://www.odysseusaudit.com/confidentialite-prospection';
const OPT_OUT_URL = 'https://www.odysseusaudit.com/desinscription';

const TOUCH1_PROSE: OutreachProseOutput = {
  touch: 1,
  evidenceRef: 'e1',
  subject: 'Un point rapide sur votre site',
  opening: "Nous avons regardé le site de votre établissement comme n'importe quel visiteur.",
  evidenceSentence:
    'Une partie du contenu ne se voit pas avant que le JavaScript ait fini de charger.',
  question: 'Est-ce voulu ?',
};

const TOUCH2_PROSE: OutreachProseOutput = {
  touch: 2,
  evidenceRef: 'e2',
  sentences: [
    'Le bouton de réservation ne répond pas au clavier seul.',
    'Un client pressé peut abandonner avant même de voir vos tarifs.',
  ],
};

const TOUCH3_PROSE: OutreachProseOutput = {
  touch: 3,
  closing: 'Nous restons disponibles si utile.',
};

function assertAssembled(
  result: ReturnType<typeof assembleOutreachDraft>,
): asserts result is AssembledOutreachDraft {
  if (!result.assembled) throw new Error(`expected assembled, got refusal: ${result.refusal}`);
}

function touch3ExpectedFacts(): OutreachFactsBlock {
  return buildOutreachFactsBlock({
    assessment: undefined,
    language: 'fr',
    capabilities: { argumentB: true },
  });
}

describe('assembleOutreachDraft - touch 1', () => {
  it('assembles a complete draft', () => {
    const result = assembleOutreachDraft({
      prose: TOUCH1_PROSE,
      language: 'fr',
      previewUrl: PREVIEW_URL,
      dataOrigins: ['public-hotel-catalogue', 'public-website'],
      privacyUrl: PRIVACY_URL,
      optOutUrl: OPT_OUT_URL,
    });
    assertAssembled(result);

    expect(result.subject).toBe(TOUCH1_PROSE.subject);
    expect(result.body).toContain('Bonjour,');
    expect(result.body).toContain(TOUCH1_PROSE.opening);
    expect(result.body).toContain(TOUCH1_PROSE.evidenceSentence);
    expect(result.body).toContain(TOUCH1_PROSE.question);
    expect(result.body).toContain(PREVIEW_URL);
    expect(result.body).toContain(
      'Le responsable de traitement est Odysseus Audit, Jules Fontaine, contact@odysseusaudit.com.',
    );
    expect(result.body).toContain('le classement public des hébergements touristiques');
    expect(result.body).toContain('votre site web accessible publiquement');
    expect(result.body).toContain(PRIVACY_URL);
    expect(result.body).toContain(OPT_OUT_URL);
    // No touch 3 content leaks into touch 1.
    expect(result.body).not.toContain('Le cadre applicable');
  });

  it('refuses when the preview link is missing', () => {
    const result = assembleOutreachDraft({
      prose: TOUCH1_PROSE,
      language: 'fr',
      dataOrigins: ['public-website'],
      privacyUrl: PRIVACY_URL,
      optOutUrl: OPT_OUT_URL,
    });
    expect(result).toEqual({ assembled: false, refusal: 'missing-preview-url' });
  });

  it('refuses when no data origins are supplied', () => {
    const result = assembleOutreachDraft({
      prose: TOUCH1_PROSE,
      language: 'fr',
      previewUrl: PREVIEW_URL,
      dataOrigins: [],
      privacyUrl: PRIVACY_URL,
      optOutUrl: OPT_OUT_URL,
    });
    expect(result).toEqual({ assembled: false, refusal: 'missing-data-origins' });
  });

  it('refuses when the privacy link is missing', () => {
    const result = assembleOutreachDraft({
      prose: TOUCH1_PROSE,
      language: 'fr',
      previewUrl: PREVIEW_URL,
      dataOrigins: ['public-website'],
      optOutUrl: OPT_OUT_URL,
    });
    expect(result).toEqual({ assembled: false, refusal: 'missing-privacy-url' });
  });

  it('refuses when the opt-out link is missing', () => {
    const result = assembleOutreachDraft({
      prose: TOUCH1_PROSE,
      language: 'fr',
      previewUrl: PREVIEW_URL,
      dataOrigins: ['public-website'],
      privacyUrl: PRIVACY_URL,
    });
    expect(result).toEqual({ assembled: false, refusal: 'missing-opt-out-url' });
  });
});

describe('assembleOutreachDraft - touch 2', () => {
  it('assembles a complete draft with a reply-based opt-out and no new link', () => {
    const result = assembleOutreachDraft({
      prose: TOUCH2_PROSE,
      language: 'fr',
      previousSubject: 'Un point rapide sur votre site',
    });
    assertAssembled(result);

    expect(result.subject).toBe('Re: Un point rapide sur votre site');
    expect(result.body).toContain(TOUCH2_PROSE.sentences[0]);
    expect(result.body).toContain(TOUCH2_PROSE.sentences[1]);
    expect(result.body).toContain(
      "Vous pouvez répondre à ce message pour ne plus recevoir d'e-mail de notre part.",
    );
    expect(result.body).not.toMatch(/https?:\/\//u);
  });

  it('does not double-prefix a subject that already carries Re:', () => {
    const result = assembleOutreachDraft({
      prose: TOUCH2_PROSE,
      language: 'fr',
      previousSubject: 'Re: Un point rapide sur votre site',
    });
    assertAssembled(result);
    expect(result.subject).toBe('Re: Un point rapide sur votre site');
  });

  it('refuses when the previous subject is missing', () => {
    const result = assembleOutreachDraft({ prose: TOUCH2_PROSE, language: 'fr' });
    expect(result).toEqual({ assembled: false, refusal: 'missing-previous-subject' });
  });
});

describe('assembleOutreachDraft - touch 3', () => {
  it('assembles a complete draft with the rebuilt facts block spliced in', () => {
    const expectedFacts = touch3ExpectedFacts();
    const result = assembleOutreachDraft({
      prose: TOUCH3_PROSE,
      language: 'fr',
      previousSubject: 'Un point rapide sur votre site',
      expectedFacts,
    });
    assertAssembled(result);

    expect(result.subject).toBe('Re: Un point rapide sur votre site');
    expect(result.body).toContain(TOUCH3_PROSE.closing);
    if (expectedFacts.state !== 'rendered') throw new Error('expected a rendered facts block');
    expect(result.body).toContain(expectedFacts.heading);
    for (const paragraph of expectedFacts.paragraphs) expect(result.body).toContain(paragraph);
    expect(result.body).toContain(
      'Si vous préférez que nous supprimions cette donnée de registre, répondez à ce message ' +
        'et nous la supprimerons.',
    );
    expect(result.body).not.toMatch(/https?:\/\//u);
  });

  it('refuses when the facts block was not supplied', () => {
    const result = assembleOutreachDraft({
      prose: TOUCH3_PROSE,
      language: 'fr',
      previousSubject: 'Un point rapide sur votre site',
    });
    expect(result).toEqual({ assembled: false, refusal: 'missing-facts-inputs' });
  });

  it('refuses when the supplied facts block does not match a fresh rebuild', () => {
    const stale: OutreachFactsBlock = { state: 'omitted' };
    const result = assembleOutreachDraft({
      prose: TOUCH3_PROSE,
      language: 'fr',
      previousSubject: 'Un point rapide sur votre site',
      expectedFacts: stale,
    });
    expect(result).toEqual({ assembled: false, refusal: 'facts-block-mismatch' });
  });
});
