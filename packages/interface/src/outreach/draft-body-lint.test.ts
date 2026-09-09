import { describe, expect, it } from 'vitest';
import {
  lintOutreachDraftBody,
  OutreachDraftLintError,
  assertOutreachDraftBody,
} from './draft-body-lint.js';

const PREVIEW_URL = 'https://www.odysseusaudit.com/apercu/abc123';
const CLEAN_BODY = [
  'Bonjour,',
  'Un texte de démonstration sans rien de problématique.',
  PREVIEW_URL,
  'Le responsable de traitement est Odysseus Audit, Jules Fontaine, contact@odysseusaudit.com.',
].join('\n\n');

describe('lintOutreachDraftBody', () => {
  it('returns null for a clean body', () => {
    expect(lintOutreachDraftBody(CLEAN_BODY, [PREVIEW_URL])).toBeNull();
  });

  it('catches markdown emphasis', () => {
    expect(lintOutreachDraftBody('Un **mot** en gras.', [])).toBe('markdown-emphasis');
  });

  it('catches a markdown link', () => {
    expect(lintOutreachDraftBody('Voir [ici](https://example.com).', [])).toBe('markdown-link');
  });

  it('catches raw markup', () => {
    expect(lintOutreachDraftBody('Un <b>mot</b>.', [])).toBe('markup');
  });

  it('catches a tracking parameter', () => {
    expect(lintOutreachDraftBody('https://www.odysseusaudit.com/apercu/abc?utm_source=x', [])).toBe(
      'tracking-param',
    );
  });

  it('catches a reference-stat source name', () => {
    expect(lintOutreachDraftBody('Selon WebAIM, ...', [])).toBe('reference-stat-source');
  });

  it('catches an insecure link', () => {
    expect(lintOutreachDraftBody('http://example.com', [])).toBe('insecure-url');
  });

  it('catches an off-domain link', () => {
    expect(lintOutreachDraftBody('https://tracker.example.com/x', [])).toBe('off-domain-link');
  });

  it('catches a subdomain of an approved host, proving exact-host matching', () => {
    expect(lintOutreachDraftBody('https://app.odysseusaudit.com/x', [])).toBe('off-domain-link');
  });

  it('does not flag our own domain link', () => {
    expect(lintOutreachDraftBody(`Voir ${PREVIEW_URL}`, [PREVIEW_URL])).toBeNull();
  });

  it('does not flag a link on the bare approved host', () => {
    expect(lintOutreachDraftBody('https://odysseusaudit.com/apercu/abc123', [])).toBeNull();
  });

  it('treats a trailing-dot spelling of an approved host as that host', () => {
    // hasOffDomainLink strips the trailing dot before comparing, so the
    // root-qualified spelling of an approved host compares equal to it.
    expect(lintOutreachDraftBody('https://www.odysseusaudit.com./x', [])).toBeNull();
  });

  it('strips an allowlisted URL before running the text-content check, so its path does not trip css-selector', () => {
    const urlWithSelectorLikePath = 'https://www.odysseusaudit.com/apercu/.foo>bar';
    const body = `Bonjour,\n\n${urlWithSelectorLikePath}`;
    expect(lintOutreachDraftBody(body, [urlWithSelectorLikePath])).toBeNull();
  });

  it('still catches prohibited content once the allowlisted URL is stripped', () => {
    const body = `Bonjour,\n\n${PREVIEW_URL}\n\nVous devez vous mettre en conformité.`;
    expect(lintOutreachDraftBody(body, [PREVIEW_URL])).toBe('legal-conclusion');
  });
});

describe('assertOutreachDraftBody', () => {
  it('does not throw on a clean body', () => {
    expect(() => assertOutreachDraftBody(CLEAN_BODY, [PREVIEW_URL])).not.toThrow();
  });

  it('throws OutreachDraftLintError naming the rule', () => {
    try {
      assertOutreachDraftBody('Un **mot** en gras.', []);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(OutreachDraftLintError);
      expect((error as OutreachDraftLintError).rule).toBe('markdown-emphasis');
    }
  });
});
