import { describe, expect, it } from 'vitest';
import type { EvidenceBoundContent, ReportFactRegistry } from '@odysseus/core';
import {
  EvidenceBoundContentError,
  assertNoFreehandExactScalar,
  resolveEvidenceBoundContent,
  sanitizeModelText,
  validateEvidenceBoundContent,
} from './evidence-bound-content.js';

const registry: ReportFactRegistry = {
  registryVersion: '058-test',
  inputSnapshotDigest: `sha256:${'a'.repeat(64)}`,
  facts: [
    {
      factId: 'audit.siteUrl',
      kind: 'url',
      value: 'https://site.test',
      display: { fr: 'https://site.test', en: 'https://site.test' },
      sourceRefs: [],
    },
    {
      factId: 'audit.pagesVisited',
      kind: 'number',
      value: 12,
      display: { fr: '12 pages visitées', en: '12 pages visited' },
      sourceRefs: [],
    },
    {
      factId: 'wcag.1.4.3',
      kind: 'reference',
      value: '1.4.3',
      display: { fr: 'critère WCAG 1.4.3', en: 'WCAG criterion 1.4.3' },
      sourceRefs: [],
    },
  ],
};

describe('assertNoFreehandExactScalar enforces the closed scalar allowlist', () => {
  it('rejects freehand URLs outside a binding', () => {
    expect(() =>
      assertNoFreehandExactScalar('Voir https://site.test/page pour la preuve.'),
    ).toThrow(EvidenceBoundContentError);
    expect(() => assertNoFreehandExactScalar('Sur www.site.test, le contraste échoue.')).toThrow(
      /Exact scalar\/URL must be emitted through a fact\/reference binding/,
    );
  });

  it('rejects freehand exact numbers, percentages, durations and currency', () => {
    for (const text of [
      'Nous avons analysé 12 pages.',
      'Le score atteint 85 %.',
      'Le délai est de 320 ms.',
      'Près de 2 s sont bloquées.',
      'Cela coûte 12,5 € par visite.',
      'Le ratio mesuré vaut 3.5.',
    ])
      expect(() => assertNoFreehandExactScalar(text), text).toThrow(EvidenceBoundContentError);
  });

  it('accepts prose whose quantities travel only through bindings', () => {
    expect(() =>
      assertNoFreehandExactScalar(
        'Plusieurs pages visitées présentent un contraste insuffisant; le détail figure en annexe.',
      ),
    ).not.toThrow();
  });
});

describe('validateEvidenceBoundContent', () => {
  it('accepts text, bound facts and registry reference segments', () => {
    const content: EvidenceBoundContent = {
      segments: [
        { kind: 'text', text: 'Audit mené sur ' },
        { kind: 'fact', factId: 'audit.pagesVisited' },
        { kind: 'text', text: ' ; exigence du ' },
        { kind: 'reference', referenceId: 'wcag.1.4.3' },
        { kind: 'text', text: '.' },
      ],
    };
    expect(() => validateEvidenceBoundContent(content, registry)).not.toThrow();
  });

  it('refuses a reference the registry does not declare, so raw ids never print', () => {
    // Live pilot regression: finding ids and digests used as references were
    // printed raw into client prose ("f001f002", a bare sha256).
    for (const referenceId of ['f001', `sha256:${'b'.repeat(64)}`, 'screenshot:home']) {
      expect(() =>
        validateEvidenceBoundContent({ segments: [{ kind: 'reference', referenceId }] }, registry),
      ).toThrow(`Unknown reference binding: ${referenceId}`);
    }
    // A number fact is not a reference, even though its id exists.
    expect(() =>
      validateEvidenceBoundContent(
        { segments: [{ kind: 'reference', referenceId: 'audit.pagesVisited' }] },
        registry,
      ),
    ).toThrow(EvidenceBoundContentError);
  });

  it('rejects a fact segment naming a fact outside the registry', () => {
    const content: EvidenceBoundContent = {
      segments: [{ kind: 'fact', factId: 'audit.madeUp' }],
    };
    expect(() => validateEvidenceBoundContent(content, registry)).toThrow(
      'Unknown fact binding: audit.madeUp',
    );
  });

  it('rejects a text segment carrying a freehand exact scalar even beside valid bindings', () => {
    const content: EvidenceBoundContent = {
      segments: [
        { kind: 'text', text: 'Audit mené sur 12 pages, voir ' },
        { kind: 'fact', factId: 'audit.siteUrl' },
      ],
    };
    expect(() => validateEvidenceBoundContent(content, registry)).toThrow(
      EvidenceBoundContentError,
    );
  });
});

