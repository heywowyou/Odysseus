import { describe, expect, it } from 'vitest';
import {
  extractGeoCandidates,
  readJsonLdNodes,
  readJsonLdTypes,
  findMissingEntityFields,
  STRUCTURED_DATA_ENTITY_MISSING_RULE_ID,
  ENTITY_DATA_INCOMPLETE_RULE_ID,
  FAQ_CONTENT_WITHOUT_SCHEMA_RULE_ID,
  type GeoPageInput,
} from './normalize-geo.js';

const HOMEPAGE_URL = 'https://example.com/';

function page(overrides: Partial<GeoPageInput> = {}): GeoPageInput {
  return {
    pageUrl: HOMEPAGE_URL,
    jsonLdTypes: [],
    jsonLdEntities: [],
    questionHeadingCount: 0,
    hasFaqSchema: false,
    ...overrides,
  };
}

describe('readJsonLdTypes', () => {
  it('reads a single string @type', () => {
    expect(readJsonLdTypes({ '@type': 'LocalBusiness' })).toEqual(['LocalBusiness']);
  });

  it('reads an array of @type values', () => {
    expect(readJsonLdTypes({ '@type': ['Hotel', 'LodgingBusiness'] })).toEqual([
      'Hotel',
      'LodgingBusiness',
    ]);
  });

  it('returns an empty array for a block with no @type', () => {
    expect(readJsonLdTypes({ name: 'Example' })).toEqual([]);
  });

  it('returns an empty array for null or non-object input rather than throwing', () => {
    expect(readJsonLdTypes(null)).toEqual([]);
    expect(readJsonLdTypes('not an object')).toEqual([]);
  });
});

describe('readJsonLdNodes', () => {
  it('reads the nodes of a Yoast @graph container, not the container itself', () => {
    const graph = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', name: 'Accueil' },
        { '@type': 'WebSite', name: 'Grand Hôtel' },
        { '@type': ['Hotel', 'FAQPage'], name: 'Grand Hôtel' },
      ],
    };
    expect(readJsonLdNodes(graph).flatMap((node) => readJsonLdTypes(node))).toEqual([
      'WebPage',
      'WebSite',
      'Hotel',
      'FAQPage',
    ]);
  });

  it('reads a top-level array of nodes and a single node the same way', () => {
    expect(readJsonLdNodes([{ '@type': 'Hotel' }, { '@type': 'BreadcrumbList' }])).toHaveLength(2);
    expect(readJsonLdNodes({ '@type': 'Hotel' })).toHaveLength(1);
  });

  it('ignores untyped values and unparsed blocks', () => {
    expect(readJsonLdNodes({ '@context': 'https://schema.org' })).toEqual([]);
    expect(readJsonLdNodes(null)).toEqual([]);
  });
});

describe('findMissingEntityFields', () => {
  it('does not judge a WebSite node, which never carries an address or telephone', () => {
    expect(findMissingEntityFields({ '@type': 'WebSite', name: 'Grand Hôtel' })).toBeNull();
  });

  it('returns null for a non-entity type (nothing for this check to judge)', () => {
    expect(findMissingEntityFields({ '@type': 'BreadcrumbList' })).toBeNull();
  });

  it('returns an empty array when every required field is present', () => {
    expect(
      findMissingEntityFields({
        '@type': 'LocalBusiness',
        name: 'Hôtel du Cours',
        address: '12 rue de la Mairie',
        telephone: '+33 5 00 00 00 00',
      }),
    ).toEqual([]);
  });

  it('lists specific missing fields for a recognized entity type', () => {
    expect(findMissingEntityFields({ '@type': 'Organization', name: 'Example SAS' })).toEqual([
      'address',
      'telephone',
    ]);
  });

  it('recognizes LocalBusiness subtypes like Hotel, not only the literal word', () => {
    expect(findMissingEntityFields({ '@type': 'Hotel', name: 'Example' })).toEqual([
      'address',
      'telephone',
    ]);
  });

  it('accepts a PostalAddress object as the address, the usual schema.org form', () => {
    expect(
      findMissingEntityFields({
        '@type': 'Hotel',
        name: 'Hôtel Whistler',
        address: {
          '@type': 'PostalAddress',
          streetAddress: '11 rue Saint-Vincent-de-Paul',
          addressLocality: 'Paris',
        },
        telephone: '+33 1 00 00 00 00',
      }),
    ).toEqual([]);
  });

  it('treats an address object with no text as missing', () => {
    expect(
      findMissingEntityFields({
        '@type': 'Hotel',
        name: 'Example',
        address: { '@type': 'PostalAddress', streetAddress: ' ' },
        telephone: '01',
      }),
    ).toEqual(['address']);
  });

  it('treats an empty-string field as missing, not merely present', () => {
    expect(
      findMissingEntityFields({
        '@type': 'LocalBusiness',
        name: 'Example',
        address: '  ',
        telephone: '01',
      }),
    ).toEqual(['address']);
  });
});

