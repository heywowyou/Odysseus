import { describe, expect, it } from 'vitest';
import {
  anchorClassHintsAtBooking,
  classifyDestinationPage,
  detectOutboundBookingLinks,
  findBookingEngineDomainReferences,
  findBookingIframes,
  findBookingIntentLinks,
  findUnresolvedBookingControls,
} from './transactional-flow.js';

// item 0.1 (La Corniche pass): confirmed live against lacoorniche.com. The
// "Réserver" button is `href="javascript:void(0)"` at load time - the real
// booking destination only appears inside the widget's own inline JSON
// config, and the restaurant-reservation widget is a genuine third-party
// iframe. See transactional-flow.ts's module doc comment for the full
// story; this fixture uses the exact domains observed.
describe('findBookingEngineDomainReferences', () => {
  it('finds a delegated booking engine domain referenced only inside an inline script', () => {
    const inlineScript = `{"book":{"content":"<a href='https://www.secure-hotel-booking.com/d-edge/hotel-la-coorniche/2YQG/17908/fr/'>Réserver</a>"}}`;
    expect(findBookingEngineDomainReferences([inlineScript])).toEqual(['secure-hotel-booking.com']);
  });

  it('finds nothing when no known booking engine domain is referenced', () => {
    expect(
      findBookingEngineDomainReferences(['window.dataLayer = window.dataLayer || [];']),
    ).toEqual([]);
  });

  it('deduplicates repeated domain matches across multiple scripts', () => {
    const scripts = [
      'href: "https://www.secure-hotel-booking.com/a"',
      'href: "https://www.secure-hotel-booking.com/b"',
    ];
    expect(findBookingEngineDomainReferences(scripts)).toEqual(['secure-hotel-booking.com']);
  });
});

describe('findBookingIframes', () => {
  it('matches a restaurant-reservation widget embedded as a third-party iframe', () => {
    const srcs = ['https://widget.thefork.com/4c1aa87c-f07e-43b7-9710-77b72a83b66a', 'about:blank'];
    expect(findBookingIframes(srcs)).toEqual([
      {
        src: 'https://widget.thefork.com/4c1aa87c-f07e-43b7-9710-77b72a83b66a',
        domain: 'widget.thefork.com',
      },
    ]);
  });

  it('does not match an unrelated iframe (a photo gallery widget, a webcam)', () => {
    const srcs = [
      '//lightwidget.com/widgets/d1dcbeed497d51d1811c53264925a96d.html',
      'https://g0.ipcamlive.com/player/player.php',
    ];
    expect(findBookingIframes(srcs)).toEqual([]);
  });
});

describe('detectOutboundBookingLinks', () => {
  it('matches a known third-party booking platform', () => {
    expect(detectOutboundBookingLinks(['https://www.booking.com/hotel/fr/example.html'])).toEqual([
      'https://www.booking.com/hotel/fr/example.html',
    ]);
  });

  it('does not match a first-party link', () => {
    expect(detectOutboundBookingLinks(['https://example.com/reserver'])).toEqual([]);
  });

  it('ignores malformed URLs rather than throwing', () => {
    expect(detectOutboundBookingLinks(['not a url'])).toEqual([]);
  });
});

