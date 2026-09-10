import { describe, expect, it } from 'vitest';
import { HOTEL_EVIDENCE_OBSERVATIONS } from './hotel-prescan-evidence.js';
import { formatFullAuditPrice } from '../offer/pricing.js';
import {
  containsProhibitedPreviewContent,
  outreachPreviewInputSchema,
  outreachPreviewSummarySchema,
  type OutreachPreviewInput,
  type OutreachPreviewSummary,
} from './outreach-preview.js';

/** A one-pixel PNG, so the byte-level assertions have something real to run
 *  against without a fixture file. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const PNG_BYTES = Buffer.from(PNG_BASE64, 'base64').byteLength;

const OBSERVATIONS = Object.values(HOTEL_EVIDENCE_OBSERVATIONS);

function image(overrides: Partial<OutreachPreviewInput['images'][number]> = {}) {
  return {
    kind: 'specific-failure' as const,
    base64: PNG_BASE64,
    byteSize: PNG_BYTES,
    width: 1,
    height: 1,
    altText: { fr: 'Capture', en: 'Screenshot' },
    ...overrides,
  };
}

function summary(index: number) {
  return {
    observation: OBSERVATIONS[index] as { fr: string; en: string },
    severity: 'serious' as const,
    wcagCriteria: ['1.4.3'],
    pageRole: 'homepage' as const,
  };
}

function input(overrides: Partial<OutreachPreviewInput> = {}): OutreachPreviewInput {
  return {
    language: 'fr',
    businessName: 'Hôtel Exemple',
    links: {
      offer: 'https://odysseusaudit.com/offre',
      privacy: 'https://odysseusaudit.com/confidentialite',
      optOut: 'https://odysseusaudit.com/desinscription',
    },
    dataOrigins: ['public-hotel-catalogue', 'public-website'],
    summaries: [summary(0), summary(1), summary(2)],
    images: [image()],
    facts: { state: 'omitted' },
    observedAt: new Date('2026-08-29T00:00:00Z'),
    ...overrides,
  };
}

function reject(value: unknown): string {
  const result = outreachPreviewInputSchema.safeParse(value);
  if (result.success) throw new Error('expected the schema to reject this input');
  return JSON.stringify(result.error.issues);
}

describe('the outreach preview input contract', () => {
  it('accepts a well-formed input', () => {
    expect(outreachPreviewInputSchema.safeParse(input()).success).toBe(true);
  });

  describe('strictness is what rejects report-only data', () => {
    it.each([
      ['a finding id', { findingId: 'f-12' }],
      ['a selector', { selector: 'main > div:nth-child(3)' }],
      ['an exact affected URL', { affectedUrl: 'https://hotel-exemple.fr/reserver' }],
      ['a statistic', { conversionUplift: 0.23 }],
      ['an offer price', { priceEur: 1600 }],
      ['a rule id', { ruleId: 'color-contrast' }],
    ])('rejects %s, because the shape has nowhere to put it', (_label, extra) => {
      expect(reject({ ...input(), ...extra })).toContain('unrecognized');
    });
  });

  describe('closed vocabularies', () => {
    it('rejects an observation that is not on the shipped allowlist', () => {
      expect(
        reject(
          input({
            summaries: [
              {
                ...summary(0),
                observation: { fr: 'Votre site est illégal.', en: 'Your site is illegal.' },
              },
              summary(1),
              summary(2),
            ],
          }),
        ),
      ).toContain('allowlist');
    });

    it('rejects a WCAG criterion that is not a criterion number', () => {
      expect(
        reject(
          input({
            summaries: [{ ...summary(0), wcagCriteria: ['keyboard'] }, summary(1), summary(2)],
          }),
        ),
      ).toBeTruthy();
    });

    it('rejects an unknown data origin', () => {
      expect(reject({ ...input(), dataOrigins: ['purchased-list'] })).toBeTruthy();
    });

    it('requires at least one data origin, since article 14 has to say something', () => {
      expect(reject(input({ dataOrigins: [] }))).toBeTruthy();
    });
  });

  describe('link policy', () => {
    it.each([
      ['http', 'http://odysseusaudit.com/offre'],
      ['a third-party host', 'https://example.com/offre'],
      ['credentials', 'https://user:pass@odysseusaudit.com/offre'],
      ['a port', 'https://odysseusaudit.com:8443/offre'],
      ['a javascript URL', 'javascript:alert(1)'],
      ['a relative path', '/offre'],
    ])('rejects %s', (_label, offer) => {
      expect(reject(input({ links: { ...input().links, offer } }))).toBeTruthy();
    });
  });

  describe('image bounds', () => {
    it('rejects a payload that is not a PNG', () => {
      const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).toString('base64');
      expect(
        reject(
          input({
            images: [image({ base64: jpeg, byteSize: 6 })],
          }),
        ),
      ).toContain('PNG');
    });

    it('rejects a declared size that disagrees with the payload', () => {
      expect(reject(input({ images: [image({ byteSize: PNG_BYTES + 1 })] }))).toContain('byteSize');
    });

    it('rejects two images of the same kind', () => {
      expect(reject(input({ images: [image(), image()] }))).toContain('one image per kind');
    });

    it('rejects an image above the evidence contract per-asset cap', () => {
      expect(reject(input({ images: [image({ byteSize: 2 * 1024 * 1024 })] }))).toBeTruthy();
    });
  });

  describe('summary count follows the evidence contract', () => {
    it('rejects fewer than three summaries', () => {
      expect(reject(input({ summaries: [summary(0), summary(1)] }))).toBeTruthy();
    });

    it('rejects more than five', () => {
      expect(
        reject(input({ summaries: [0, 1, 2, 3, 0, 1].map((index) => summary(index)) })),
      ).toBeTruthy();
    });
  });

  it('runs the content guard over every facts paragraph', () => {
    expect(
      reject(
        input({
          facts: {
            state: 'rendered',
            heading: 'Cadre',
            paragraphs: ['Vous devez vous mettre en conformité.'],
          },
        }),
      ),
    ).toContain('legal-conclusion');
  });

  it('runs the content guard over the business name', () => {
    expect(reject(input({ businessName: '<script>alert(1)</script>' }))).toContain('businessName');
  });
});

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

describe('the v2 outreach preview summary contract', () => {
  function proofCard(overrides: Partial<OutreachPreviewSummary['proofCards'][number]> = {}) {
    return {
      title: { fr: 'Le texte manque de contraste.', en: 'Text lacks contrast.' },
      category: 'accessibility' as const,
      severity: 'serious' as const,
      affectedPageCount: 3,
      ...overrides,
    };
  }

  function summaryInput(overrides: Partial<OutreachPreviewSummary> = {}): OutreachPreviewSummary {
    return {
      contentVersion: 'v2',
      auditId: 'audit-1',
      observedAt: new Date('2026-09-11T00:00:00.000Z'),
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
      severityTotals: { critical: 1, serious: 1, moderate: 0, minor: 2 },
      proofCards: [proofCard(), proofCard(), proofCard({ severity: 'minor' })],
      facts: { state: 'omitted' },
      ...overrides,
    };
  }

  it('accepts a well-formed v2 summary', () => {
    expect(outreachPreviewSummarySchema.parse(summaryInput())).toBeTruthy();
  });

  it('is strict: a report-only field has nowhere to go', () => {
    const hostile = summaryInput({
      pageUrls: ['https://example.fr/contact'],
    } as Partial<OutreachPreviewSummary>);
    expect(outreachPreviewSummarySchema.safeParse(hostile).success).toBe(false);
  });

  it('rejects a selector, a finding id, and an occurrence count smuggled into fields that exist', () => {
    const withSelector = summaryInput();
    withSelector.proofCards = [
      proofCard(),
      proofCard(),
      proofCard({ title: { fr: 'Voir .form > .field', en: 'See .form > .field' } }),
    ];
    expect(outreachPreviewSummarySchema.safeParse(withSelector).success).toBe(false);

    const withId = summaryInput({
      auditId: 'f-123',
    });
    // auditId itself is an opaque stored id, not public prose: acceptable.
    expect(outreachPreviewSummarySchema.safeParse(withId).success).toBe(true);
  });

  it('requires exactly three proof cards', () => {
    const two = summaryInput();
    // The tuple type already forbids two at compile time; the runtime guard
    // is what a hand-built object from JSON meets.
    const parsed = outreachPreviewSummarySchema.safeParse({
      ...two,
      proofCards: [proofCard(), proofCard()],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects severity totals that do not sum to the distinct finding count', () => {
    expect(
      outreachPreviewSummarySchema.safeParse(
        summaryInput({ severityTotals: { critical: 9, serious: 1, moderate: 0, minor: 2 } }),
      ).success,
    ).toBe(false);
  });

  it('rejects coverage subsets larger than the inventory', () => {
    expect(
      outreachPreviewSummarySchema.safeParse(
        summaryInput({
          coverage: {
            inventoriedPageCount: 12,
            contentCheckedPageCount: 40,
            performanceMeasuredPageCount: 5,
          },
        }),
      ).success,
    ).toBe(false);
  });

  it('runs the content guard over proof-card titles, business name, and facts', () => {
    const hostileCards = summaryInput();
    hostileCards.proofCards = [
      proofCard(),
      proofCard(),
      proofCard({ title: { fr: 'Vous devez agir.', en: 'You must act.' } }),
    ];
    expect(outreachPreviewSummarySchema.safeParse(hostileCards).success).toBe(false);

    expect(
      outreachPreviewSummarySchema.safeParse(
        summaryInput({
          recipient: { businessName: 'onerror=alert(1)', dataOrigins: ['public-website'] },
        }),
      ).success,
    ).toBe(false);

    expect(
      outreachPreviewSummarySchema.safeParse(
        summaryInput({
          facts: {
            state: 'rendered',
            heading: 'Cadre',
            paragraphs: ['Une amende de 300 000 euros est prévue.'],
          },
        }),
      ).success,
    ).toBe(false);
  });

  it('keeps the v1 link policy', () => {
    expect(
      outreachPreviewSummarySchema.safeParse(
        summaryInput({
          links: {
            offer: 'http://odysseusaudit.com/offre',
            privacy: 'https://odysseusaudit.com/confidentialite-prospection',
            optOut: 'https://odysseusaudit.com/desinscription',
          },
        }),
      ).success,
    ).toBe(false);
    expect(
      outreachPreviewSummarySchema.safeParse(
        summaryInput({
          links: {
            offer: 'https://evil.example.com/offre',
            privacy: 'https://odysseusaudit.com/confidentialite-prospection',
            optOut: 'https://odysseusaudit.com/desinscription',
          },
        }),
      ).success,
    ).toBe(false);
  });

  it('rejects the v1 content version on a v2 document', () => {
    expect(
      outreachPreviewSummarySchema.safeParse(summaryInput({ contentVersion: 'v1' as never }))
        .success,
    ).toBe(false);
  });
});
