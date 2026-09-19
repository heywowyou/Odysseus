/**
 * Plan 018 step 4: the audit facts and the risk scale live on their own
 * sheet, the second physical page, between the minimal cover and the table
 * of contents. These tests pin the field order, the presence/absence rules
 * (the legal-name row vanishes entirely when the field is absent), the
 * moved severity scale, and the sheet's DOM position in a fully rendered
 * document.
 */
import { describe, expect, it } from 'vitest';
import { escapeHtml } from '../html-utils.js';
import { renderHtml } from '../render-html.js';
import { fr } from '../strings/fr.js';
import { en } from '../strings/en.js';
import { getStrings } from '../strings/i18n.js';
import { METADATA_SHEET_ID, renderMetadataSheet } from './metadata-sheet.js';
import { resolveRenderDiffEvidence } from '../../screenshots.js';
import {
  loadSmallSiteAnalysis,
  loadSmallSiteFindings,
  loadSmallSiteManifest,
} from '../../test-fixtures.js';
import type { AuditManifest } from '@odysseus/core';

/** The fact grid's field labels, in DOM order. Matches the label style
 *  metadata-sheet.ts's own field() helper emits, and nothing else. */
function fieldLabelsInOrder(html: string): string[] {
  return [
    ...html.matchAll(
      /letter-spacing:0\.02em;font-size:10px;opacity:0\.5;margin-bottom:var\(--space-3\)">([^<]*)<\/div>/g,
    ),
  ].map((match) => match[1] ?? '');
}

function buildMeasurement(numericValue: number, displayValue: string) {
  return { score: 0.9, numericValue, displayValue };
}

async function manifestWithOneMeasuredPage(): Promise<AuditManifest> {
  const manifest = await loadSmallSiteManifest();
  return {
    ...manifest,
    pages: manifest.pages.map((page, i) =>
      i === 0
        ? {
            ...page,
            coreWebVitals: {
              lcp: buildMeasurement(1800, '1.8 s'),
              cls: buildMeasurement(0, '0'),
              tbt: buildMeasurement(120, '120 ms'),
              fcp: buildMeasurement(900, '0.9 s'),
              speedIndex: buildMeasurement(2000, '2.0 s'),
            },
          }
        : page,
    ),
  };
}