describe('findBookingIntentLinks', () => {
  const pageUrl = 'https://haaitza.com/chambres';

  it('picks up an external link whose text hints at a reservation flow', () => {
    const anchors = [
      {
        href: 'https://www.secure-hotel-booking.com/availability?hotel=1234',
        text: 'Réserver',
      },
      { href: '/mentions-legales', text: 'Mentions légales' },
    ];
    expect(findBookingIntentLinks(pageUrl, anchors)).toEqual([
      'https://www.secure-hotel-booking.com/availability?hotel=1234',
    ]);
  });

  it('ignores a first-party link even when the text hints at booking', () => {
    const anchors = [{ href: 'https://haaitza.com/reserver', text: 'Réserver' }];
    expect(findBookingIntentLinks(pageUrl, anchors)).toEqual([]);
  });

  it('does not match "book" inside "Facebook" (real haaitza.com OOM crash, 2026-08-07: matched a Facebook social icon on every crawled page and repeatedly navigated a real browser context to facebook.com until the process ran out of heap)', () => {
    const anchors = [
      { href: 'https://www.facebook.com/haaitza', text: 'Suivez-nous sur Facebook' },
    ];
    expect(findBookingIntentLinks(pageUrl, anchors)).toEqual([]);
  });

  it('never follows a known social/media platform host even if the link text does match booking-intent wording', () => {
    const anchors = [
      { href: 'https://www.facebook.com/haaitza', text: 'Réserver maintenant' },
      { href: 'https://www.instagram.com/haaitza', text: 'Book a table' },
      { href: 'https://www.linkedin.com/company/haaitza', text: 'Réservation' },
    ];
    expect(findBookingIntentLinks(pageUrl, anchors)).toEqual([]);
  });

  it('ignores an external link with no booking-intent text', () => {
    const anchors = [{ href: 'https://www.instagram.com/haaitza', text: 'Suivez-nous' }];
    expect(findBookingIntentLinks(pageUrl, anchors)).toEqual([]);
  });

  it('deduplicates repeated hrefs and ignores malformed ones', () => {
    const anchors = [
      { href: 'https://booking-engine.example/book', text: 'Book now' },
      { href: 'https://booking-engine.example/book', text: 'Book now' },
      { href: 'not a url', text: 'Book now' },
    ];
    expect(findBookingIntentLinks(pageUrl, anchors)).toEqual([
      'https://booking-engine.example/book',
    ]);
  });
});

describe('classifyDestinationPage', () => {
  it('resolves single-property when the destination shares a distinctive term and shows no multi-property picker', () => {
    const originName = 'Hotel La Coorniche - Hébergement à Bayonne';
    const destinationTitle = 'Hotel La Coorniche | Réserver votre séjour';
    const destinationBody = '4 Avenue de la Coorniche, 64600 Anglet. Vos dates ont été conservées.';

    const result = classifyDestinationPage(originName, destinationTitle, destinationBody);

    expect(result.resolution).toBe('single-property');
  });

  it('resolves marketplace when the destination shows a multi-property or destination search UI', () => {
    const originName = 'Hotel La Coorniche - Hébergement à Bayonne';
    const destinationTitle = 'Find your next stay';
    const destinationBody = 'Choose your destination and compare thousands of hotels worldwide.';

    const result = classifyDestinationPage(originName, destinationTitle, destinationBody);

    expect(result.resolution).toBe('marketplace');
  });

  it('resolves undetermined when neither signal is present', () => {
    const originName = 'Hotel La Coorniche - Hébergement à Bayonne';
    const destinationTitle = 'Secure Payment Gateway';
    const destinationBody = 'Please wait while we process your request.';

    const result = classifyDestinationPage(originName, destinationTitle, destinationBody);

    expect(result.resolution).toBe('undetermined');
  });

  it('does not let a generic shared hospitality word alone produce a single-property match', () => {
    const originName = 'Hotel La Coorniche';
    const destinationTitle = 'Compare Hotel Booking Sites';
    const destinationBody = 'Search and book your hotel reservation with the best price guarantee.';

    const result = classifyDestinationPage(originName, destinationTitle, destinationBody);

    expect(result.resolution).not.toBe('single-property');
  });
});

