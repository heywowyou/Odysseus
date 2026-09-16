import { describe, expect, it } from 'vitest';
import type { ObligationAssessment } from '@odysseus/core';
import { getStrings } from './strings/i18n.js';
import { accessibilityStatementGuidance } from './accessibility-statement-guidance.js';
import { REMEDIATION_EN } from './remediation/en.js';
import { REMEDIATION_FR } from './remediation/fr.js';

const article47: ObligationAssessment = {
  status: 'in_scope',
  basis: [
    {
      regimeId: 'loi-2005-102-article-47',
      facts: [{ kind: 'turnover', amountEur: 300_000_000, thresholdEur: 250_000_000 }],
    },
  ],
};

const eaa: ObligationAssessment = {
  status: 'in_scope',
  basis: [
    {
      regimeId: 'eaa-loi-2023-171',
      facts: [{ kind: 'transactional-flow', evidence: [] }],
    },
  ],
};

describe('accessibilityStatementGuidance', () => {
  it.each(['fr', 'en'] as const)(
    'keeps the publication action for Article 47 in %s',
    (language) => {
      const guidance = accessibilityStatementGuidance(getStrings(language), article47);
      expect(guidance.observation.toLowerCase()).toMatch(/aucune|no accessibility/);
      expect(guidance.recommendation.toLowerCase()).toMatch(/publiez|publish/);
      expect(guidance.recommendation.toLowerCase()).not.toMatch(
        /facultative|optional best practice/,
      );
    },
  );

  it.each(['fr', 'en'] as const)(
    'makes the recommendation explicitly optional outside Article 47 in %s',
    (language) => {
      const guidance = accessibilityStatementGuidance(getStrings(language), eaa);
      expect(guidance.observation.toLowerCase()).toMatch(/aucune|no accessibility/);
      expect(guidance.recommendation.toLowerCase()).toMatch(/facultative|optional best practice/);
    },
  );

  // Issue #327: "En dehors du régime de l'article 47" told a hotel client
  // nothing. Both recommendations, and the annex remediation line, now name
  // the law and who it covers.
  it.each(['fr', 'en'] as const)(
    'names the law behind article 47 and who it covers in %s',
    (language) => {
      for (const assessment of [article47, eaa]) {
        const { recommendation } = accessibilityStatementGuidance(getStrings(language), assessment);
        expect(recommendation).toContain('2005-102');
        expect(recommendation).toMatch(/organismes publics|public bodies/);
        expect(recommendation).toMatch(/250 millions d.euros|EUR 250 million/);
      }
      const remediation = (language === 'fr' ? REMEDIATION_FR : REMEDIATION_EN)[
        'accessibility-statement-missing'
      ];
      expect(remediation?.text).toContain('2005-102');
    },
  );
});
