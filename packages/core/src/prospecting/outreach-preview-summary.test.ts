import { describe, expect, it } from 'vitest';
import type { Finding } from '../types/findings.js';
import {
  buildOutreachPreviewSummary,
  coverageFactsFromAudit,
  selectOutreachProofCards,
  type OutreachProofCardCopyLookup,
} from './outreach-preview-summary.js';
import type { AuditCoverageSummary, CurrentAuditCoverageSummary } from '../coverage-summary.js';

const COPY: Record<string, { fr: string; en: string }> = {
  'keyboard-trap': {
    fr: 'La navigation au clavier reste bloquée.',
    en: 'Keyboard navigation is trapped.',
  },
  'color-contrast': { fr: 'Le texte manque de contraste.', en: 'Text lacks contrast.' },
  'meta-title-missing': { fr: 'Des pages n’ont pas de titre.', en: 'Some pages have no title.' },
  'image-oversized': { fr: 'Des images sont trop lourdes.', en: 'Some images are too heavy.' },
  'cookie-trackers': {
    fr: 'Des traceurs sont déposés sans accord.',
    en: 'Trackers are set without consent.',
  },
  'render-gap': { fr: 'Du contenu invisible au crawl.', en: 'Content invisible to crawlers.' },
};

const lookup: OutreachProofCardCopyLookup = (ruleId) => COPY[ruleId];

function finding(overrides: Partial<Finding> & Pick<Finding, 'ruleId'>): Finding {
  return {
    findingId: `f-${overrides.ruleId}`,
    auditId: 'audit-1',
    schemaVersion: 1,
    source: 'axe',
    category: 'accessibility',
    severity: 'moderate',
    wcagCriteria: [],
    title: 'title',
    description: 'description',
    pageUrls: ['https://example.fr/'],
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    dedupeKey: overrides.ruleId,
    firstSeenAt: new Date('2026-09-11T00:00:00.000Z'),
    lastSeenAt: new Date('2026-09-11T00:00:00.000Z'),
    ...overrides,
  };
}

function currentCoverage(): CurrentAuditCoverageSummary {
  return {
    kind: 'current',
    inventoriedUrlCount: 12,
    continuationOmittedUrlCount: 0,
    content: { completed: 12, partial: 0, failed: 0 },
    passes: {
      rendered: { completed: 12, partial: 0, failed: 0, notPlanned: 0 },
      axe: { completed: 12, partial: 0, failed: 0, notPlanned: 0 },
      extended: { completed: 12, partial: 0, failed: 0, notPlanned: 0 },
      lighthouse: { completed: 5, partial: 0, failed: 0, notPlanned: 7 },
    },
    pagesWithoutContentAnalysis: {},
    templateFamilyCount: 3,
  };
}

function buildInput(
  overrides: Partial<Parameters<typeof buildOutreachPreviewSummary>[0]> = {},
): Parameters<typeof buildOutreachPreviewSummary>[0] {
  return {
    auditId: 'audit-1',
    observedAt: new Date('2026-09-11T00:00:00.000Z'),
    coverage: {
      inventoriedPageCount: 12,
      contentCheckedPageCount: 12,
      performanceMeasuredPageCount: 5,
    },
    findings: [
      finding({ ruleId: 'keyboard-trap' }),
      finding({ ruleId: 'color-contrast' }),
      finding({ ruleId: 'meta-title-missing', category: 'seo', severity: 'minor' as const }),
    ],
    recipient: { businessName: 'Hôtel de la Plage', dataOrigins: ['public-website'] },
    links: {
      offer: 'https://odysseusaudit.com/offre',
      privacy: 'https://odysseusaudit.com/confidentialite-prospection',
      optOut: 'https://odysseusaudit.com/desinscription',
    },
    language: 'fr' as const,
    facts: { state: 'omitted' } as const,
    proofCardCopy: lookup,
    ...overrides,
  };
}

