import { describe, expect, it } from 'vitest';
import { buildDraftMime } from './draft-mime.js';

const INPUT = {
  to: 'contact@hotel-exemple.fr',
  from: 'contact@odysseusaudit.fr',
  fromName: 'Jules Fontaine (Odysseus)',
  subject: 'Ce que révèle l’analyse de votre site',
  body: 'Bonjour,\n\nUn constat.',
  htmlBody: '<div dir="ltr"><div>Bonjour,</div><div>Un constat.</div></div>',
};

function parts(mime: string): { boundary: string; sections: string[] } {
  const boundary = /boundary="([^"]+)"/u.exec(mime)?.[1] ?? '';
  const sections = mime.split(`--${boundary}`).slice(1, -1);
  return { boundary, sections };
}

function decodePart(section: string): string {
  const encoded = section.split('\r\n\r\n')[1] ?? '';
  return Buffer.from(encoded.replaceAll('\r\n', ''), 'base64').toString('utf8');
}

describe('buildDraftMime', () => {
  it('quotes the display name so its parentheses are not read as a comment', () => {
    expect(buildDraftMime(INPUT)).toContain(
      'From: "Jules Fontaine (Odysseus)" <contact@odysseusaudit.fr>',
    );
  });

  it('carries plain text first and HTML second, each decoding to its input', () => {
    const mime = buildDraftMime(INPUT);
    expect(mime).toContain('Content-Type: multipart/alternative; boundary="');
    const { sections } = parts(mime);
    expect(sections).toHaveLength(2);
    expect(sections[0]).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(sections[1]).toContain('Content-Type: text/html; charset="UTF-8"');
    expect(decodePart(sections[0] ?? '')).toBe(INPUT.body);
    expect(decodePart(sections[1] ?? '')).toBe(INPUT.htmlBody);
    expect(mime.trimEnd().endsWith('--')).toBe(true);
  });

  it('produces identical bytes for an identical draft', () => {
    expect(buildDraftMime(INPUT)).toBe(buildDraftMime({ ...INPUT }));
  });

  it('encodes a non-ASCII subject as an encoded word', () => {
    expect(buildDraftMime(INPUT)).toMatch(/^Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/mu);
  });

  it('refuses a line break in the display name', () => {
    expect(() => buildDraftMime({ ...INPUT, fromName: 'Jules\r\nBcc: x@example.com' })).toThrow(
      /line break/,
    );
  });
});
