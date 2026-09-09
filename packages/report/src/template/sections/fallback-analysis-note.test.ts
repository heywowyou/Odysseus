import { describe, expect, it } from 'vitest';
import type { StoredAnalysis } from '../../types.js';
import { renderFallbackAnalysisNote, FALLBACK_ANALYSIS_NOTE_ID } from './fallback-analysis-note.js';
import { getStrings } from '../strings/i18n.js';
import { en } from '../strings/en.js';
import { fr } from '../strings/fr.js';
import { escapeHtml } from '../html-utils.js';

function buildAnalysis(overrides: Partial<StoredAnalysis> = {}): StoredAnalysis {
  return {
    auditId: 'audit-1',
    language: 'fr',
    model: 'openai-test',
    temperature: 0.2,
    generatedAt: new Date('2026-09-09T00:00:00.000Z'),
    executiveSummary: 'Résumé écrit par le modèle.',
    overallRisk: 'medium',
    themes: [],
    quickWins: [],
    notes: '',
    ...overrides,
  };
}

describe('renderFallbackAnalysisNote', () => {
  it('returns an empty string for a model-generated analysis', () => {
    expect(renderFallbackAnalysisNote(getStrings('fr'), buildAnalysis())).toBe('');
    expect(renderFallbackAnalysisNote(getStrings('en'), buildAnalysis())).toBe('');
  });

  it('renders the unnumbered note for a marked analysis, in French', () => {
    const analysis = buildAnalysis({ language: 'fr', generationMode: 'static-fallback' });
    const html = renderFallbackAnalysisNote(getStrings('fr'), analysis);

    expect(html).toContain(`id="${FALLBACK_ANALYSIS_NOTE_ID}"`);
    // Unnumbered chrome: the id must never match the section-registry's
    // `section-*` shape, and no section-head ordinal is rendered.
    expect(FALLBACK_ANALYSIS_NOTE_ID.startsWith('section-')).toBe(false);
    expect(html).toContain('class="sheet"');
    expect(html).not.toContain('section-head');
    // Copy is interpolated through escapeHtml, so apostrophes appear as
    // entities; assert against the escaped form.
    expect(html).toContain(escapeHtml(fr.fallbackAnalysis.noteHeading));
    expect(html).toContain(escapeHtml(fr.fallbackAnalysis.noteBody));
    expect(html).not.toContain(en.fallbackAnalysis.noteHeading);
  });

  it('renders the unnumbered note for a marked analysis, in English', () => {
    const analysis = buildAnalysis({ language: 'en', generationMode: 'static-fallback' });
    const html = renderFallbackAnalysisNote(getStrings('en'), analysis);

    expect(html).toContain(`id="${FALLBACK_ANALYSIS_NOTE_ID}"`);
    expect(html).toContain(escapeHtml(en.fallbackAnalysis.noteHeading));
    expect(html).toContain(escapeHtml(en.fallbackAnalysis.noteBody));
    expect(html).not.toContain(fr.fallbackAnalysis.noteHeading);
  });

  it('escapes interpolated copy through escapeHtml', () => {
    const analysis = buildAnalysis({ language: 'en', generationMode: 'static-fallback' });
    const html = renderFallbackAnalysisNote(getStrings('en'), analysis);
    // The strings carry apostrophes; the escaped entity must appear in the
    // markup rather than a raw quote inside an attribute context.
    expect(html).toContain('&#39;');
  });
});

describe('fallbackAnalysis strings bilingual parity', () => {
  // Runtime mirror of the compile-time ReportStrings guarantee, following
  // the dashboard i18n parity precedent: every new key exists, non-empty,
  // in both languages, and the pair is not accidentally identical copy.
  it('defines the same non-empty keys in French and English', () => {
    for (const key of ['noteHeading', 'noteBody', 'summarySentence'] as const) {
      expect(fr.fallbackAnalysis[key].length).toBeGreaterThan(0);
      expect(en.fallbackAnalysis[key].length).toBeGreaterThan(0);
      expect(fr.fallbackAnalysis[key]).not.toBe(en.fallbackAnalysis[key]);
    }
  });

  it('states the gate rule and claims no manual pass, in both languages', () => {
    const enBody = en.fallbackAnalysis.noteBody.toLowerCase();
    expect(enBody).toContain('critical');
    expect(enBody).toContain('moderate');
    const frBody = fr.fallbackAnalysis.noteBody.toLowerCase();
    expect(frBody).toContain('critique');
    expect(frBody).toContain('modér');
    // No invented themes or praise, no manual review claimed.
    for (const body of [enBody, frBody]) {
      expect(body).not.toContain('expert');
      expect(body).not.toContain('manual');
    }
  });
});
