/**
 * 2026-08-25. The image-src capture added to FindingElement.
 *
 * The rule this guards is narrow on purpose: name the file only when the
 * captured element genuinely is that file. Every "does not extract" case
 * below is a case where naming something would have been a guess.
 */
import { describe, it, expect } from 'vitest';
import { resourceUrlFromSnippet, extractAxeCandidates } from './normalize-axe.js';

const PAGE = 'https://example.com/chambres/suite/';

describe('resourceUrlFromSnippet', () => {
  it('resolves a relative src against the page it was found on', () => {
    expect(resourceUrlFromSnippet('<img src="../img/salon.jpg" alt="">', PAGE)).toBe(
      'https://example.com/chambres/img/salon.jpg',
    );
  });

  it('keeps an absolute src unchanged', () => {
    expect(resourceUrlFromSnippet('<img src="https://cdn.example.net/a.webp">', PAGE)).toBe(
      'https://cdn.example.net/a.webp',
    );
  });

  it('reads a single-quoted src', () => {
    expect(resourceUrlFromSnippet("<img src='/a.png'>", PAGE)).toBe('https://example.com/a.png');
  });

  it('reads a <source> element as well as an <img>', () => {
    expect(resourceUrlFromSnippet('<source src="/v.webm" type="video/webm">', PAGE)).toBe(
      'https://example.com/v.webm',
    );
  });

  it('does not extract from an element that merely contains an image', () => {
    // The link is the defect; the picture inside it is not the file to fix.
    expect(
      resourceUrlFromSnippet('<a href="/galerie"><img src="/g.jpg" alt=""></a>', PAGE),
    ).toBeUndefined();
  });

  it('does not extract a data URI, which is not a file anyone can open', () => {
    expect(
      resourceUrlFromSnippet('<img src="data:image/gif;base64,R0lGOD">', PAGE),
    ).toBeUndefined();
  });

  it('does not extract from an img with no src at all', () => {
    expect(resourceUrlFromSnippet('<img alt="" srcset="/a.jpg 1x">', PAGE)).toBeUndefined();
  });

  it('returns undefined rather than a partial value for an unparseable src', () => {
    expect(resourceUrlFromSnippet('<img src="http://[bad">', PAGE)).toBeUndefined();
  });
});

describe('extractAxeCandidates', () => {
  function axe(html: string) {
    return {
      violations: [
        {
          id: 'image-alt',
          impact: 'critical',
          tags: ['wcag2a', 'wcag111'],
          help: 'Images must have alternate text',
          description: 'Ensures <img> elements have alternate text',
          nodes: [{ html, target: ['img:nth-of-type(32)'], impact: 'critical' }],
        },
      ],
    };
  }

  it('carries the file onto the element, alongside the selector rather than instead of it', () => {
    const [candidate] = extractAxeCandidates(axe('<img src="/uploads/piscine.jpg">'), PAGE);
    expect(candidate?.element?.selector).toBe('img:nth-of-type(32)');
    expect(candidate?.element?.resourceUrl).toBe('https://example.com/uploads/piscine.jpg');
  });

  it('omits the field entirely when there is no file, rather than setting an empty string', () => {
    const [candidate] = extractAxeCandidates(axe('<div role="img" aria-label="x"></div>'), PAGE);
    expect(candidate?.element).not.toHaveProperty('resourceUrl');
  });
});
