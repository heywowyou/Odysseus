import { describe, expect, it } from 'vitest';
import { renderToc } from './toc.js';
import { getStrings } from '../strings/i18n.js';

describe('renderToc', () => {
  it('numbers all 14 entries in order, starting at 1', () => {
    const html = renderToc(getStrings('fr'));

    for (let i = 1; i <= 14; i++) {
      expect(html).toContain(`class="n" style="font-size:12px;color:var(--color-accent-300);width:22px;flex:none">${i}</span>`);
    }
  });

  it('renders in the requested language', () => {
    const htmlFr = renderToc(getStrings('fr'));
    const htmlEn = renderToc(getStrings('en'));

    expect(htmlFr).toContain('Exposition légale');
    expect(htmlEn).toContain('Legal exposure');
    expect(htmlEn).not.toContain('Exposition légale');
  });

  it('B8: links each of the 14 rows to a distinct section-NN id, with a page-number span for target-counter', () => {
    const html = renderToc(getStrings('fr'));

    for (let i = 1; i <= 14; i++) {
      const id = `section-${String(i).padStart(2, '0')}`;
      expect(html).toContain(`href="#${id}"`);
    }
    expect((html.match(/class="toc-page"/g) ?? []).length).toBe(14);
  });

  it('B8: drops the old "page numbers are in the footer" footnote', () => {
    const html = renderToc(getStrings('fr'));
    expect(html).not.toContain('signets du fichier PDF');
  });
});
