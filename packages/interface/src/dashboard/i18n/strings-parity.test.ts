import { describe, expect, it } from 'vitest';
import { en } from './en';
import { fr } from './fr';
import { DEFAULT_DASHBOARD_LANGUAGE, resolveStoredLanguage } from './provider';

function keyPaths(value: unknown, prefix: string[] = []): string[] {
  if (typeof value !== 'object' || value === null) {
    return [prefix.join('.')];
  }
  return Object.entries(value).flatMap(([key, child]) => keyPaths(child, [...prefix, key]));
}

describe('dashboard strings', () => {
  it('fr and en cover exactly the same keys', () => {
    expect(new Set(keyPaths(fr))).toEqual(new Set(keyPaths(en)));
  });

  it('every leaf has non-empty copy in both languages', () => {
    const leaves = keyPaths(fr).filter((path) => path.length > 0);
    expect(leaves.length).toBeGreaterThan(0);
    const readPath = (root: object, path: string): unknown => {
      let node: unknown = root;
      for (const key of path.split('.')) {
        if (typeof node !== 'object' || node === null) return undefined;
        node = (node as Record<string, unknown>)[key];
      }
      return node;
    };
    for (const path of leaves) {
      expect(readPath(fr, path), `fr:${path}`).toBeTruthy();
      expect(readPath(en, path), `en:${path}`).toBeTruthy();
    }
  });
});

describe('resolveStoredLanguage', () => {
  it('defaults to French', () => {
    expect(resolveStoredLanguage(null)).toBe(DEFAULT_DASHBOARD_LANGUAGE);
    expect(resolveStoredLanguage({ getItem: () => null, setItem: () => {} })).toBe('fr');
  });

  it('accepts a stored known language', () => {
    expect(resolveStoredLanguage({ getItem: () => 'en', setItem: () => {} })).toBe('en');
  });

  it('falls back on an unknown stored value', () => {
    expect(resolveStoredLanguage({ getItem: () => 'de', setItem: () => {} })).toBe('fr');
  });
});