describe('sanitizeModelText safely normalizes unsafe formatting', () => {
  it('strips angle brackets, replaces control characters and collapses whitespace', () => {
    expect(sanitizeModelText('<script>alert(1)</script>')).toBe('scriptalert(1)/script');
    expect(sanitizeModelText('contraste\u0007insuffisant')).toBe('contraste insuffisant');
    // Edge whitespace separates a segment from its bound neighbour, so it is
    // collapsed, not trimmed.
    expect(sanitizeModelText('  ligne\nsaut\u007f  ')).toBe(' ligne saut ');
  });

  it('leaves safe prose byte-for-byte unchanged', () => {
    const safe = 'Le contraste du texte principal est insuffisant sur la page d’accueil.';
    expect(sanitizeModelText(safe)).toBe(safe);
    expect(Buffer.from(sanitizeModelText(safe), 'utf8')).toEqual(Buffer.from(safe, 'utf8'));
  });
});

describe('resolveEvidenceBoundContent', () => {
  const content: EvidenceBoundContent = {
    segments: [
      { kind: 'text', text: 'Audit mené sur ' },
      { kind: 'fact', factId: 'audit.pagesVisited' },
      { kind: 'text', text: ' — détail : ' },
      { kind: 'fact', factId: 'audit.siteUrl' },
      { kind: 'text', text: ' ; exigence : ' },
      { kind: 'reference', referenceId: 'wcag.1.4.3' },
      { kind: 'text', text: '.' },
    ],
  };

  it('resolves facts and references through the registry display, keeping segment spacing', () => {
    expect(resolveEvidenceBoundContent(content, registry, 'fr')).toBe(
      'Audit mené sur 12 pages visitées — détail : https://site.test ; exigence : critère WCAG 1.4.3.',
    );
    expect(resolveEvidenceBoundContent(content, registry, 'en')).toBe(
      'Audit mené sur 12 pages visited — détail : https://site.test ; exigence : WCAG criterion 1.4.3.',
    );
  });

  it('separates a bound value from an adjacent word when the writer omitted the space', () => {
    // Live pilot regression: the resolver printed "sur38pages" and
    // "74constats" when segments abutted without whitespace.
    const abutting: EvidenceBoundContent = {
      segments: [
        { kind: 'text', text: 'Audit sur' },
        { kind: 'fact', factId: 'audit.pagesVisited' },
        { kind: 'text', text: 'au total, voir' },
        { kind: 'reference', referenceId: 'wcag.1.4.3' },
        { kind: 'text', text: '.' },
      ],
    };
    expect(resolveEvidenceBoundContent(abutting, registry, 'fr')).toBe(
      'Audit sur 12 pages visitées au total, voir critère WCAG 1.4.3.',
    );
  });

  it('sanitizes only the unsafe parts and leaves bound displays byte-for-byte intact', () => {
    const risky: EvidenceBoundContent = {
      segments: [
        { kind: 'text', text: ' <b>Constat</b> sur ' },
        { kind: 'fact', factId: 'audit.siteUrl' },
      ],
    };
    expect(resolveEvidenceBoundContent(risky, registry, 'en')).toBe(
      'bConstat/b sur https://site.test',
    );
  });

  it('validates before resolving, so an unknown binding never reaches the output', () => {
    const unknown: EvidenceBoundContent = {
      segments: [{ kind: 'fact', factId: 'audit.madeUp' }],
    };
    expect(() => resolveEvidenceBoundContent(unknown, registry, 'fr')).toThrow(
      EvidenceBoundContentError,
    );
  });
});
