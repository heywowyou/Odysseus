import { describe, expect, it, vi } from 'vitest';
import type { ServerResponse } from 'node:http';
import {
  applyBaseSecurityHeaders,
  isHtmlContentType,
  SPA_CONTENT_SECURITY_POLICY,
} from './security-headers.js';

function fakeRes(): ServerResponse & { setHeader: ReturnType<typeof vi.fn> } {
  return { setHeader: vi.fn() } as never;
}

describe('security headers helpers', () => {
  it('applies exactly the two baseline headers', () => {
    const res = fakeRes();
    applyBaseSecurityHeaders(res);

    expect(res.setHeader).toHaveBeenCalledTimes(2);
    expect(res.setHeader).toHaveBeenCalledWith('x-content-type-options', 'nosniff');
    expect(res.setHeader).toHaveBeenCalledWith('referrer-policy', 'no-referrer');
  });

  it('keeps the CSP aligned with the shell and preview constraints', () => {
    expect(SPA_CONTENT_SECURITY_POLICY).toContain("script-src 'self'");
    expect(SPA_CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(SPA_CONTENT_SECURITY_POLICY).toContain("style-src 'self' 'unsafe-inline'");
  });

  it('detects HTML content types only', () => {
    expect(isHtmlContentType('text/html; charset=utf-8')).toBe(true);
    expect(isHtmlContentType('application/pdf')).toBe(false);
    expect(isHtmlContentType('application/json; charset=utf-8')).toBe(false);
  });
});
