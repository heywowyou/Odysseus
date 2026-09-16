import { describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  applyBaseSecurityHeaders,
  isHtmlContentType,
  SPA_CONTENT_SECURITY_POLICY,
  STRICT_TRANSPORT_SECURITY,
} from './security-headers.js';

function fakeReq(headers: Record<string, string> = {}): IncomingMessage {
  return { headers } as never;
}

function fakeRes(): ServerResponse & { setHeader: ReturnType<typeof vi.fn> } {
  return { setHeader: vi.fn() } as never;
}

describe('security headers helpers', () => {
  it('applies exactly the two baseline headers to a plain HTTP request', () => {
    const res = fakeRes();
    applyBaseSecurityHeaders(res, fakeReq());

    expect(res.setHeader).toHaveBeenCalledTimes(2);
    expect(res.setHeader).toHaveBeenCalledWith('x-content-type-options', 'nosniff');
    expect(res.setHeader).toHaveBeenCalledWith('referrer-policy', 'no-referrer');
  });

  it('adds HSTS only when the proxy reports the request arrived over HTTPS', () => {
    const res = fakeRes();
    applyBaseSecurityHeaders(res, fakeReq({ 'x-forwarded-proto': 'https' }));

    expect(res.setHeader).toHaveBeenCalledTimes(3);
    expect(res.setHeader).toHaveBeenCalledWith(
      'strict-transport-security',
      STRICT_TRANSPORT_SECURITY,
    );
    expect(STRICT_TRANSPORT_SECURITY).toMatch(/^max-age=\d{8,}$/);

    const plain = fakeRes();
    applyBaseSecurityHeaders(plain, fakeReq({ 'x-forwarded-proto': 'http' }));
    expect(plain.setHeader).not.toHaveBeenCalledWith(
      'strict-transport-security',
      expect.anything(),
    );
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
