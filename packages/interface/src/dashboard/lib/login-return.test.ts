import { describe, expect, it } from 'vitest';
import { loginUrlReturningTo, safeReturnPath } from './login-return';

describe('safeReturnPath', () => {
  it('keeps an in-app deep link', () => {
    expect(safeReturnPath('/prospects/p-1?tab=emails#emails')).toBe(
      '/prospects/p-1?tab=emails#emails',
    );
  });

  it('refuses other origins, the login page and missing values', () => {
    for (const raw of [
      null,
      '',
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      '/login',
      '/login?next=/x',
      'javascript:alert(1)',
    ]) {
      expect(safeReturnPath(raw), String(raw)).toBe('/');
    }
  });
});

describe('loginUrlReturningTo', () => {
  it('carries the requested page, and nothing for the home page', () => {
    expect(loginUrlReturningTo('/prospects/p-1')).toBe('/login?next=%2Fprospects%2Fp-1');
    expect(loginUrlReturningTo('/')).toBe('/login');
  });
});
