import { describe, expect, it } from 'vitest';
import { checkAccessibilityStatement, findAccessibilityStatementUrl } from './accessibility-statement.js';

describe('findAccessibilityStatementUrl', () => {
  it.each([
    'https://x.fr/declaration-daccessibilite',
    'https://x.fr/declaration-d-accessibilite/',
    'https://x.fr/declaration-accessibilite',
    'https://x.fr/accessibility-statement',
    'https://x.fr/politique-daccessibilite',
    'https://x.fr/accessibilite',
    'https://x.fr/en/accessibility/',
  ])('finds %s', (url) => {
    expect(findAccessibilityStatementUrl(['https://x.fr/', url])).toBe(url);
  });

  // The exact failure this pattern is narrowed to avoid: a hotel site,
  // which is what this product audits, describing its accessible rooms.
  it.each([
    'https://x.fr/chambres-accessibles',
    'https://x.fr/nos-chambres-accessibles-pmr',
    'https://x.fr/en/accessible-rooms',
    'https://x.fr/mentions-legales',
    'https://x.fr/cookies',
  ])('does not match %s', (url) => {
    expect(findAccessibilityStatementUrl(['https://x.fr/', url])).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(findAccessibilityStatementUrl(['https://x.fr/', 'https://x.fr/contact'])).toBeNull();
  });

  it('records how many pages were searched, so "not found" can state its own scope', () => {
    expect(checkAccessibilityStatement(['https://x.fr/', 'https://x.fr/contact']).pagesSearched).toBe(2);
  });
});