describe('renderMetadataSheet field order and presence', () => {
  it('renders the grade and scale before the fact grid, legal name omitted when absent (French)', async () => {
    const manifest = await loadSmallSiteManifest();
    const analysis = await loadSmallSiteAnalysis('fr');
    const html = renderMetadataSheet(fr, manifest, analysis);

    expect(fieldLabelsInOrder(html)).toEqual([
      escapeHtml(fr.metadata.riskSmallLabel),
      escapeHtml(fr.metadata.scorecardLabel),
      escapeHtml(fr.metadata.siteLabel),
      escapeHtml(fr.metadata.dateLabel),
      escapeHtml(fr.metadata.pagesScannedLabel),
      escapeHtml(fr.metadata.wcagReferentialLabel),
    ]);
    // The site URL, the audit date and the visited-page count are real
    // values from the manifest, never empty labels.
    expect(html).toContain('https://small-site.test/');
    expect(html).toContain('11 pages analysées');
    expect(html).not.toContain(escapeHtml(fr.metadata.legalNameLabel));
    // Issue #51: the report-language row is gone from the client-facing
    // sheet, in both languages; both literal labels must stay absent.
    expect(html).not.toContain('Langue du rapport');
  });

  // Issue #28: a one-page audit used to print "1 pages analysées" /
  // "1 pages analyzed" on this sheet.
  it('agrees the pages-scanned value for a single visited page, in both languages', async () => {
    const manifest = await loadSmallSiteManifest();
    const onePageManifest: AuditManifest = {
      ...manifest,
      pages: manifest.pages.slice(0, 1).map(({ analysisCoverage: _coverage, ...page }) => page),
    };

    const analysisFr = await loadSmallSiteAnalysis('fr');
    const htmlFr = renderMetadataSheet(fr, onePageManifest, analysisFr);
    expect(htmlFr).toContain('1 page analysée');
    expect(htmlFr).not.toContain('1 pages analysées');

    const analysisEn = await loadSmallSiteAnalysis('en');
    const htmlEn = renderMetadataSheet(en, onePageManifest, analysisEn);
    expect(htmlEn).toContain('1 page analyzed');
    expect(htmlEn).not.toContain('1 pages analyzed');
  });

  it('closes the fact grid with the legal-name row when present', async () => {
    const manifest = await loadSmallSiteManifest();
    const analysis = await loadSmallSiteAnalysis('fr');
    const html = renderMetadataSheet(fr, manifest, analysis, [], {
      raisonSociale: { value: 'Acme Société par Actions Simplifiée', provenance: 'operator' },
      updatedAt: new Date(),
    });

    expect(fieldLabelsInOrder(html)).toEqual([
      escapeHtml(fr.metadata.riskSmallLabel),
      escapeHtml(fr.metadata.scorecardLabel),
      escapeHtml(fr.metadata.siteLabel),
      escapeHtml(fr.metadata.dateLabel),
      escapeHtml(fr.metadata.pagesScannedLabel),
      escapeHtml(fr.metadata.wcagReferentialLabel),
      escapeHtml(fr.metadata.legalNameLabel),
    ]);
  });

  it('renders the English labels in the same order', async () => {
    const manifest = await loadSmallSiteManifest();
    const analysis = await loadSmallSiteAnalysis('en');
    const html = renderMetadataSheet(en, manifest, analysis);

    expect(fieldLabelsInOrder(html)).toEqual([
      escapeHtml(en.metadata.riskSmallLabel),
      escapeHtml(en.metadata.scorecardLabel),
      escapeHtml(en.metadata.siteLabel),
      escapeHtml(en.metadata.dateLabel),
      escapeHtml(en.metadata.pagesScannedLabel),
      escapeHtml(en.metadata.wcagReferentialLabel),
    ]);
    // Issue #51: no report-language row in English either.
    expect(html).not.toContain('Report language');
  });

  it('lists Performance in the referential row only when it was measured', async () => {
    const manifest = await loadSmallSiteManifest();
    const analysis = await loadSmallSiteAnalysis('fr');
    const without = renderMetadataSheet(fr, manifest, analysis);
    const withVitals = renderMetadataSheet(fr, await manifestWithOneMeasuredPage(), analysis);

    expect(without).toContain(fr.metadata.wcagReferentialValueNoPerformance);
    expect(without).not.toContain(fr.metadata.wcagReferentialValue);
    expect(withVitals).toContain(fr.metadata.wcagReferentialValue);
  });
});

// The risk scale moved off the cover with plan 018 step 4, unchanged: same
// data source (computeStatistics), same three badges, same basis notes.
describe('renderMetadataSheet carries the severity scale and its basis note', () => {
  it('shows all three scale labels and the holistic-judgment note', async () => {
    const manifest = await loadSmallSiteManifest();
    const analysis = await loadSmallSiteAnalysis('fr');
    const html = renderMetadataSheet(fr, manifest, { ...analysis, overallRisk: 'high' }, []);

    expect(html).toContain(fr.metadata.riskLevels.low);
    expect(html).toContain(fr.metadata.riskLevels.medium);
    expect(html).toContain(fr.metadata.riskLevels.high);
    // The note renders escaped (escapeHtml), so compare the escaped form.
    expect(html).toContain(escapeHtml(fr.metadata.riskScaleBasisNote));
    expect(html).toContain('class="metadata-signal-stack"');
    expect(html).toContain('class="metadata-field metadata-grade-field"');
    expect(html).toContain('class="scorecard-grade-badge"');
    expect(html).toContain('metadata-risk-level-current');
  });

  it('states the critical/serious counts the level is based on', async () => {
    const manifest = await loadSmallSiteManifest();
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('fr');
    const html = renderMetadataSheet(fr, manifest, analysis, findings);

    expect(html).toMatch(/Évaluation fondée sur \d+ constats critiques et \d+ constats sérieux/);
  });
});