// Issue #42 (Villas Foch): a five-star Bordeaux hotel whose booking
// controls are `<a class="item__booking-link distributor">` with no href
// attribute at all - Lighthouse flagged them as crawlable-anchors
// findings, while every href-based signal in this file saw nothing and
// siteSignals resolved to a clean false, silently flipping the legal
// obligation status. These tests use that exact markup.
describe('findUnresolvedBookingControls', () => {
  const pageUrl = 'https://www.villasfoch.fr/fr/chambres-et-suites';

  it('records a booking control with no href attribute at all, matched via its class', () => {
    const anchors = [
      {
        selector: 'a.item__booking-link',
        text: '',
        ariaLabel: '',
        className: 'item__booking-link distributor',
      },
    ];
    expect(findUnresolvedBookingControls(pageUrl, anchors)).toEqual([
      {
        selector: 'a.item__booking-link',
        pageUrl,
        matchedVia: ['class'],
        detail:
          'Booking-intent control matched via class; no crawlable destination (no href attribute).',
      },
    ]);
  });

  it('records a javascript: booking button matched via its text', () => {
    const anchors = [
      {
        selector: 'a.btn-reserver',
        href: 'javascript:void(0)',
        text: 'Réserver',
        ariaLabel: '',
        className: 'btn-reserver',
      },
    ];
    const result = findUnresolvedBookingControls(pageUrl, anchors);
    expect(result).toHaveLength(1);
    expect(result[0]?.href).toBe('javascript:void(0)');
    expect(result[0]?.matchedVia).toEqual(['text', 'class']);
  });

  it('records a bare-fragment booking control', () => {
    const anchors = [
      {
        selector: 'a.booking',
        href: '#',
        text: 'Book now',
        ariaLabel: '',
        className: 'booking',
      },
    ];
    expect(findUnresolvedBookingControls(pageUrl, anchors)).toHaveLength(1);
  });

  it('never records a tel: or mailto: booking link: its destination is determinable and offline', () => {
    const anchors = [
      {
        selector: 'a',
        href: 'tel:+33556000000',
        text: 'Réserver par téléphone',
        ariaLabel: '',
        className: '',
      },
      {
        selector: 'a',
        href: 'mailto:stay@example.com',
        text: 'Book by email',
        ariaLabel: '',
        className: '',
      },
    ];
    expect(findUnresolvedBookingControls(pageUrl, anchors)).toEqual([]);
  });

  it('never records an anchor with a crawlable href: external ones are the redirect check input, same-origin ones lead to a scanned page', () => {
    const anchors = [
      {
        selector: 'a.engine',
        href: 'https://booking-engine.example/availability?hotel=1234',
        text: 'Réserver',
        ariaLabel: '',
        className: 'engine',
      },
      {
        selector: 'a.page',
        href: '/fr/contact',
        text: 'Réserver',
        ariaLabel: '',
        className: 'page',
      },
    ];
    expect(findUnresolvedBookingControls(pageUrl, anchors)).toEqual([]);
  });

  it('never matches "facebook" - the class vocabulary uses token equality on booking/reserv, not a bare "book" substring', () => {
    const anchors = [
      {
        selector: 'a.facebook-link',
        text: '',
        ariaLabel: '',
        className: 'facebook-link',
      },
    ];
    expect(findUnresolvedBookingControls(pageUrl, anchors)).toEqual([]);
  });

  it('records nothing when the anchor carries no booking vocabulary', () => {
    const anchors = [{ selector: 'a.nav', text: 'Contact', ariaLabel: '', className: 'nav' }];
    expect(findUnresolvedBookingControls(pageUrl, anchors)).toEqual([]);
  });

  it('matches booking vocabulary carried only in the aria-label', () => {
    const anchors = [
      {
        selector: 'a.icon',
        href: 'javascript:void(0)',
        text: '',
        ariaLabel: 'Book your stay',
        className: 'icon',
      },
    ];
    expect(findUnresolvedBookingControls(pageUrl, anchors)[0]?.matchedVia).toEqual(['aria-label']);
  });

  it('collapses repeated copies of the same control on one page into one entry', () => {
    const anchors = [
      {
        selector: 'a.item__booking-link',
        text: '',
        ariaLabel: '',
        className: 'item__booking-link',
      },
      {
        selector: 'a.item__booking-link',
        text: '',
        ariaLabel: '',
        className: 'item__booking-link',
      },
    ];
    expect(findUnresolvedBookingControls(pageUrl, anchors)).toHaveLength(1);
  });
});

describe('anchorClassHintsAtBooking', () => {
  it('matches separator-delimited and camelCase booking tokens', () => {
    expect(anchorClassHintsAtBooking('item__booking-link')).toBe(true);
    expect(anchorClassHintsAtBooking('bookingLink')).toBe(true);
    expect(anchorClassHintsAtBooking('reservation-btn')).toBe(true);
    expect(anchorClassHintsAtBooking('widget__reservations')).toBe(true);
  });

  it('does not match "book" inside unrelated tokens', () => {
    expect(anchorClassHintsAtBooking('facebook-link')).toBe(false);
    expect(anchorClassHintsAtBooking('notebook-widget')).toBe(false);
    expect(anchorClassHintsAtBooking('content__links')).toBe(false);
  });
});
