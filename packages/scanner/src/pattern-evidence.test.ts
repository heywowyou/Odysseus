import { describe, expect, it } from 'vitest';
import { FINDINGS_SCHEMA_VERSION, type Finding } from '@odysseus/core';
import { evidenceQualityFixtures } from './evidence-quality-fixtures.js';
import {
  createPatternEvidenceCollector,
  MIN_PATTERN_PAGE_COUNT,
  structuralSignatureOf,
  type PatternObservationRef,
} from './pattern-evidence.js';

function findingRef(ruleId: string): Finding {
  return {
    findingId: `finding-${ruleId}`,
    auditId: 'audit-test',
    schemaVersion: FINDINGS_SCHEMA_VERSION,
    source: 'axe',
    category: 'accessibility',
    severity: 'serious',
    wcagCriteria: [],
    title: '',
    description: '',
    pageUrls: [],
    occurrences: 0,
    elements: [],
    rawEvidence: {},
    dedupeKey: `dedupe-${ruleId}`,
    firstSeenAt: new Date('2026-09-18T09:00:00.000Z'),
    lastSeenAt: new Date('2026-09-18T09:00:00.000Z'),
    ruleId,
  };
}

function refsOf(
  pages: readonly string[],
  selector: string,
  prefix: string,
): PatternObservationRef[] {
  return pages.map((pageUrl, index) => ({
    observationId: `observation:${prefix}-${index}`,
    pageUrl,
    selector,
  }));
}

describe('structural signature (plan 059 step 27)', () => {
  it('keeps the stable element and class structure of a selector', () => {
    expect(structuralSignatureOf('img.card-visual')).toBe('img.card-visual');
    expect(structuralSignatureOf('main > div:nth-child(2) > img.hero')).toBe(
      'main > div > img.hero',
    );
    expect(structuralSignatureOf('ul > li:nth-of-type(3) > a.contact')).toBe('ul > li > a.contact');
  });

  it('strips everything volatile: ids, states, attributes, generated classes', () => {
    // State pseudo-classes vanish but the component stays.
    expect(structuralSignatureOf('button.submit:hover')).toBe('button.submit');
    // Attribute values and quotes make the whole selector unsafe.
    expect(structuralSignatureOf('a[href="/reserver"]')).toBeUndefined();
    expect(structuralSignatureOf("input[name='email']")).toBeUndefined();
    // An id-only compound refuses the signature instead of guessing.
    expect(structuralSignatureOf('#main > a')).toBeUndefined();
    // A generated class is stripped; the stable element names around it
    // remain. A class-only compound with nothing stable left refuses.
    expect(structuralSignatureOf('div.css-1q2w3e > button')).toBe('div > button');
    expect(structuralSignatureOf('.css-1q2w3e')).toBeUndefined();
    expect(structuralSignatureOf('div.col-6 > p.lead')).toBe('div > p.lead');
  });
});

describe('pattern evidence collector (plan 059 step 27, section 18 Classification/pattern)', () => {
  const shared = evidenceQualityFixtures.sharedComponentDefect;

  it('collapses a shared-component defect across many pages into one pattern', () => {
    const collector = createPatternEvidenceCollector();
    collector.note(findingRef(shared.ruleId), refsOf(shared.pages, shared.selector, 'shared'));

    const patterns = collector.build();
    expect(patterns).toHaveLength(1);
    const pattern = patterns[0]!;
    expect(pattern.ruleId).toBe(shared.ruleId);
    expect(pattern.structuralSignature).toBe('img.card-visual');
    expect(pattern.affectedPageIdentities).toEqual([...shared.pages].sort());
    expect(pattern.observationIds).toHaveLength(shared.pages.length);
    expect(pattern.category).toBe('accessibility');
    // Hundreds of pages stay one pattern, so three are medium, not high.
    expect(pattern.confidence).toBe('medium');
    expect(pattern.reasonCode).toBe('shared-structural-signature');
  });

  it('turns high-confidence only past the provisional breadth threshold', () => {
    const collector = createPatternEvidenceCollector();
    const many = [...shared.pages, 'https://site-exemple.fr/d', 'https://site-exemple.fr/e'];
    collector.note(findingRef(shared.ruleId), refsOf(many, shared.selector, 'many'));
    expect(collector.build()[0]?.confidence).toBe('high');
  });

  it('keeps similar selectors from different components as separate patterns', () => {
    const similar = evidenceQualityFixtures.similarSelectorsDifferentComponents;
    const collector = createPatternEvidenceCollector();
    collector.note(
      findingRef(similar.ruleId),
      refsOf(
        [similar.first.pageUrl, `${similar.first.pageUrl}-2`],
        similar.first.selector,
        'first',
      ),
    );
    collector.note(
      findingRef(similar.ruleId),
      refsOf(
        [similar.second.pageUrl, `${similar.second.pageUrl}-2`],
        similar.second.selector,
        'second',
      ),
    );

    const patterns = collector.build();
    expect(patterns).toHaveLength(2);
    expect(patterns.map((pattern) => pattern.structuralSignature).sort()).toEqual([
      '.card > .title > a',
      '.panel > .title > a',
    ]);
    const secondPages = new Set(patterns[1]?.affectedPageIdentities);
    expect(patterns[0]?.affectedPageIdentities.every((page) => !secondPages.has(page))).toBe(true);
  });

  it('never forms a pattern below the cross-page threshold, and never from unsafe selectors', () => {
    const onePage = createPatternEvidenceCollector();
    onePage.note(findingRef(shared.ruleId), refsOf([shared.pages[0]], shared.selector, 'single'));
    expect(onePage.build()).toEqual([]);
    expect(MIN_PATTERN_PAGE_COUNT).toBe(2);

    // A selector that reduces to nothing stable refuses the signature, so
    // even a rule repeated on many pages yields no pattern at all.
    const unsafe = createPatternEvidenceCollector();
    unsafe.note(findingRef(shared.ruleId), refsOf(shared.pages, '.css-1q2w3e', 'unsafe'));
    expect(unsafe.build()).toEqual([]);
  });

  it('never promotes heuristic signals: the collector is only fed confirmed findings', () => {
    // Guarded at the graph level; here the contract is that a noted finding
    // only ever yields evidence records, never finding mutations.
    const collector = createPatternEvidenceCollector();
    const finding = findingRef(shared.ruleId);
    collector.note(finding, refsOf(shared.pages, shared.selector, 'shared'));
    const patterns = collector.build();
    expect(patterns[0]?.authoritativeForFindingIdentity).toBe(false);
    expect(patterns[0]?.provesSourceCodeOwnership).toBe(false);
    // The finding passed in is not rewritten or merged.
    expect(finding.pageUrls).toEqual([]);
    expect(finding.occurrences).toBe(0);
  });
});
