import { describe, expect, it } from 'vitest';
import { outreachPreviewSummarySchema, type OutreachPreviewSummary } from '@odysseus/core';
import { generateOutreachPreviewHtmlV2 } from './render-html-v2.js';
import { lintOutreachPreviewHtml } from './preview-lint.js';
import { formatFullAuditPrice } from '@odysseus/core';

function summary(overrides: Partial<OutreachPreviewSummary> = {}): OutreachPreviewSummary {
  return {
    contentVersion: 'v2',
    auditId: 'audit-1',
    observedAt: new Date('2026-09-11T00:00:00.000Z'),
    language: 'fr',
    recipient: {
      businessName: 'Hôtel de la Plage',
      dataOrigins: ['public-hotel-catalogue', 'public-website'],
    },
    links: {
      offer: 'https://odysseusaudit.com/offre',
      privacy: 'https://odysseusaudit.com/confidentialite-prospection',
      optOut: 'https://odysseusaudit.com/desinscription',
    },
    coverage: {
      inventoriedPageCount: 23,
      contentCheckedPageCount: 23,
      performanceMeasuredPageCount: 9,
    },
    distinctFindingCount: 5,
    affectedPageCount: 11,
    severityTotals: { critical: 1, serious: 1, moderate: 1, minor: 2 },
    proofCards: [
      {
        title: {
          fr: 'La navigation au clavier reste bloquée.',
          en: 'Keyboard navigation is trapped.',
        },
        category: 'accessibility',
        severity: 'critical',
        affectedPageCount: 4,
      },
      {
        title: { fr: 'Des pages n’ont pas de titre.', en: 'Some pages have no title.' },
        category: 'seo',
        severity: 'serious',
        affectedPageCount: 6,
      },
      {
        title: { fr: 'Des images sont trop lourdes.', en: 'Some images are too heavy.' },
        category: 'performance',
        severity: 'minor',
        affectedPageCount: 2,
      },
    ],
    facts: { state: 'omitted' },
    ...overrides,
  };
}

describe('generateOutreachPreviewHtmlV2', () => {
  it('renders the product-specified section order, in French', () => {
    const html = generateOutreachPreviewHtmlV2(summary());
    // The offer heading is matched with its tags: the lede names the audit
    // earlier in the document too.
    const order = [
      'Ce qui a été mesuré',
      'Ce qui a été relevé',
      'Répartition par gravité',
      'Trois constats en exemple',
      '>L’audit complet</h2>',
      'Vos données et ce document',
    ].map((heading) => html.indexOf(heading));
    expect(order.every((index) => index > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain('<html lang="fr">');
  });

  it('shows the three coverage counters separately, never as one pages-scanned figure', () => {
    const html = generateOutreachPreviewHtmlV2(summary());
    expect(html).toContain('>23</div>');
    expect(html).toContain('>9</div>');
    expect(html).toContain('échantillon représentatif');
  });

  it('renders four severity tiles with their counts', () => {
    const html = generateOutreachPreviewHtmlV2(summary());
    expect(html).toContain('severity-critical');
    expect(html).toContain('severity-serious');
    expect(html).toContain('severity-moderate');
    expect(html).toContain('severity-minor');
    expect(html).toContain('Critique');
    expect(html).toContain('Mineure');
  });

  it('renders exactly three proof cards with category, severity, and page counts', () => {
    const html = generateOutreachPreviewHtmlV2(summary());
    expect((html.match(/class="card"/gu) ?? []).length).toBe(3);
    expect(html).toContain('Accessibilité');
    expect(html).toContain('Référencement');
    expect(html).toContain('6 pages concernées');
  });

  it('carries the code-owned price exactly once and the reply CTA', () => {
    const html = generateOutreachPreviewHtmlV2(summary());
    const price = formatFullAuditPrice('fr');
    expect((html.match(new RegExp(price.replaceAll('$', ''), 'gu')) ?? []).length).toBe(1);
    expect(html).toContain('Répondre pour demander l’audit');
    expect(html).not.toContain('stripe');
  });

  it('renders the deterministic legal block when present and omits it when omitted', () => {
    const withFacts = generateOutreachPreviewHtmlV2(
      summary({
        facts: {
          state: 'rendered',
          heading: 'Critères et données du registre',
          paragraphs: ['Les critères applicables dépendent de la taille de l’entreprise.'],
        },
      }),
    );
    expect(withFacts).toContain('Critères et données du registre');
    expect(generateOutreachPreviewHtmlV2(summary())).not.toContain('Critères et données');
  });

  it('contains no image anywhere and no remote asset', () => {
    const html = generateOutreachPreviewHtmlV2(summary());
    expect(html).not.toContain('<img');
    expect(html).not.toContain('http://');
    for (const url of html.match(/https?:\/\/[^"]+/gu) ?? []) {
      expect(url).toContain('odysseusaudit.com');
    }
  });

  it('plan 041 Part A: shows an own-counts grade with its mandatory disclaimer', () => {
    // The base fixture has a critical finding, which is D under
    // computeSeverityGrade (matching isProspectingWorthy's own cutoff; the
    // scale has no F, an unsolicited outreach document should not tell a
    // stranger their site "failed").
    const html = generateOutreachPreviewHtmlV2(summary());
    expect(html).toContain('Note de constats');
    expect(html).toContain('>D</span>');
    expect(html).toContain(
      'Cette note mesure les constats des scanners, pas la conformité légale.',
    );
  });

  it('plan 041 Part A: grades a clean site A, still with its disclaimer', () => {
    const html = generateOutreachPreviewHtmlV2(
      summary({
        distinctFindingCount: 3,
        severityTotals: { critical: 0, serious: 0, moderate: 3, minor: 0 },
      }),
    );
    expect(html).toContain('>A</span>');
    expect(html).toContain(
      'Cette note mesure les constats des scanners, pas la conformité légale.',
    );
  });

  it('is deterministic: the same input renders the same bytes', () => {
    expect(generateOutreachPreviewHtmlV2(summary())).toBe(generateOutreachPreviewHtmlV2(summary()));
  });

  it('switches languages completely', () => {
    const en = generateOutreachPreviewHtmlV2(summary({ language: 'en' }));
    expect(en).toContain('<html lang="en">');
    expect(en).toContain('What was measured');
    expect(en).toContain('Reply to request the audit');
    expect(en).not.toContain('Ce qui a été mesuré');
  });

  it('escapes a hostile business name', () => {
    expect(() =>
      generateOutreachPreviewHtmlV2(
        summary({
          recipient: { businessName: '<script>alert(1)</script>', dataOrigins: ['public-website'] },
        }),
      ),
    ).toThrow();
  });

  it('refuses an input that fails the schema, before rendering', () => {
    const bad = summary({ severityTotals: { critical: 99, serious: 1, moderate: 1, minor: 2 } });
    expect(() => generateOutreachPreviewHtmlV2(bad)).toThrow();
  });

  it('passes the document lint', () => {
    expect(lintOutreachPreviewHtml(generateOutreachPreviewHtmlV2(summary()))).toBeNull();
  });

  it('round-trips through the strict schema the renderer parses with', () => {
    expect(outreachPreviewSummarySchema.parse(summary())).toBeTruthy();
  });
});