describe('structured-data-entity-missing', () => {
  it('fires once, attributed to the homepage, when no page declares an entity type', () => {
    const candidates = extractGeoCandidates(
      [page({ pageUrl: 'https://example.com/about', jsonLdTypes: ['BreadcrumbList'] })],
      HOMEPAGE_URL,
    );
    const entityMissing = candidates.filter(
      (c) => c.ruleId === STRUCTURED_DATA_ENTITY_MISSING_RULE_ID,
    );
    expect(entityMissing).toHaveLength(1);
    expect(entityMissing[0]?.category).toBe('geo');
    expect(entityMissing[0]?.severity).toBe('moderate');
    expect(entityMissing[0]?.pageUrl).toBe(HOMEPAGE_URL);
  });

  it('does not fire when any page anywhere declares a recognized entity type', () => {
    const candidates = extractGeoCandidates(
      [
        page({ pageUrl: 'https://example.com/about', jsonLdTypes: ['BreadcrumbList'] }),
        page({ pageUrl: HOMEPAGE_URL, jsonLdTypes: ['LocalBusiness'] }),
      ],
      HOMEPAGE_URL,
    );
    expect(candidates.filter((c) => c.ruleId === STRUCTURED_DATA_ENTITY_MISSING_RULE_ID)).toEqual(
      [],
    );
  });
});

