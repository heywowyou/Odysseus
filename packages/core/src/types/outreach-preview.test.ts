import { describe, expect, it } from 'vitest';
import { formatFullAuditPrice } from '../offer/pricing.js';
import {
  containsProhibitedPreviewContent,
  outreachPreviewSummaryV3Schema,
  type OutreachPreviewSummaryV3,
} from './outreach-preview.js';

describe('containsProhibitedPreviewContent', () => {
  it.each([
    ['markup', '<img src=x>'],
    ['event-handler', 'onclick=steal()'],
    ['script-url', 'javascript:alert(1)'],
    ['insecure-url', 'see http://example.com'],
    ['finding-id', 'see finding f-12'],
    ['css-selector', 'main > .card'],
    ['percentage', '34% of visitors'],
    ['legal-conclusion', 'you must fix this'],
    ['deadline', 'avant le 28 juin 2025'],
    ['sanction', 'une amende est prévue'],
    ['stale-offer', 'tarif sur devis'],
    ['currency-amount', 'a EUR 50,000 ceiling'],
  ])('fires the %s rule', (rule, text) => {
    expect(containsProhibitedPreviewContent(text)).toBe(rule);
  });

  // Issue #405: the price moved to EUR 990 HT, so a document still quoting
  // the previous figure is stale offer copy, not merely an unapproved amount.
  it.each(['1 600 \u20ac HT', '1\u00a0600\u00a0\u20ac HT', 'EUR 1,600 excl. VAT'])(
    'rejects the superseded price spelled %j',
    (price) => {
      expect(containsProhibitedPreviewContent(`Audit: ${price}.`)).toBe('stale-offer');
    },
  );

  it('permits the offer price in both languages', () => {
    // Built from the formatter, not typed here: the French price carries a
    // no-break space, and a hand-typed copy of it is a test that passes for the
    // wrong reason or fails for an invisible one.
    for (const language of ['fr', 'en'] as const) {
      expect(
        containsProhibitedPreviewContent(`Audit: ${formatFullAuditPrice(language)}.`),
      ).toBeNull();
    }
  });

  it('permits a threshold quoted verbatim from the regime table', () => {
    expect(
      containsProhibitedPreviewContent(
        "dont le chiffre d'affaires annuel dépasse 2 000 000 €, lorsque le site propose",
      ),
    ).toBeNull();
  });

  it('still rejects a currency amount nobody approved', () => {
    expect(containsProhibitedPreviewContent('a claim worth EUR 45,000')).toBe('currency-amount');
  });

  it('passes ordinary preview prose', () => {
    expect(
      containsProhibitedPreviewContent(
        'Nous avons observé trois défauts sur votre site, sans y accéder autrement que comme un visiteur.',
      ),
    ).toBeNull();
  });
});

