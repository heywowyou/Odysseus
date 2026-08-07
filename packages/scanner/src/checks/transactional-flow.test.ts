import { describe, expect, it } from 'vitest';
import { classifyDestinationPage, detectOutboundBookingLinks, findBookingIntentLinks } from './transactional-flow.js';

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
    const anchors = [{ href: 'https://www.facebook.com/haaitza', text: 'Suivez-nous sur Facebook' }];
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
    expect(findBookingIntentLinks(pageUrl, anchors)).toEqual(['https://booking-engine.example/book']);
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
