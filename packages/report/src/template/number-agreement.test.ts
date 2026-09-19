import { describe, expect, it } from 'vitest';
import { pluralize, takesSingularAgreement } from './html-utils.js';
import { renderPriorityOwnershipSentence } from './priority-ownership-note.js';
import { getStrings } from './strings/i18n.js';

/** Issue #322: real reports printed "0 demandent une vérification",
 *  "0 doivent être transmis" and "1 correspondent à des gains rapides".
 *  Two distinct defects: French treats zero as singular where English
 *  pluralises it, and a fixed three-count sentence cannot agree with any
 *  of its counts nor drop the clauses that say nothing. */
describe('count agreement', () => {
  it('treats zero as singular in French and plural in English', () => {
    expect(takesSingularAgreement('fr', 0)).toBe(true);
    expect(takesSingularAgreement('en', 0)).toBe(false);
    expect(pluralize('fr', 0, 'page', 'pages')).toBe('page');
    expect(pluralize('en', 0, 'page', 'pages')).toBe('pages');
  });

  it('keeps one singular and anything above one plural in both languages', () => {
    for (const language of ['fr', 'en'] as const) {
      expect(takesSingularAgreement(language, 1)).toBe(true);
      expect(takesSingularAgreement(language, 2)).toBe(false);
    }
  });
});

describe('the priority ownership sentence', () => {
  const fr = getStrings('fr').statistics.priorityOwnership;
  const en = getStrings('en').statistics.priorityOwnership;

  it('agrees each clause with its own count', () => {
    expect(
      renderPriorityOwnershipSentence(
        { 'first-party-action': 1, 'third-party-escalation': 4, 'verify-intent': 2 },
        fr,
        'fr',
      ),
    ).toBe(
      'Parmi les constats prioritaires, 1 peut être corrigé directement, 4 doivent être ' +
        'transmis à un tiers et 2 nécessitent une vérification préalable.',
    );
  });

  it('drops a clause whose count is zero instead of stating it', () => {
    const sentence = renderPriorityOwnershipSentence(
      { 'first-party-action': 12, 'third-party-escalation': 0, 'verify-intent': 0 },
      fr,
      'fr',
    );

    expect(sentence).toBe('Parmi les constats prioritaires, 12 peuvent être corrigés directement.');
    expect(sentence).not.toContain('0');
  });

  it('renders nothing at all when every count is zero', () => {
    expect(
      renderPriorityOwnershipSentence(
        { 'first-party-action': 0, 'third-party-escalation': 0, 'verify-intent': 0 },
        fr,
        'fr',
      ),
    ).toBeUndefined();
  });

  it('uses the English serial comma and English agreement', () => {
    expect(
      renderPriorityOwnershipSentence(
        { 'first-party-action': 3, 'third-party-escalation': 1, 'verify-intent': 5 },
        en,
        'en',
      ),
    ).toBe(
      'Among the priority findings, 3 can be fixed directly, 1 needs to be passed to a third ' +
        'party, and 5 need verification in context.',
    );
  });
});