describe('the v3 outreach preview summary contract', () => {
  function priorityCard(
    overrides: Partial<OutreachPreviewSummaryV3['priorityCards'][number]> = {},
  ): OutreachPreviewSummaryV3['priorityCards'][number] {
    return {
      rank: 1,
      title: {
        fr: 'Certains boutons ne sont pas nommés clairement.',
        en: 'Some buttons are not clearly named.',
      },
      category: 'accessibility',
      severity: 'serious',
      affectedPageCount: 1,
      ...overrides,
    };
  }

  function summaryV3(overrides: Partial<OutreachPreviewSummaryV3> = {}): OutreachPreviewSummaryV3 {
    return {
      contentVersion: 'v3',
      language: 'fr',
      recipient: { businessName: 'Hôtel de la Plage', dataOrigins: ['public-website'] },
      links: {
        offer: 'https://odysseusaudit.com/offre',
        privacy: 'https://odysseusaudit.com/confidentialite-prospection',
        optOut: 'https://odysseusaudit.com/desinscription',
      },
      coverage: {
        inventoriedPageCount: 12,
        contentCheckedPageCount: 12,
        performanceMeasuredPageCount: 5,
      },
      distinctFindingCount: 4,
      affectedPageCount: 7,
      severityTotals: { critical: 1, serious: 1, moderate: 1, minor: 1 },
      categoryTotals: {
        accessibility: 2,
        seo: 1,
        geo: 0,
        performance: 1,
        rendering: 0,
        privacy: 0,
      },
      priorityCards: [
        priorityCard({ rank: 1, severity: 'critical' }),
        priorityCard({ rank: 2 }),
        priorityCard({ rank: 3, severity: 'moderate' }),
      ],
      facts: { state: 'omitted' },
      ...overrides,
    };
  }

  it('accepts a well-formed strict v3 summary', () => {
    expect(outreachPreviewSummaryV3Schema.parse(summaryV3())).toBeTruthy();
    expect(
      outreachPreviewSummaryV3Schema.safeParse({
        ...summaryV3(),
        exactAffectedUrls: ['https://hotel.example/chambres'],
      }).success,
    ).toBe(false);
  });

  it('requires category totals that add up to the distinct finding count', () => {
    expect(
      outreachPreviewSummaryV3Schema.safeParse(
        summaryV3({
          categoryTotals: {
            accessibility: 3,
            seo: 1,
            geo: 0,
            performance: 1,
            rendering: 0,
            privacy: 0,
          },
        }),
      ).success,
    ).toBe(false);
  });

  it('rejects three priority cards when the document has fewer than three distinct findings', () => {
    expect(
      outreachPreviewSummaryV3Schema.safeParse(
        summaryV3({
          distinctFindingCount: 2,
          severityTotals: { critical: 1, serious: 1, moderate: 0, minor: 0 },
          categoryTotals: {
            accessibility: 2,
            seo: 0,
            geo: 0,
            performance: 0,
            rendering: 0,
            privacy: 0,
          },
        }),
      ).success,
    ).toBe(false);
  });

  it('carries no scan date and no data-quality section', () => {
    expect(
      outreachPreviewSummaryV3Schema.safeParse({
        ...summaryV3(),
        observedAt: new Date('2026-09-19T08:00:00.000Z'),
      }).success,
    ).toBe(false);
    expect(
      outreachPreviewSummaryV3Schema.safeParse({
        ...summaryV3(),
        dataQuality: { status: 'complete', limitations: [] },
      }).success,
    ).toBe(false);
  });

  it('runs the public-content guard over v3 priority copy', () => {
    const hostileCard = summaryV3();
    hostileCard.priorityCards = [
      priorityCard({ rank: 1 }),
      priorityCard({
        rank: 2,
        title: { fr: 'Vous devez agir.', en: 'You must act.' },
      }),
      priorityCard({ rank: 3 }),
    ];
    expect(outreachPreviewSummaryV3Schema.safeParse(hostileCard).success).toBe(false);
  });
  // Issue #530: these ran against the retired v1/v2 contracts; v3 shares
  // their link schema, facts schema and content guard.
  describe('link policy', () => {
    it.each([
      ['http', 'http://odysseusaudit.com/offre'],
      ['a third-party host', 'https://example.com/offre'],
      ['credentials', 'https://user:pass@odysseusaudit.com/offre'],
      ['a port', 'https://odysseusaudit.com:8443/offre'],
      ['a javascript URL', 'javascript:alert(1)'],
      ['a relative path', '/offre'],
    ])('rejects %s', (_label, offer) => {
      const value = summaryV3();
      value.links = { ...value.links, offer };
      expect(outreachPreviewSummaryV3Schema.safeParse(value).success).toBe(false);
    });
  });

  it('runs the content guard over every facts paragraph', () => {
    const result = outreachPreviewSummaryV3Schema.safeParse(
      summaryV3({
        facts: {
          state: 'rendered',
          heading: 'Cadre',
          paragraphs: ['Vous devez vous mettre en conformité.'],
        },
      }),
    );
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('legal-conclusion');
  });

  it('runs the content guard over the business name', () => {
    const result = outreachPreviewSummaryV3Schema.safeParse(
      summaryV3({
        recipient: { businessName: '<script>alert(1)</script>', dataOrigins: ['public-website'] },
      }),
    );
    expect(result.success).toBe(false);
  });
});
