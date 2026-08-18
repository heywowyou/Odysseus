/**
 * General regression net for the class of bug fixed in quick-wins.ts: a
 * string meant for one report language leaking into the other. Compares
 * the full rendered document against every strings/en.ts value that has
 * no identical counterpart in strings/fr.ts (shared cognates like
 * "Performance" or "SEO" are legitimately identical in both and must not
 * trip this), and the reverse. The <style> block and every class="..."
 * attribute are stripped first, since neither is subject to fr/en rules
 * and both can coincide with real English chrome words - nocturne.css
 * with short keywords like "high", and kebab-case class names like
 * "sev-critical" with the severity word "critical" itself.
 */
import { describe, expect, it } from 'vitest';
import { REFERENCE_STAT_TABLE } from '@odysseus/core';
import { renderHtml } from './render-html.js';
import { escapeHtml } from './html-utils.js';
import { resolveRenderDiffEvidence } from '../screenshots.js';
import { en } from './strings/en.js';
import { fr } from './strings/fr.js';
import { loadSasFernandeAnalysis, loadSasFernandeFindings, loadSasFernandeManifest } from '../test-fixtures.js';

function flattenStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(flattenStrings);
  }
  return [];
}

function stripStyleBlock(html: string): string {
  return html.replace(/<style>[\s\S]*?<\/style>/, '').replace(/\sclass="[^"]*"/g, '');
}

/** report-feedback-palais-gallien.md item 13: a reference-stat citation
 *  (packages/core/src/reference-stats/stats.ts) can name an
 *  organization in a proper noun that is deliberately identical in both
 *  the French and English citation sentence (e.g. "W3C Web Accessibility
 *  Initiative") - real, intentional bilingual content, not a template-
 *  chrome leak. Once item 13's transactional-flow eligibility gate
 *  started excluding some citations, a different, previously-unselected
 *  citation carrying this exact collision surfaced in the sas-fernande
 *  fixture: the English chrome word "Accessibility" (categoryLabels.
 *  accessibility) matched as a substring of that citation's proper noun.
 *  Citation sentences are code-owned content, not template chrome (the
 *  class of bug this test actually guards), so they are stripped from
 *  the haystack before the chrome-leak check runs, the same way
 *  stripStyleBlock removes a different known-irrelevant region. */
function stripReferenceStatCitations(html: string): string {
  let stripped = html;
  for (const stat of REFERENCE_STAT_TABLE) {
    stripped = stripped.split(escapeHtml(stat.citation.fr)).join('').split(escapeHtml(stat.citation.en)).join('');
  }
  return stripped;
}

/**
 * Plain substring containment false-positives on short ASCII chrome words
 * like "Low" matching inside unrelated content such as "Slow" (English
 * LLM-authored theme prose, a separate concern from this template-chrome
 * check). Word-boundary matching avoids that without needing an exact
 * token list.
 */
function containsWholeValue(haystack: string, value: string): boolean {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const startsWithWordChar = /^\w/.test(value);
  const endsWithWordChar = /\w$/.test(value);
  const pattern = `${startsWithWordChar ? '\\b' : ''}${escaped}${endsWithWordChar ? '\\b' : ''}`;
  return new RegExp(pattern).test(haystack);
}

const enValues = new Set(flattenStrings(en));
const frValues = new Set(flattenStrings(fr));
const enOnlyValues = [...enValues].filter((value) => !frValues.has(value));
const frOnlyValues = [...frValues].filter((value) => !enValues.has(value));

describe('report chrome strings never leak into the other language', () => {
  it('has at least one value unique to each language, so this test is not vacuous', () => {
    expect(enOnlyValues.length).toBeGreaterThan(0);
    expect(frOnlyValues.length).toBeGreaterThan(0);
  });

  it('the French document contains no strings/en.ts-only value', async () => {
    const manifest = await loadSasFernandeManifest();
    const findings = await loadSasFernandeFindings();
    const analysis = await loadSasFernandeAnalysis('fr');
    const { pages: renderDiffEvidencePages } = resolveRenderDiffEvidence(manifest, findings);

    const html = stripReferenceStatCitations(
      stripStyleBlock(await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages })),
    );

    for (const value of enOnlyValues) {
      expect(containsWholeValue(html, value), `unexpected English chrome string leaked: "${value}"`).toBe(
        false,
      );
    }
  });

  it('the English document contains no strings/fr.ts-only value', async () => {
    const manifest = await loadSasFernandeManifest();
    const findings = await loadSasFernandeFindings();
    const analysis = await loadSasFernandeAnalysis('en');
    const { pages: renderDiffEvidencePages } = resolveRenderDiffEvidence(manifest, findings);

    const html = stripReferenceStatCitations(
      stripStyleBlock(await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages })),
    );

    for (const value of frOnlyValues) {
      expect(containsWholeValue(html, value), `unexpected French chrome string leaked: "${value}"`).toBe(
        false,
      );
    }
  });
});
