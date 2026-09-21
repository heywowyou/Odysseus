import { describe, expect, it } from 'vitest';
import nextConfig from './next.config';

const SOURCE = '/((?!apercu|exemple-audit\\.pdf|exemple-audit/r/).*)';
// Next's source pattern is path-to-regexp syntax; mirror its
// negative-lookahead semantics with a plain RegExp to confirm intent
// without depending on path-to-regexp directly (an internal Next
// dependency, not one of this package's own).
const covered = (path: string): boolean =>
  /^\/(?!apercu|exemple-audit\.pdf|exemple-audit\/r\/)/u.test(path);

describe('next.config headers (issue #213 item 3)', () => {
  it('applies the marketing security headers to public routes', async () => {
    const headerConfig = await nextConfig.headers?.();
    expect(headerConfig).toBeDefined();
    const entry = headerConfig?.find((rule) => rule.source === SOURCE);
    expect(entry).toBeDefined();
    const byKey = Object.fromEntries(entry!.headers.map((h) => [h.key, h.value]));

    expect(byKey['Content-Security-Policy']).toContain("default-src 'self'");
    expect(byKey['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(byKey['X-Frame-Options']).toBe('SAMEORIGIN');
    expect(byKey['Permissions-Policy']).toContain('camera=()');
    expect(byKey['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(byKey['X-Content-Type-Options']).toBe('nosniff');
  });

  it('excludes the token-gated preview and the raw reference responses, not the reader page', async () => {
    const headerConfig = await nextConfig.headers?.();
    expect(headerConfig?.find((rule) => rule.source === SOURCE)).toBeDefined();
    expect(covered('/apercu/some-token')).toBe(false);
    expect(covered('/exemple-audit.pdf')).toBe(false);
    expect(covered('/exemple-audit/r/some-token')).toBe(false);
    expect(covered('/exemple-audit')).toBe(true);
    expect(covered('/')).toBe(true);
    expect(covered('/bot')).toBe(true);
  });

  it('never allows framing (frame-ancestors none, X-Frame-Options SAMEORIGIN, never ALLOWALL)', async () => {
    const headerConfig = await nextConfig.headers?.();
    const entry = headerConfig?.find((rule) => rule.source === SOURCE);
    const byKey = Object.fromEntries(entry!.headers.map((h) => [h.key, h.value]));
    expect(byKey['X-Frame-Options']).not.toBe('ALLOWALL');
    expect(byKey['Content-Security-Policy']).toMatch(/frame-ancestors 'none'/);
  });
});
