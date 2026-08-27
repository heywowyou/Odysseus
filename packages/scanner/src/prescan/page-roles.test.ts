import { describe, expect, it } from 'vitest';
import { PRESCAN_MAX_PAGES, selectPrescanPages } from './page-roles.js';
import type { AnchorLike } from '../checks/transactional-flow.js';

const HOME = 'https://hotel-example.fr/';

function anchors(...pairs: [string, string][]): AnchorLike[] {
  return pairs.map(([href, text]) => ({ href, text }));
}

describe('selectPrescanPages', () => {
  it('always selects the homepage first, normalized', () => {
    const selection = selectPrescanPages('https://hotel-example.fr/', []);
    expect(selection.selected[0]).toMatchObject({
      role: 'homepage',
      url: 'https://hotel-example.fr/',
      reason: 'start-url',
    });
  });

  it('selects a French booking page and a French rooms page', () => {
    const selection = selectPrescanPages(
      HOME,
      anchors(
        ['/reservation', 'Réserver'],
        ['/nos-chambres', 'Nos chambres'],
        ['/actualites', 'Actualités'],
        ['/contact', 'Contact'],
      ),
    );
    expect(selection.selected.map((page) => [page.role, page.url])).toEqual([
      ['homepage', 'https://hotel-example.fr/'],
      ['booking', 'https://hotel-example.fr/reservation'],
      ['content', 'https://hotel-example.fr/nos-chambres'],
    ]);
    expect(selection.absent).toEqual([]);
  });

  it('selects the English equivalents', () => {
    const selection = selectPrescanPages(
      HOME,
      anchors(['/en/book-now', 'Book now'], ['/en/rooms', 'Our Rooms'], ['/en/blog', 'Journal']),
    );
    expect(selection.selected.map((page) => page.role)).toEqual(['homepage', 'booking', 'content']);
  });

  it('matches on the URL path when the link text is an icon or image', () => {
    const selection = selectPrescanPages(HOME, anchors(['/chambres-et-suites', '']));
    const content = selection.selected.find((page) => page.role === 'content');
    expect(content).toMatchObject({ reason: 'link-path', matchedText: '' });
  });

  it('never selects an off-site booking link, and records it as evidence instead', () => {
    const selection = selectPrescanPages(
      HOME,
      anchors(
        ['https://www.booking.com/hotel/fr/example.html', 'Réserver sur Booking'],
        ['https://secure.reservit.com/example', 'Réservez maintenant'],
      ),
    );
    expect(selection.selected.map((page) => page.role)).toEqual(['homepage']);
    expect(selection.absent).toContainEqual({ role: 'booking', reason: 'offsite-only' });
    expect(selection.offsiteBookingLinks).toHaveLength(2);
  });

  it('records a genuine absence separately from an off-site-only one', () => {
    const selection = selectPrescanPages(HOME, anchors(['/contact', 'Contact']));
    expect(selection.absent).toEqual([
      { role: 'booking', reason: 'no-candidate-link' },
      { role: 'content', reason: 'no-candidate-link' },
    ]);
    expect(selection.offsiteBookingLinks).toEqual([]);
  });

  it('never loads one page twice when it matches both roles', () => {
    // "Réservez votre chambre" matches booking and content vocabularies.
    const selection = selectPrescanPages(
      HOME,
      anchors(['/reserver-chambre', 'Réservez votre chambre']),
    );
    expect(selection.selected.map((page) => page.url)).toEqual([
      'https://hotel-example.fr/',
      'https://hotel-example.fr/reserver-chambre',
    ]);
    expect(selection.selected[1]!.role).toBe('booking');
    expect(selection.absent).toContainEqual({
      role: 'content',
      reason: 'duplicate-of-selected-page',
    });
  });

  it('dedupes repeated links to the same page and picks a stable winner', () => {
    const repeated = anchors(
      ['/reservation/', 'Réserver'],
      ['/reservation', 'Réservation'],
      ['/reservation#form', 'Disponibilités'],
    );
    const first = selectPrescanPages(HOME, repeated);
    const reversed = selectPrescanPages(HOME, [...repeated].reverse());
    expect(first.selected[1]!.url).toBe('https://hotel-example.fr/reservation');
    expect(reversed.selected[1]!.url).toBe(first.selected[1]!.url);
  });

  it('breaks a tie between distinct candidates the same way on every run', () => {
    const many = anchors(
      ['/reserver-en-ligne', 'Réserver en ligne'],
      ['/booking', 'Booking'],
      ['/disponibilites', 'Disponibilités'],
    );
    const forward = selectPrescanPages(HOME, many);
    const backward = selectPrescanPages(HOME, [...many].reverse());
    expect(forward.selected[1]!.url).toBe(backward.selected[1]!.url);
    expect(forward.selected[1]!.url).toBe('https://hotel-example.fr/booking');
  });

  it('prefers the primary-language page over its translated subtree', () => {
    // A French hotel's own booking page, not the English translation of it:
    // the evidence this produces is shown to a French hotelier about the
    // site their French guests use.
    const selection = selectPrescanPages(
      HOME,
      anchors(
        ['/en/book.html', 'Book now'],
        ['/reservation.html', 'Réserver'],
        ['/en/rooms.html', 'Our rooms'],
        ['/nos-chambres.html', 'Nos chambres'],
      ),
    );
    expect(selection.selected.map((page) => new URL(page.url).pathname)).toEqual([
      '/',
      '/reservation.html',
      '/nos-chambres.html',
    ]);
  });

  it('treats the www and apex forms of the site as one site', () => {
    const selection = selectPrescanPages(
      'https://www.hotel-example.fr/',
      anchors(['https://hotel-example.fr/reservation', 'Réserver']),
    );
    expect(selection.selected[1]).toMatchObject({
      role: 'booking',
      url: 'https://hotel-example.fr/reservation',
    });
  });

  it('never returns more than the page budget, however many links match', () => {
    const flood = anchors(
      ...Array.from({ length: 40 }, (_, i): [string, string] => [`/reserver-${i}`, 'Réserver']),
      ...Array.from({ length: 40 }, (_, i): [string, string] => [`/chambre-${i}`, 'Chambres']),
    );
    const selection = selectPrescanPages(HOME, flood);
    expect(selection.selected).toHaveLength(PRESCAN_MAX_PAGES);
    expect(PRESCAN_MAX_PAGES).toBe(3);
  });

  it('ignores non-http schemes and unparsable hrefs', () => {
    const selection = selectPrescanPages(
      HOME,
      anchors(
        ['tel:+33123456789', 'Réserver par téléphone'],
        ['mailto:contact@hotel-example.fr', 'Réserver par mail'],
        ['javascript:void(0)', 'Réserver'],
      ),
    );
    expect(selection.selected.map((page) => page.role)).toEqual(['homepage']);
    expect(selection.offsiteBookingLinks).toEqual([]);
  });

  it('does not select a PDF brochure as the content page', () => {
    const selection = selectPrescanPages(HOME, anchors(['/nos-chambres.pdf', 'Nos chambres']));
    expect(selection.selected.map((page) => page.role)).toEqual(['homepage']);
  });
});
