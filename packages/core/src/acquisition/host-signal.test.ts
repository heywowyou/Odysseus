import { describe, expect, it } from 'vitest';
import { classifyDocumentWall, classifyHostResponse } from './host-signal.js';

const HOST = {
  requestedHost: 'example.com',
  landedHost: 'www.example.com',
  auditedHostAliases: ['example.com', 'www.example.com'],
};

describe('classifyDocumentWall', () => {
  it('recognizes explicit challenge titles and rate-limit documents', () => {
    expect(classifyDocumentWall({ title: 'Just a moment...' }).classification).toBe('wall');
    expect(classifyDocumentWall({ status: 429 }).classification).toBe('wall');
  });

  it('requires a challenge marker plus a barrier-shaped document', () => {
    expect(
      classifyDocumentWall({
        status: 503,
        visibleTextLength: 2000,
        markers: ['o2switch-challenge'],
      }).classification,
    ).toBe('wall');
    expect(
      classifyDocumentWall({
        status: 200,
        visibleTextLength: 499,
        markers: ['datadome-challenge'],
      }).classification,
    ).toBe('wall');
    expect(
      classifyDocumentWall({
        status: 200,
        markupLength: 512,
        visibleTextLength: 900,
        markers: ['waf-security-check'],
      }).classification,
    ).toBe('wall');
  });

  it('does not turn vendor scripts or substantive pages into walls', () => {
    expect(classifyDocumentWall({ status: 200, markers: ['datadome-script'] }).classification).toBe(
      'content',
    );
    expect(
      classifyDocumentWall({
        status: 200,
        markupLength: 12_000,
        visibleTextLength: 800,
        markers: ['datadome-challenge'],
      }).classification,
    ).toBe('content');
  });

  it('requires a minimal document for meta-refresh walls', () => {
    expect(
      classifyDocumentWall({ markupLength: 512, markers: ['meta-refresh'] }).classification,
    ).toBe('wall');
    expect(
      classifyDocumentWall({ markupLength: 513, markers: ['meta-refresh'] }).classification,
    ).toBe('content');
  });
});

describe('classifyHostResponse', () => {
  it('counts the audited hostname and its exact www alias', () => {
    expect(classifyHostResponse({ ...HOST, status: 429 }).disposition).toBe('pushback');
    expect(
      classifyHostResponse({ ...HOST, landedHost: 'shop.example.com', status: 429 }).disposition,
    ).toBe('none');
  });

  it('treats 429, 503, and Retry-After as pushback', () => {
    expect(classifyHostResponse({ ...HOST, status: 429 }).disposition).toBe('pushback');
    expect(classifyHostResponse({ ...HOST, status: 503 }).disposition).toBe('pushback');
    expect(classifyHostResponse({ ...HOST, status: 200, retryAfterMs: 5000 }).disposition).toBe(
      'pushback',
    );
  });

  it('makes an isolated 500 a page error and the third consecutive 5xx a pushback', () => {
    expect(
      classifyHostResponse({ ...HOST, status: 500, consecutiveOriginServerErrors: 1 }),
    ).toEqual({ disposition: 'page-error', reason: 'http-error', auditedHost: true });
    expect(
      classifyHostResponse({ ...HOST, status: 500, consecutiveOriginServerErrors: 3 }),
    ).toEqual({ disposition: 'pushback', reason: 'origin-transient', auditedHost: true });
  });

  it('ignores responses that landed on a third-party host', () => {
    expect(
      classifyHostResponse({
        requestedHost: 'example.com',
        landedHost: 'instagram.com',
        auditedHostAliases: ['example.com', 'www.example.com'],
        status: 429,
      }),
    ).toEqual({ disposition: 'none', reason: 'not-audited-host', auditedHost: false });
  });
});
