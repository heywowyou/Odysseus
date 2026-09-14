import { describe, expect, it } from 'vitest';
import nextConfig from './next.config';

describe('next.config headers (issue #213 item 3)', () => {
  it('applies the marketing security headers to public routes', async () => {
    const headerConfig = await nextConfig.headers?.();
    expect(headerConfig).toBeDefined();
    const entry = headerConfig?.find((rule) => rule.source === '/((?!apercu).*)');
    expect(entry).toBeDefined();
    const byKey = Object.fromEntries(entry!.headers.map((h) => [h.key, h.value]));

    expect(byKey['Content-Security-Policy']).toContain("default-src 'self'");
    expect(byKey['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(byKey['X-Frame-Options']).toBe('SAMEORIGIN');
    expect(byKey['Permissions-Policy']).toContain('camera=()');
    expect(byKey['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(byKey['X-Content-Type-Options']).toBe('nosniff');
  });

  it('excludes the token-gated preview route, which sets its own headers', async () => {
    const headerConfig = await nextConfig.headers?.();
    const entry = headerConfig?.find((rule) => rule.source === '/((?!apercu).*)');
    expect(entry).toBeDefined();
    // Next's source pattern is path-to-regexp syntax; mirror its
    // negative-lookahead semantics with a plain RegExp to confirm intent
    // without depending on path-to-regexp directly (an internal Next
    // dependency, not one of this package's own).
    const matchesPreview = /^\/(?!apercu)/.test('/apercu/some-token');
    const matchesHome = /^\/(?!apercu)/.test('/');
    const matchesBot = /^\/(?!apercu)/.test('/bot');
    expect(matchesPreview).toBe(false);
    expect(matchesHome).toBe(true);
    expect(matchesBot).toBe(true);
  });

  it('never allows framing (frame-ancestors none, X-Frame-Options SAMEORIGIN, never ALLOWALL)', async () => {
    const headerConfig = await nextConfig.headers?.();
    const entry = headerConfig?.find((rule) => rule.source === '/((?!apercu).*)');
    const byKey = Object.fromEntries(entry!.headers.map((h) => [h.key, h.value]));
    expect(byKey['X-Frame-Options']).not.toBe('ALLOWALL');
    expect(byKey['Content-Security-Policy']).toMatch(/frame-ancestors 'none'/);
  });
});