describe('entity-data-incomplete', () => {
  it('fires per page for an entity block missing required fields', () => {
    const candidates = extractGeoCandidates(
      [
        page({
          jsonLdTypes: ['LocalBusiness'],
          jsonLdEntities: [{ parsed: { '@type': 'LocalBusiness', name: 'Example' } }],
        }),
      ],
      HOMEPAGE_URL,
    );
    const incomplete = candidates.filter((c) => c.ruleId === ENTITY_DATA_INCOMPLETE_RULE_ID);
    expect(incomplete).toHaveLength(1);
    expect(incomplete[0]?.category).toBe('geo');
    expect(incomplete[0]?.severity).toBe('minor');
    expect(incomplete[0]?.pageUrl).toBe(HOMEPAGE_URL);
    expect(incomplete[0]?.rawEvidenceForPage).toEqual({ missingFields: ['address', 'telephone'] });
  });

  it('does not fire for a complete entity block', () => {
    const candidates = extractGeoCandidates(
      [
        page({
          jsonLdTypes: ['LocalBusiness'],
          jsonLdEntities: [
            {
              parsed: {
                '@type': 'LocalBusiness',
                name: 'Example',
                address: 'Rue A',
                telephone: '01',
              },
            },
          ],
        }),
      ],
      HOMEPAGE_URL,
    );
    expect(candidates.filter((c) => c.ruleId === ENTITY_DATA_INCOMPLETE_RULE_ID)).toEqual([]);
  });

  it('does not fire when a complete establishment sits next to a thinner company node', () => {
    const hotel = {
      '@type': 'Hotel',
      name: 'Hôtel du Clos',
      telephone: '+33 2 00 00 00 00',
      address: { '@type': 'PostalAddress', streetAddress: '1 rue du Clos', postalCode: '35000' },
    };
    const company = {
      '@type': 'Organization',
      name: 'Clos SAS',
      contactPoint: { '@type': 'ContactPoint', telephone: '+33 2 00 00 00 01' },
    };
    const candidates = extractGeoCandidates(
      [
        page({
          jsonLdTypes: ['Hotel', 'Organization'],
          jsonLdEntities: [{ parsed: hotel }, { parsed: company }],
        }),
      ],
      HOMEPAGE_URL,
    );
    expect(candidates.filter((c) => c.ruleId === ENTITY_DATA_INCOMPLETE_RULE_ID)).toEqual([]);
  });

  it('reads a telephone given only under contactPoint', () => {
    expect(
      findMissingEntityFields({
        '@type': 'Organization',
        name: 'Example SAS',
        address: 'Rue A',
        contactPoint: [{ '@type': 'ContactPoint', telephone: '+33 1 00 00 00 00' }],
      }),
    ).toEqual([]);
  });

  it('names the fields missing from the most complete entity when none is complete', () => {
    const candidates = extractGeoCandidates(
      [
        page({
          jsonLdTypes: ['Organization', 'Hotel'],
          jsonLdEntities: [
            { parsed: { '@type': 'Organization', name: 'Example SAS' } },
            { parsed: { '@type': 'Hotel', name: 'Example', address: 'Rue A' } },
          ],
        }),
      ],
      HOMEPAGE_URL,
    );
    const incomplete = candidates.filter((c) => c.ruleId === ENTITY_DATA_INCOMPLETE_RULE_ID);
    expect(incomplete).toHaveLength(1);
    expect(incomplete[0]?.rawEvidenceForPage).toEqual({ missingFields: ['telephone'] });
  });

  it('does not fire for a non-entity JSON-LD block (e.g. a Product)', () => {
    const candidates = extractGeoCandidates(
      [
        page({
          jsonLdTypes: ['Product'],
          jsonLdEntities: [{ parsed: { '@type': 'Product', name: 'Widget' } }],
        }),
      ],
      HOMEPAGE_URL,
    );
    expect(candidates.filter((c) => c.ruleId === ENTITY_DATA_INCOMPLETE_RULE_ID)).toEqual([]);
  });
});

describe('faq-content-without-schema', () => {
  it('fires when a page has 3+ question-shaped headings and no FAQ/QA schema', () => {
    const candidates = extractGeoCandidates(
      [page({ questionHeadingCount: 3, hasFaqSchema: false })],
      HOMEPAGE_URL,
    );
    const faq = candidates.filter((c) => c.ruleId === FAQ_CONTENT_WITHOUT_SCHEMA_RULE_ID);
    expect(faq).toHaveLength(1);
    expect(faq[0]?.category).toBe('geo');
    expect(faq[0]?.severity).toBe('minor');
    expect(faq[0]?.rawEvidenceForPage).toEqual({ questionHeadingCount: 3 });
  });

  it('does not fire below the question-heading threshold', () => {
    const candidates = extractGeoCandidates(
      [page({ questionHeadingCount: 2, hasFaqSchema: false })],
      HOMEPAGE_URL,
    );
    expect(candidates.filter((c) => c.ruleId === FAQ_CONTENT_WITHOUT_SCHEMA_RULE_ID)).toEqual([]);
  });

  it('does not fire when a matching FAQ/QA schema is present', () => {
    const candidates = extractGeoCandidates(
      [page({ questionHeadingCount: 5, hasFaqSchema: true })],
      HOMEPAGE_URL,
    );
    expect(candidates.filter((c) => c.ruleId === FAQ_CONTENT_WITHOUT_SCHEMA_RULE_ID)).toEqual([]);
  });
});
