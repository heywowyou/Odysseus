import { describe, expect, it } from 'vitest';
import {
  extractSecurityHeadersCandidates,
  SECURITY_HEADER_MISSING_CSP_RULE_ID,
  SECURITY_HEADER_MISSING_HSTS_RULE_ID,
  SECURITY_HEADER_MISSING_PERMISSIONS_POLICY_RULE_ID,
  SECURITY_HEADER_MISSING_REFERRER_POLICY_RULE_ID,
  SECURITY_HEADER_MISSING_X_FRAME_OPTIONS_RULE_ID,
} from './normalize-security-headers.js';

describe('security-headers', () => {
  it('flags every missing header on an https page', () => {
    const candidates = extractSecurityHeadersCandidates(
      {
        fetched: true,
        isHttps: true,
        hasCsp: false,
        hasHsts: false,
        hasXFrameOptions: false,
        hasReferrerPolicy: false,
        hasPermissionsPolicy: false,
      },
      'https://example.com/',
    );
    const ruleIds = candidates.map((c) => c.ruleId).sort();
    expect(ruleIds).toEqual(
      [
        SECURITY_HEADER_MISSING_CSP_RULE_ID,
        SECURITY_HEADER_MISSING_HSTS_RULE_ID,
        SECURITY_HEADER_MISSING_PERMISSIONS_POLICY_RULE_ID,
        SECURITY_HEADER_MISSING_REFERRER_POLICY_RULE_ID,
        SECURITY_HEADER_MISSING_X_FRAME_OPTIONS_RULE_ID,
      ].sort(),
    );
    // 2026-08-24: moved off 'seo', where these had been filed only
    // because no better category existed, to the 'privacy' category added
    // with them. Four of the five have nothing to do with search ranking,
    // and a real report card read "Référencement (SEO) - En-têtes de
    // sécurité manquants" above a paragraph about clickjacking.
    expect(candidates.every((c) => c.category === 'privacy')).toBe(true);
  });

  it('does not flag HSTS on an http-only origin', () => {
    const candidates = extractSecurityHeadersCandidates(
      {
        fetched: true,
        isHttps: false,
        hasCsp: true,
        hasHsts: false,
        hasXFrameOptions: true,
        hasReferrerPolicy: true,
        hasPermissionsPolicy: true,
      },
      'http://example.com/',
    );
    expect(candidates).toEqual([]);
  });

  it('produces no candidates when the header fetch itself failed', () => {
    expect(
      extractSecurityHeadersCandidates(
        {
          fetched: false,
          isHttps: true,
          hasCsp: false,
          hasHsts: false,
          hasXFrameOptions: false,
          hasReferrerPolicy: false,
          hasPermissionsPolicy: false,
        },
        'https://example.com/',
      ),
    ).toEqual([]);
  });

  it('does not fire when every header is present', () => {
    expect(
      extractSecurityHeadersCandidates(
        {
          fetched: true,
          isHttps: true,
          hasCsp: true,
          hasHsts: true,
          hasXFrameOptions: true,
          hasReferrerPolicy: true,
          hasPermissionsPolicy: true,
        },
        'https://example.com/',
      ),
    ).toEqual([]);
  });
});
