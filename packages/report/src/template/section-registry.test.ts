import { describe, expect, it } from 'vitest';
import { renderHtml } from './render-html.js';
import { SECTION_IDS, computeSectionNumbers, type SectionId } from './section-registry.js';
import { resolveRenderDiffEvidence } from '../screenshots.js';
import {
  loadSmallSiteAnalysis,
  loadSmallSiteFindings,
  loadSmallSiteManifest,
} from '../test-fixtures.js';

/** The `id` attribute of every body sheet section, in DOM order. Cover and
 *  the table of contents pass no id to sheet(), and every numbered section
 *  passes exactly one, so this is the document's reading order of numbered
 *  sections (plan 018 step 3's "registry and render order must agree"
 *  check, asserted against the real composed document rather than the
 *  renderBody source). */
function sectionIdsInDomOrder(html: string): SectionId[] {
  return [...html.matchAll(/<section class="sheet[^"]*" id="(section-[^"]+)">/g)].map(
    (match) => match[1] as SectionId,
  );
}

describe('section-registry order (plan 018 step 3)', () => {
  it('renders the body sections in the included registry order for the small-site fixture', async () => {
    const manifest = await loadSmallSiteManifest();
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('fr');
    const { pages: renderDiffEvidencePages } = resolveRenderDiffEvidence(manifest, findings);

    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages });
    const domOrder = sectionIdsInDomOrder(html);

    // The fixture's own gates: its only legal-page findings are accessibility
    // failures, which stay ranked, so partitionFindings diverts nothing and
    // section-06 does not render; it carries no obligationAssessment, so the
    // article-47-only section-10 never renders; it carries no
    // benchmarkPercentile (milestone 10 has not populated any manifest with
    // one yet), so section-15 never renders either; no delta is passed, so
    // the re-audit's section-16 is absent too.
    const expectedOrder: SectionId[] = SECTION_IDS.filter(
      (id) =>
        id !== 'section-06' && id !== 'section-10' && id !== 'section-15' && id !== 'section-16',
    );
    expect(domOrder).toEqual([...expectedOrder]);
  });

  it('closes with section-12 immediately before section-13, and section-13 last', async () => {
    const manifest = await loadSmallSiteManifest();
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('fr');
    const { pages: renderDiffEvidencePages } = resolveRenderDiffEvidence(manifest, findings);

    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages });
    const domOrder = sectionIdsInDomOrder(html);

    // Trade-off 44 as amended 2026-09-01 (plan 024): the glossary is always
    // the final section, and the technical appendix immediately precedes it,
    // whatever is suppressed upstream.
    expect(domOrder[domOrder.length - 1]).toBe('section-13');
    expect(domOrder[domOrder.length - 2]).toBe('section-12');
  });

  it('numbers every included id contiguously in registry order, so display ordinals follow the reorder', () => {
    const all = computeSectionNumbers(new Set<SectionId>(SECTION_IDS));
    expect([...all.values()]).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
    ]);
    // Stable ids keep their identity, not their old number: section-02 now
    // renders after the evidence sections and the action synthesis (plan
    // 018), the glossary carries the last number (plan 024's glossary-last
    // reversal), and the opening carries 1.
    expect(all.get('section-00')).toBe(1);
    expect(all.get('section-16')).toBe(3);
    expect(all.get('section-02')).toBe(14);
    // Issue #333: next steps closes the narrative after the legal reference.
    expect(all.get('section-14')).toBe(15);
    expect(all.get('section-12')).toBe(17);
    expect(all.get('section-13')).toBe(18);

    // Suppressing a mid-document section shifts only what follows it.
    const withoutObservations = computeSectionNumbers(
      new Set<SectionId>(SECTION_IDS.filter((id) => id !== 'section-06')),
    );
    expect([...withoutObservations.values()]).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
    ]);
    expect(withoutObservations.get('section-05b')).toBe(7);
    expect(withoutObservations.get('section-07')).toBe(8);
    expect(withoutObservations.get('section-13')).toBe(17);
  });
});