describe('selectOutreachProofCards', () => {
  it('ranks by severity, then affected-page count, then rule id', () => {
    const cards = selectOutreachProofCards(
      [
        finding({ ruleId: 'meta-title-missing', severity: 'minor' }),
        finding({ ruleId: 'keyboard-trap', severity: 'critical', pageUrls: ['https://a.fr/'] }),
        finding({
          ruleId: 'color-contrast',
          severity: 'critical',
          pageUrls: ['https://a.fr/', 'https://b.fr/', 'https://c.fr/'],
        }),
        finding({
          ruleId: 'image-oversized',
          severity: 'moderate',
          pageUrls: ['https://a.fr/', 'https://b.fr/'],
        }),
      ],
      lookup,
    );
    expect(cards.map((card) => card.title.en)).toEqual([
      'Text lacks contrast.',
      'Keyboard navigation is trapped.',
      'Some images are too heavy.',
    ]);
  });

  it('breaks a full tie on the rule id, so selection is stable across audits', () => {
    const cards = selectOutreachProofCards(
      [
        finding({ ruleId: 'meta-title-missing', category: 'seo', severity: 'minor' }),
        finding({ ruleId: 'color-contrast', severity: 'minor' }),
      ],
      lookup,
    );
    expect(cards[0]!.title.en).toBe('Text lacks contrast.');
    expect(cards[1]!.title.en).toBe('Some pages have no title.');
  });

  it('prefers category diversity from the second slot when eligible candidates allow it', () => {
    const cards = selectOutreachProofCards(
      [
        finding({ ruleId: 'keyboard-trap', severity: 'critical' }),
        finding({ ruleId: 'color-contrast', severity: 'critical' }),
        finding({ ruleId: 'meta-title-missing', category: 'seo', severity: 'minor' }),
        finding({ ruleId: 'render-gap', category: 'rendering', severity: 'minor' }),
      ],
      lookup,
    );
    // Rank order is color-contrast, keyboard-trap, meta-title, render-gap
    // (critical before minor, then rule id). Slot 1 takes the top
    // accessibility finding; slot 2 prefers the seo candidate over the
    // second accessibility one; slot 3 finds the rendering candidate.
    expect(cards.map((card) => card.category)).toEqual(['accessibility', 'seo', 'rendering']);
  });

  it('stays in pure rank order when every eligible candidate shares one category', () => {
    const cards = selectOutreachProofCards(
      [
        finding({ ruleId: 'keyboard-trap', severity: 'critical' }),
        finding({ ruleId: 'color-contrast', severity: 'serious' }),
        finding({ ruleId: 'image-oversized', severity: 'moderate' }),
      ],
      lookup,
    );
    expect(cards.map((card) => card.title.en)).toEqual([
      'Keyboard navigation is trapped.',
      'Text lacks contrast.',
      'Some images are too heavy.',
    ]);
  });

  it('treats a rule without catalog copy as card-ineligible', () => {
    const cards = selectOutreachProofCards(
      [
        finding({ ruleId: 'unknown-rule' }),
        finding({ ruleId: 'keyboard-trap', severity: 'critical' }),
        finding({ ruleId: 'color-contrast', severity: 'serious' }),
      ],
      lookup,
    );
    expect(cards).toHaveLength(2);
  });

  it('returns fewer than three cards when fewer are eligible', () => {
    const cards = selectOutreachProofCards([finding({ ruleId: 'keyboard-trap' })], lookup);
    expect(cards).toHaveLength(1);
  });
});

describe('buildOutreachPreviewSummary', () => {
  it('builds a strict-schema-valid summary with aggregate totals and exactly three cards', async () => {
    const { outreachPreviewSummarySchema } = await import('../types/outreach-preview.js');
    const result = buildOutreachPreviewSummary(
      buildInput({
        findings: [
          finding({ ruleId: 'keyboard-trap', severity: 'critical' }),
          finding({ ruleId: 'color-contrast', severity: 'critical' }),
          finding({ ruleId: 'meta-title-missing', category: 'seo', severity: 'minor' }),
          finding({
            ruleId: 'image-oversized',
            severity: 'minor',
            pageUrls: ['https://a.fr/', 'https://b.fr/'],
          }),
        ],
      }),
    );
    expect(result.state).toBe('built');
    if (result.state !== 'built') return;
    const parsed = outreachPreviewSummarySchema.parse(result.summary);
    expect(parsed.severityTotals).toEqual({ critical: 2, serious: 0, moderate: 0, minor: 2 });
    expect(parsed.distinctFindingCount).toBe(4);
    expect(parsed.affectedPageCount).toBe(3);
    expect(parsed.coverage).toEqual({
      inventoriedPageCount: 12,
      contentCheckedPageCount: 12,
      performanceMeasuredPageCount: 5,
    });
    expect(parsed.proofCards).toHaveLength(3);
    expect(parsed.contentVersion).toBe('v2');
  });

  it('refuses when fewer than three eligible, public-safe cards exist', () => {
    const result = buildOutreachPreviewSummary(
      buildInput({ findings: [finding({ ruleId: 'unknown-rule' })] }),
    );
    expect(result).toEqual({ state: 'refused', reason: 'insufficient-safe-cards' });
  });

  it('treats a catalog entry the content guard rejects as ineligible', () => {
    const hostileCopy: OutreachProofCardCopyLookup = (ruleId) =>
      ruleId === 'hostile'
        ? { fr: 'Vous devez corriger 50% des pages.', en: 'You must fix 50% of pages.' }
        : COPY[ruleId];
    const result = buildOutreachPreviewSummary(
      buildInput({
        findings: [
          finding({ ruleId: 'hostile', severity: 'critical' }),
          finding({ ruleId: 'keyboard-trap', severity: 'critical' }),
          finding({ ruleId: 'color-contrast', severity: 'serious' }),
          finding({ ruleId: 'meta-title-missing', category: 'seo', severity: 'minor' }),
        ],
        proofCardCopy: hostileCopy,
      }),
    );
    expect(result.state).toBe('built');
    if (result.state !== 'built') return;
    for (const card of result.summary.proofCards) {
      expect(card.title.en).not.toContain('50%');
    }
  });
});

describe('coverageFactsFromAudit', () => {
  it('maps the current summary onto the three public counts', () => {
    expect(coverageFactsFromAudit(currentCoverage())).toEqual({
      inventoriedPageCount: 12,
      contentCheckedPageCount: 12,
      performanceMeasuredPageCount: 5,
    });
  });

  it('counts partial content pages as checked, and refuses a legacy summary', () => {
    const partial = currentCoverage();
    partial.content = { completed: 10, partial: 2, failed: 0 };
    partial.passes.lighthouse = { completed: 4, partial: 1, failed: 0, notPlanned: 7 };
    const mapped = coverageFactsFromAudit(partial);
    expect(mapped).toMatchObject({ contentCheckedPageCount: 12, performanceMeasuredPageCount: 5 });

    const legacy: AuditCoverageSummary = {
      kind: 'legacy-unknown',
      inventoriedUrlCount: 3,
      continuationOmittedUrlCount: 0,
    };
    expect(coverageFactsFromAudit(legacy)).toBeUndefined();
  });
});
