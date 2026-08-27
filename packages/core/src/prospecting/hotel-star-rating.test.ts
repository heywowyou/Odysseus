import { describe, it, expect } from 'vitest';
import {
  parseAtoutFranceClassement,
  isCampaignEligibleRating,
  MINIMUM_CAMPAIGN_STAR_RATING,
} from './hotel-star-rating.js';

describe('parseAtoutFranceClassement', () => {
  it('reads the plural form the source uses for two stars and above', () => {
    expect(parseAtoutFranceClassement('3 étoiles')).toBe(3);
    expect(parseAtoutFranceClassement('4 étoiles')).toBe(4);
    expect(parseAtoutFranceClassement('5 étoiles')).toBe(5);
    expect(parseAtoutFranceClassement('2 étoiles')).toBe(2);
  });

  it('reads the singular form the source uses for one star', () => {
    expect(parseAtoutFranceClassement('1 étoile')).toBe(1);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseAtoutFranceClassement('  3 étoiles  ')).toBe(3);
  });

  it('returns null for the source own missing-value sentinel', () => {
    expect(parseAtoutFranceClassement('-')).toBeNull();
    expect(parseAtoutFranceClassement('')).toBeNull();
  });

  it('returns null rather than guessing when the contract drifts', () => {
    // A mojibake'd accent is the specific failure an encoding regression
    // produces, and it must park the row rather than rate it.
    expect(parseAtoutFranceClassement('3 Ã©toiles')).toBeNull();
    expect(parseAtoutFranceClassement('3 stars')).toBeNull();
    expect(parseAtoutFranceClassement('trois étoiles')).toBeNull();
    expect(parseAtoutFranceClassement('6 étoiles')).toBeNull();
    expect(parseAtoutFranceClassement('0 étoile')).toBeNull();
    expect(parseAtoutFranceClassement('Palace')).toBeNull();
  });
});

describe('isCampaignEligibleRating', () => {
  it('admits three stars and above', () => {
    expect(isCampaignEligibleRating(3)).toBe('eligible');
    expect(isCampaignEligibleRating(4)).toBe('eligible');
    expect(isCampaignEligibleRating(5)).toBe('eligible');
  });

  it('parks lower ratings as a settled campaign decision', () => {
    expect(isCampaignEligibleRating(1)).toBe('parked-below-three-stars');
    expect(isCampaignEligibleRating(2)).toBe('parked-below-three-stars');
  });

  it('parks an unreadable rating separately from a known-low one', () => {
    expect(isCampaignEligibleRating(null)).toBe('parked-unknown-rating');
    expect(isCampaignEligibleRating(undefined)).toBe('parked-unknown-rating');
  });

  it('never treats an unknown rating as eligible', () => {
    expect(isCampaignEligibleRating(null)).not.toBe('eligible');
  });

  it('keeps the documented threshold', () => {
    expect(MINIMUM_CAMPAIGN_STAR_RATING).toBe(3);
  });
});
