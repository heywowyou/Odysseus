import { describe, expect, it } from 'vitest';
import { ARTICLE_47_REGIME_ID, EAA_REGIME_ID, type ObligationAssessment } from '@odysseus/core';
import { eaaSanctionFigureSentence } from '@odysseus/core';
import { renderExecutiveSummary } from './executive-summary.js';
import { getStrings } from '../strings/i18n.js';
import { escapeCopy, escapeHtml } from '../html-utils.js';
import {
  loadSmallSiteAnalysis,
  loadSmallSiteFindings,
  loadSmallSiteManifest,
} from '../../test-fixtures.js';

// Issue #57: the executive pages carried no trace of the regulatory
// regime, so a reader who stopped after section 01 never learned one was
// involved. The block under test states the criterion, splices the
// unchanged general EAA sentence from core, and recommends legal
// confirmation. Its gate is byte-for-byte the same determination
// legal-exposure.ts's general EAA reference card uses, and
// docs/rules/obligation-basis.md section 7 (amended 2026-09-04) is what
// permits the sentence here at all.

async function renderWith(
  language: 'fr' | 'en',
  obligationAssessment: ObligationAssessment | undefined,
): Promise<string> {
  // StoredAnalysis.obligationAssessment is required, so the
  // undefined-gate case deletes the property and casts, the same
  // precedent render-html.test.ts's absent-assessment test uses.
  const { obligationAssessment: _fixtureAssessment, ...rest } =
    await loadSmallSiteAnalysis(language);
  const analysis =
    obligationAssessment === undefined
      ? (rest as Awaited<ReturnType<typeof loadSmallSiteAnalysis>>)
      : { ...rest, obligationAssessment };
  return renderExecutiveSummary(
    getStrings(language),
    1,
    analysis,
    await loadSmallSiteFindings(),
    await loadSmallSiteManifest(),
  );
}

const eaaLikelyInScope: ObligationAssessment = {
  status: 'likely_in_scope',
  basis: [{ regimeId: EAA_REGIME_ID, facts: [{ kind: 'siren-missing' }] }],
};

describe('the executive regulatory-context block (issue #57)', () => {
  it('renders the criterion, the unchanged sanction sentence, and the counsel note', async () => {
    const html = await renderWith('fr', eaaLikelyInScope);
    expect(html).toContain('data-executive-regulatory-context');
    expect(html).toContain('Point réglementaire à vérifier');
    expect(html).toContain('European Accessibility Act');
    expect(html).toContain('Cadre réglementaire');
    expect(html).toContain('plafond prévu par le texte');
    // Byte-identical splice from core, not a restated figure.
    expect(html).toContain(escapeCopy(eaaSanctionFigureSentence('fr'), 'fr'));
  });

  it('renders in English with no French leaking in', async () => {
    const html = await renderWith('en', {
      ...eaaLikelyInScope,
      basis: [{ regimeId: EAA_REGIME_ID, facts: [{ kind: 'siren-missing' }] }],
    });
    expect(html).toContain('Regulatory point to verify');
    expect(html).toContain('Legal exposure');
    expect(html).toContain(escapeCopy(eaaSanctionFigureSentence('en'), 'en'));
    expect(html).not.toContain('Point réglementaire à vérifier');
  });

  it('adds no deadline and never names the article 47 figure', async () => {
    const html = await renderWith('fr', eaaLikelyInScope);
    const block = html.slice(
      html.indexOf('data-executive-regulatory-context'),
      html.indexOf('</div>', html.indexOf('data-executive-regulatory-context')),
    );
    expect(block).not.toContain('28 juin 2025');
    expect(block).not.toContain('28 June 2025');
    expect(block).not.toContain('50\u00a0000');
    expect(block).not.toContain('50 000');
  });

  it('renders for an in_scope assessment too', async () => {
    const html = await renderWith('fr', {
      status: 'in_scope',
      basis: [
        {
          regimeId: EAA_REGIME_ID,
          facts: [{ kind: 'transactional-flow', evidence: [] }],
        },
      ],
    });
    expect(html).toContain('data-executive-regulatory-context');
  });

  it('renders nothing for an out_of_scope assessment', async () => {
    const html = await renderWith('fr', {
      status: 'out_of_scope',
      basis: [
        {
          regimeId: EAA_REGIME_ID,
          facts: [{ kind: 'sme-exemption', effectifCode: '02', turnoverEur: 500_000 }],
        },
      ],
    });
    expect(html).not.toContain('data-executive-regulatory-context');
    expect(html).not.toContain(escapeCopy(eaaSanctionFigureSentence('fr'), 'fr'));
  });

  it('renders nothing without an assessment', async () => {
    const html = await renderWith('fr', undefined);
    expect(html).not.toContain('data-executive-regulatory-context');
  });

  it('renders nothing when article 47, not EAA, is the resolved regime', async () => {
    const html = await renderWith('fr', {
      status: 'in_scope',
      basis: [
        {
          regimeId: ARTICLE_47_REGIME_ID,
          facts: [{ kind: 'turnover', amountEur: 300_000_000, thresholdEur: 250_000_000 }],
        },
      ],
    });
    expect(html).not.toContain('data-executive-regulatory-context');
    expect(html).not.toContain(escapeCopy(eaaSanctionFigureSentence('fr'), 'fr'));
  });
});
