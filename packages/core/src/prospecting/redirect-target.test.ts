import { describe, expect, it } from 'vitest';
import { classifyRedirectTarget } from './redirect-target.js';
import { HOTEL_VENDOR_HOSTS } from './hotel-vendor-hosts.js';

describe('classifyRedirectTarget', () => {
  it('calls a target held by exactly one establishment that hotel’s own', () => {
    // The measured case: lacoorniche-pyla.com -> lacoorniche.com, one hotel
    // that renamed itself, which v1 rejected as if it were a chain.
    expect(classifyRedirectTarget({ target: 'lacoorniche.com', establishmentsAtTarget: 1 })).toBe(
      'own-moved-domain',
    );
  });

  it('calls a target two establishments reach a shared one', () => {
    // Two is already chain evidence. The rule does not wait for a large group:
    // one hotel is a rename, and anything above that is not.
    expect(
      classifyRedirectTarget({ target: 'lamaisonyounan.com', establishmentsAtTarget: 2 }),
    ).toBe('shared-target');
  });

  it('calls a large group shared, whatever its size', () => {
    expect(classifyRedirectTarget({ target: 'accor.com', establishmentsAtTarget: 4 })).toBe(
      'shared-target',
    );
    expect(
      classifyRedirectTarget({ target: 'esprit-de-france.com', establishmentsAtTarget: 8 }),
    ).toBe('shared-target');
  });

  it('lets the curated vendor list outrank a count of one', () => {
    // A vendor host reached by a single hotel is still a vendor host, and
    // adopting it would point the campaign at somebody else's platform. The
    // list decides, not the group size - trade-off 33's rule, unchanged.
    const vendor = HOTEL_VENDOR_HOSTS[0];
    expect(
      classifyRedirectTarget({
        target: vendor!.domain,
        establishmentsAtTarget: 1,
      }),
    ).toBe('vendor-or-federation');
  });

  it('lets the vendor list outrank a count above one too', () => {
    const vendor = HOTEL_VENDOR_HOSTS[0];
    expect(
      classifyRedirectTarget({
        target: vendor!.domain,
        establishmentsAtTarget: 6,
      }),
    ).toBe('vendor-or-federation');
  });

  it('treats zero as one, since the row being classified is itself an establishment', () => {
    // Defensive: a caller that forgot to count the row it is classifying must
    // not get a verdict stronger than the evidence. Zero and one both mean
    // "nothing shared", never "shared".
    expect(classifyRedirectTarget({ target: 'exemple-hotel.fr', establishmentsAtTarget: 0 })).toBe(
      'own-moved-domain',
    );
  });
});