// Issue #313: the client-facing layers gave the grade field and the
// severity-bar field the same label, so page 2 printed "NIVEAU GLOBAL DES
// CONSTATS" (EN: "OVERALL FINDINGS LEVEL") twice - once over the letter
// grade, once over the Faible/Moyen/Élevé bar. The composed strings (what
// the report actually renders via getStrings) must keep the two labels
// distinct, in both languages.
describe('the grade and the severity bar carry distinct labels (issue #313)', () => {
  it('in the composed client-facing French strings and the rendered sheet', async () => {
    const strings = getStrings('fr');
    expect(strings.metadata.scorecardLabel).toBe('Note globale');
    expect(strings.metadata.riskSmallLabel).toBe('Niveau de gravité');
    expect(strings.metadata.scorecardLabel).not.toBe(strings.metadata.riskSmallLabel);

    const manifest = await loadSmallSiteManifest();
    const analysis = await loadSmallSiteAnalysis('fr');
    const html = renderMetadataSheet(strings, manifest, analysis);
    expect(html).toContain('Note globale');
    expect(html).toContain('Niveau de gravité');
    expect(html).not.toContain('Niveau global des constats');
  });

  it('in the composed client-facing English strings and the rendered sheet', async () => {
    const strings = getStrings('en');
    expect(strings.metadata.scorecardLabel).toBe('Overall grade');
    expect(strings.metadata.riskSmallLabel).toBe('Severity level');
    expect(strings.metadata.scorecardLabel).not.toBe(strings.metadata.riskSmallLabel);

    const manifest = await loadSmallSiteManifest();
    const analysis = await loadSmallSiteAnalysis('en');
    const html = renderMetadataSheet(strings, manifest, analysis);
    expect(html).toContain('Overall grade');
    expect(html).toContain('Severity level');
    expect(html).not.toContain('Overall findings level');
  });
});

// The sheet must not perturb the numbered reading order: id "report-metadata"
// deliberately never matches section-registry's section-* shape, and
// render-html.ts renders it between the cover and the TOC.
describe('the metadata sheet is the second sheet, between the cover and the TOC', () => {
  it('renders between the cover and the table of contents in the composed document', async () => {
    const manifest = await loadSmallSiteManifest();
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('fr');
    const { pages: renderDiffEvidencePages } = resolveRenderDiffEvidence(manifest, findings);
    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages });

    const coverIndex = html.indexOf('<section class="sheet sheet-cover">');
    const metadataIndex = html.indexOf(`id="${METADATA_SHEET_ID}"`);
    const tocIndex = html.indexOf(escapeHtml(fr.toc.heading));
    expect(coverIndex).toBeGreaterThan(-1);
    expect(metadataIndex).toBeGreaterThan(coverIndex);
    expect(tocIndex).toBeGreaterThan(metadataIndex);
  });

  it('is the second sheet in the document, with exactly the cover before it', async () => {
    const manifest = await loadSmallSiteManifest();
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('fr');
    const { pages: renderDiffEvidencePages } = resolveRenderDiffEvidence(manifest, findings);
    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages });

    const sections = html.match(/<section class="sheet[^>]*>/g) ?? [];
    expect(sections.length).toBeGreaterThan(2);
    expect(sections[0]).toContain('sheet-cover');
    expect(sections[1]).toContain(`id="${METADATA_SHEET_ID}"`);
    // The TOC follows as the third sheet, itself unnumbered chrome.
    expect(sections[2]).not.toContain('id="');
  });
});
