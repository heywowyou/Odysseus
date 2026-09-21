import { describe, expect, it } from 'vitest';
import {
  applyStep,
  clampPage,
  displayTitle,
  fittedPageWidth,
  MIN_READABLE_PAGE_WIDTH,
  pageHash,
  parsePageHash,
  sectionEntries,
  sectionForPage,
  stepForKey,
  stepForSwipe,
} from './report-viewer-state';

describe('example report viewer paging', () => {
  it('keeps the page inside the document', () => {
    expect(clampPage(0, 30)).toBe(1);
    expect(clampPage(31, 30)).toBe(30);
    expect(clampPage(4.7, 30)).toBe(4);
    expect(clampPage(Number.NaN, 30)).toBe(1);
    expect(clampPage(3, 0)).toBe(1);
  });

  it('steps without leaving the document', () => {
    expect(applyStep(1, 'previous', 30)).toBe(1);
    expect(applyStep(30, 'next', 30)).toBe(30);
    expect(applyStep(12, 'next', 30)).toBe(13);
    expect(applyStep(12, 'first', 30)).toBe(1);
    expect(applyStep(12, 'last', 30)).toBe(30);
  });

  it('round-trips page deep links and ignores anything else', () => {
    expect(parsePageHash(pageHash(12))).toBe(12);
    expect(parsePageHash('#page-0')).toBeNull();
    expect(parsePageHash('#contenu')).toBeNull();
    expect(parsePageHash('')).toBeNull();
    expect(parsePageHash('#page-12abc')).toBeNull();
  });

  it('maps the paging keys and nothing else', () => {
    expect(stepForKey('ArrowRight')).toBe('next');
    expect(stepForKey('PageDown')).toBe('next');
    expect(stepForKey('ArrowLeft')).toBe('previous');
    expect(stepForKey('PageUp')).toBe('previous');
    expect(stepForKey('Home')).toBe('first');
    expect(stepForKey('End')).toBe('last');
    expect(stepForKey('ArrowDown')).toBeNull();
    expect(stepForKey(' ')).toBeNull();
  });

  it('turns a page only on a clear horizontal swipe', () => {
    expect(stepForSwipe(-80, 10)).toBe('next');
    expect(stepForSwipe(80, 10)).toBe('previous');
    expect(stepForSwipe(20, 0)).toBeNull();
    expect(stepForSwipe(-80, 70)).toBeNull();
  });
});

describe('example report page sizing', () => {
  it('fits the whole sheet under the controls when it stays readable', () => {
    expect(fittedPageWidth({ frameWidth: 1100, availableHeight: 1000 })).toBe(707);
  });

  it('keeps a readable minimum on short windows', () => {
    expect(fittedPageWidth({ frameWidth: 1100, availableHeight: 500 })).toBe(
      MIN_READABLE_PAGE_WIDTH,
    );
  });

  it('never overflows the frame on a phone', () => {
    expect(fittedPageWidth({ frameWidth: 343, availableHeight: 600 })).toBe(343);
  });
});

describe('example report section picker', () => {
  it('keeps one entry per page, in page order, with tidied titles', () => {
    expect(
      sectionEntries([
        { title: 'Synthèse', page: 3, depth: 0 },
        { title: '  Priorités\n  ', page: 5, depth: 0 },
        { title: 'Sous-partie', page: 5, depth: 1 },
        { title: '', page: 7, depth: 0 },
        { title: '03', page: 8, depth: 0 },
        { title: 'Couverture', page: 1, depth: 0 },
      ]),
    ).toEqual([
      { title: 'Couverture', page: 1, depth: 0 },
      { title: 'Synthèse', page: 3, depth: 0 },
      { title: 'Priorités', page: 5, depth: 0 },
    ]);
  });

  it('names the section a page belongs to', () => {
    const entries = sectionEntries([
      { title: 'Couverture', page: 1, depth: 0 },
      { title: 'Synthèse', page: 3, depth: 0 },
    ]);
    expect(sectionForPage(entries, 2)?.title).toBe('Couverture');
    expect(sectionForPage(entries, 9)?.title).toBe('Synthèse');
    expect(sectionForPage([], 4)).toBeNull();
  });
});

describe('example report section titles', () => {
  it('sets all-caps headings in sentence case', () => {
    expect(displayTitle('INFORMATIONS SUR LE DIAGNOSTIC')).toBe('Informations sur le diagnostic');
  });

  it('keeps mixed-case titles and single-word acronyms as they are', () => {
    expect(displayTitle('Conformité aux WCAG 2.2, niveau AA')).toBe(
      'Conformité aux WCAG 2.2, niveau AA',
    );
    expect(displayTitle('SEO')).toBe('SEO');
  });

  it('never shows an em or en dash', () => {
    expect(displayTitle('Annexe technique — constats détaillés')).toBe(
      'Annexe technique\u00a0: constats détaillés',
    );
    expect(displayTitle('Annexe technique – constats')).not.toMatch(/[\u2013\u2014]/u);
  });
});
