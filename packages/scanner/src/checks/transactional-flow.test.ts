import { describe, expect, it } from 'vitest';
import { detectOutboundBookingLinks } from './transactional-flow.js';

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
