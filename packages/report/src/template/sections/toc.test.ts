import { describe, expect, it } from 'vitest';
import { renderToc } from './toc.js';
import { getStrings } from '../strings/i18n.js';

describe('renderToc, full tier', () => {
  it('numbers all 9 entries in order, starting at 1', () => {
    const html = renderToc(getStrings('fr'), 'full');

    for (let i = 1; i <= 9; i++) {
      expect(html).toContain(`<span class="n">${i}</span>`);
    }
  });

  it('renders in the requested language', () => {
    const htmlFr = renderToc(getStrings('fr'), 'full');
    const htmlEn = renderToc(getStrings('en'), 'full');

    expect(htmlFr).toContain('L&#39;audit en chiffres');
    expect(htmlEn).toContain('The audit in numbers');
    expect(htmlEn).not.toContain('audit en chiffres');
  });
});

describe('renderToc, screening tier', () => {
  it('numbers only the 5 screening entries, not the full 9', () => {
    const html = renderToc(getStrings('en'), 'screening');

    for (let i = 1; i <= 5; i++) {
      expect(html).toContain(`<span class="n">${i}</span>`);
    }
    expect(html).not.toContain('<span class="n">6</span>');
  });

  it('renders the screening-specific section list, not the full-tier one', () => {
    const html = renderToc(getStrings('en'), 'screening');

    expect(html).toContain('Key findings');
    expect(html).not.toContain('Appendix: full findings list');
  });
});
