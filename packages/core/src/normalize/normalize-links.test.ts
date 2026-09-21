import { describe, expect, it } from 'vitest';
import {
  CRAWLABLE_ANCHORS_RULE_ID,
  LINK_TEXT_RULE_ID,
  extractLinkCandidates,
  hasNonDescriptiveLinkText,
  isUncrawlableAnchor,
  type AnchorFactInput,
} from './normalize-links.js';

const PAGE_URL = 'https://hotel.example/chambres';

function anchor(overrides: Partial<AnchorFactInput> = {}): AnchorFactInput {
  return {
    selector: '#link',
    snippet: '<a id="link" href="/suite">',
    rawHref: '/suite',
    href: 'https://hotel.example/suite',
    text: 'Suite junior vue mer',
    rel: '',
    role: '',
    name: '',
    id: 'link',
    textLang: null,
    pointsToSamePage: false,
    hasHrefAssociatedAttribute: false,
    hasEventListener: false,
    ...overrides,
  };
}

describe('hasNonDescriptiveLinkText', () => {
  it('flags generic text regardless of case and surrounding space', () => {
    expect(hasNonDescriptiveLinkText(anchor({ text: '  READ MORE ' }))).toBe(true);
  });

  it('does not flag descriptive text', () => {
    expect(hasNonDescriptiveLinkText(anchor())).toBe(false);
  });

  it('checks only the list of the language the link declares', () => {
    expect(hasNonDescriptiveLinkText(anchor({ text: 'Read more', textLang: 'en-GB' }))).toBe(true);
    expect(hasNonDescriptiveLinkText(anchor({ text: 'Más', textLang: 'en' }))).toBe(false);
  });

  // Lighthouse ships no French list, so a French page is never flagged.
  // Kept that way on purpose: trade-off 110 moves the rule, it does not
  // widen it.
  it('never flags a language without a list', () => {
    expect(hasNonDescriptiveLinkText(anchor({ text: 'read more', textLang: 'fr' }))).toBe(false);
  });

  it('ignores nofollow, javascript, mailto and same-page links', () => {
    expect(hasNonDescriptiveLinkText(anchor({ text: 'here', rel: 'nofollow' }))).toBe(false);
    expect(hasNonDescriptiveLinkText(anchor({ text: 'here', href: 'javascript:void(0)' }))).toBe(
      false,
    );
    expect(hasNonDescriptiveLinkText(anchor({ text: 'here', href: 'mailto:a@b.fr' }))).toBe(false);
    expect(hasNonDescriptiveLinkText(anchor({ text: 'here', pointsToSamePage: true }))).toBe(false);
  });

  it('ignores a link without a destination', () => {
    expect(hasNonDescriptiveLinkText(anchor({ text: 'here', href: '' }))).toBe(false);
  });
});

describe('isUncrawlableAnchor', () => {
  it('passes an ordinary link', () => {
    expect(isUncrawlableAnchor(anchor(), PAGE_URL)).toBe(false);
  });

  it('fails a javascript:void(0) link, with or without spaces', () => {
    expect(isUncrawlableAnchor(anchor({ rawHref: 'javascript:void(0)' }), PAGE_URL)).toBe(true);
    expect(isUncrawlableAnchor(anchor({ rawHref: 'javascript: void 0' }), PAGE_URL)).toBe(true);
  });

  it('fails a file: link', () => {
    expect(isUncrawlableAnchor(anchor({ rawHref: 'file:///c:/plan.pdf' }), PAGE_URL)).toBe(true);
  });

  it('fails an href-less link only when script listens on it', () => {
    const placeholder = anchor({ rawHref: null, href: '', id: '' });
    expect(isUncrawlableAnchor(placeholder, PAGE_URL)).toBe(false);
    expect(isUncrawlableAnchor({ ...placeholder, hasEventListener: true }, PAGE_URL)).toBe(true);
  });

  it('fails an href-less link carrying an href-only attribute', () => {
    expect(
      isUncrawlableAnchor(
        anchor({ rawHref: null, href: '', id: '', hasHrefAssociatedAttribute: true }),
        PAGE_URL,
      ),
    ).toBe(true);
  });

  it('passes jump targets, named anchors, links with a role, and mailto', () => {
    expect(isUncrawlableAnchor(anchor({ rawHref: null, href: '', id: 'top' }), PAGE_URL)).toBe(
      false,
    );
    expect(
      isUncrawlableAnchor(anchor({ rawHref: 'javascript:void(0)', name: 'x' }), PAGE_URL),
    ).toBe(false);
    expect(
      isUncrawlableAnchor(anchor({ rawHref: 'javascript:void(0)', role: 'button' }), PAGE_URL),
    ).toBe(false);
    expect(isUncrawlableAnchor(anchor({ rawHref: 'mailto:javascript:void(0)' }), PAGE_URL)).toBe(
      false,
    );
  });

  it('fails an href that is not a valid address', () => {
    expect(isUncrawlableAnchor(anchor({ rawHref: 'http://' }), PAGE_URL)).toBe(true);
  });
});

describe('extractLinkCandidates', () => {
  it('reports generic links once per page and each uncrawlable link on its own', () => {
    const candidates = extractLinkCandidates(
      [
        anchor({ text: 'read more', selector: 'a:nth-child(1)' }),
        anchor({ text: 'here', selector: 'a:nth-child(2)' }),
        anchor({ rawHref: 'javascript:void(0)', selector: 'a:nth-child(3)' }),
        anchor({ rawHref: 'javascript:void(0)', selector: 'a:nth-child(4)' }),
      ],
      PAGE_URL,
    );
    const linkText = candidates.filter((candidate) => candidate.ruleId === LINK_TEXT_RULE_ID);
    const uncrawlable = candidates.filter(
      (candidate) => candidate.ruleId === CRAWLABLE_ANCHORS_RULE_ID,
    );
    expect(linkText).toHaveLength(1);
    expect(linkText[0]?.element).toBeNull();
    expect(linkText[0]?.rawEvidenceForPage.totalItems).toBe(2);
    expect(uncrawlable.map((candidate) => candidate.element?.selector)).toEqual([
      'a:nth-child(3)',
      'a:nth-child(4)',
    ]);
    expect(candidates.every((candidate) => candidate.source === 'custom')).toBe(true);
    expect(candidates.every((candidate) => candidate.severity === 'moderate')).toBe(true);
  });

  it('emits nothing for clean links', () => {
    expect(extractLinkCandidates([anchor()], PAGE_URL)).toEqual([]);
  });
});
