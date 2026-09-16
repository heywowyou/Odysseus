import { describe, expect, it } from 'vitest';
import type { AuditManifest, Finding, FindingCategory } from '@odysseus/core';
import { renderStatistics } from './statistics.js';
import { getStrings } from '../strings/i18n.js';
import { loadSmallSiteFindings, loadSmallSiteManifest } from '../../test-fixtures.js';

function buildCategoryFinding(category: FindingCategory, index: number): Finding {
  return {
    findingId: `f-${category}-${index}`,
    auditId: 'audit-1',
    schemaVersion: 1,
    source: 'axe',
    ruleId: `rule-${category}`,
    category,
    severity: 'minor',
    wcagCriteria: [],
    title: 'Title',
    description: 'desc',
    pageUrls: ['https://example.com/'],
    occurrences: 1,
    elements: [{ pageUrl: 'https://example.com/', selector: '.x', snippet: '' }],
    rawEvidence: {},
    dedupeKey: `d-${category}-${index}`,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
  };
}

/** Only manifest.pages (filtered by status) is read by computeStatistics,
 *  so every other field is a minimal placeholder, cast rather than fully
 *  typed out. */
function buildMinimalManifest(): AuditManifest {
  return {
    auditId: 'audit-1',
    kind: 'audit',
    siteUrl: 'https://example.com',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    tool: {} as AuditManifest['tool'],
    config: {} as AuditManifest['config'],
    crawl: {
      startUrl: 'https://example.com/',
      visitedCount: 1,
      maxPages: 20,
      maxDepth: 3,
      robotsTxtFound: false,
      effectiveDelayMs: 500,
    },
    pages: [{ url: 'https://example.com/', depth: 0, status: 'visited', errors: {} }],
  };
}

describe('renderStatistics against the real small-site.test scan', () => {
  it('renders the real page count, finding count, and severity breakdown', async () => {
    const findings = await loadSmallSiteFindings();
    const manifest = await loadSmallSiteManifest();

    const html = renderStatistics(getStrings('fr'), 3, 'fr', findings, manifest);

    // Page count is a property of the scan and stays a literal. The finding
    // and severity totals are read off the fixture, since they legitimately
    // move whenever normalization collapses differently - what must hold is
    // that this section renders the real numbers rather than any of its own.
    const minorCount = findings.filter((f) => f.severity === 'minor').length;
    expect(minorCount).toBeGreaterThan(0);
    expect(html).toContain('>11</div>');
    expect(html).toContain(`>${findings.length}</div>`);
    expect(html).toContain(`>${minorCount}</div>`);
    expect(html).toContain('Mineur'); // severity label, doc §3 canonical map
  });

  it('renders the wide WCAG-fail-count paragraph with the real pages-affected count filled in', async () => {
    const findings = await loadSmallSiteFindings();
    const manifest = await loadSmallSiteManifest();

    const html = renderStatistics(getStrings('en'), 3, 'en', findings, manifest);

    expect(html).not.toContain('{pages}');
    expect(html).toMatch(/WCAG 2\.2 AA criteria failing across \d+ pages/);
  });

  // Issue #28: a single failing criterion on a single page used to render
  // "1 critères WCAG 2.2 AA en échec sur 1 pages" (and the English
  // equivalent "1 WCAG 2.2 AA criteria failing across 1 pages") -
  // grammatically wrong on the exact count a one-page or bounded audit is
  // most likely to hit.
  it('agrees the WCAG-fail-count paragraph with a single criterion on a single page', () => {
    const finding: Finding = {
      findingId: 'f-wcag-1',
      auditId: 'audit-1',
      schemaVersion: 1,
      source: 'axe',
      ruleId: 'rule-wcag',
      category: 'accessibility',
      severity: 'serious',
      wcagCriteria: ['1.1.1'],
      title: 'Title',
      description: 'desc',
      pageUrls: ['https://example.com/'],
      occurrences: 1,
      elements: [{ pageUrl: 'https://example.com/', selector: '.x', snippet: '' }],
      rawEvidence: {},
      dedupeKey: 'd-wcag-1',
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    };
    const manifest = buildMinimalManifest();

    const en = renderStatistics(getStrings('en'), 3, 'en', [finding], manifest);
    expect(en).toContain('1 WCAG 2.2 AA criterion failing across 1 page');
    expect(en).not.toContain('1 WCAG 2.2 AA criteria');
    expect(en).not.toContain('across 1 pages');

    const fr = renderStatistics(getStrings('fr'), 3, 'fr', [finding], manifest);
    expect(fr).toContain('1 critère WCAG 2.2 AA en échec sur 1 page');
    expect(fr).not.toContain('1 critères');
    expect(fr).not.toContain('sur 1 pages');
  });

  // Issue #28: the "pages analyzed" tile printed "1 pages analysées" /
  // "1 pages analyzed" for a one-page scope.
  it('agrees the pages-analyzed tile caption for a single-page scope', () => {
    const finding = buildCategoryFinding('accessibility', 1);
    const manifest = buildMinimalManifest();

    const fr = renderStatistics(getStrings('fr'), 3, 'fr', [finding], manifest);
    expect(fr).toContain('>page analysée<');
    expect(fr).not.toContain('>pages analysées<');

    const en = renderStatistics(getStrings('en'), 3, 'en', [finding], manifest);
    expect(en).toContain('>page analyzed<');
    expect(en).not.toContain('>pages analyzed<');
  });

  // item D7 (P4): a severity or category with zero findings is no longer
  // rendered as an empty tile ("Modéré 0", "Rendu 0"), so the small-site
  // fixture (which has findings in every severity but not necessarily
  // every category) is checked against however many are actually
  // non-zero, not a hardcoded cap.
  it('renders exactly 4 number tiles, one severity tile per non-zero severity, and one category tile per non-zero category', async () => {
    const findings = await loadSmallSiteFindings();
    const manifest = await loadSmallSiteManifest();

    const nonZeroSeverityCount = new Set(findings.map((f) => f.severity)).size;
    const nonZeroCategoryCount = new Set(findings.map((f) => f.category)).size;

    const html = renderStatistics(getStrings('fr'), 3, 'fr', findings, manifest);

    expect((html.match(/class="stat-tile statistics-number-tile/g) ?? []).length).toBe(4);
    expect((html.match(/font-size:24px/g) ?? []).length).toBe(nonZeroSeverityCount);
    expect((html.match(/font-size:22px/g) ?? []).length).toBe(nonZeroCategoryCount);
  });

  it('renders the accepted editorial scoreboard hierarchy with stable semantic hooks', async () => {
    const findings = await loadSmallSiteFindings();
    const manifest = await loadSmallSiteManifest();

    const html = renderStatistics(getStrings('en'), 3, 'en', findings, manifest);

    expect(html).toContain('<section class="sheet statistics-sheet" id="section-03">');
    expect(html).toContain('statistics-number-grid');
    expect(html).toContain('statistics-number-tile-primary');
    expect(html).toContain('statistics-notes');
    expect((html.match(/statistics-breakdown-heading/g) ?? []).length).toBe(3);
  });

  // item D7 (P4): a category with zero findings renders no tile at all -
  // every category referenced below must have at least one finding or it
  // would silently drop out of the ordering check.
  it('B9: category tiles render in descending order by count, not the fixed CATEGORY_ORDER', () => {
    // CATEGORY_ORDER is accessibility/seo/rendering/performance/geo - give
    // 'performance' the most findings (the real multi-page symptom: the
    // largest bucket rendered fourth regardless of size) and confirm it
    // now renders first.
    const findings: Finding[] = [
      buildCategoryFinding('accessibility', 1),
      buildCategoryFinding('seo', 1),
      buildCategoryFinding('rendering', 1),
      buildCategoryFinding('geo', 1),
      buildCategoryFinding('performance', 1),
      buildCategoryFinding('performance', 2),
      buildCategoryFinding('performance', 3),
    ];
    const manifest = buildMinimalManifest();

    const html = renderStatistics(getStrings('fr'), 3, 'fr', findings, manifest);
    const labels = [
      'Performance',
      'Accessibilité',
      'Référencement (SEO)',
      'Rendu',
      'Visibilité dans les moteurs d’IA (GEO)',
    ];
    const positions = labels.map((label) => html.indexOf(`>${label}<`));

    expect(positions.every((p) => p !== -1)).toBe(true);
    expect(positions[0]).toBeLessThan(Math.min(...positions.slice(1)));
  });

  it('B9: the WCAG fail-count line carries a heading, not sitting unlabelled', async () => {
    const findings = await loadSmallSiteFindings();
    const manifest = await loadSmallSiteManifest();

    const html = renderStatistics(getStrings('fr'), 3, 'fr', findings, manifest);

    expect(html).toContain('<h5 class="statistics-breakdown-heading">Conformité WCAG</h5>');
  });

  // item 10: "pages avec au moins un constat critique" is already computed
  // live from Finding[] (computeStatistics), so once item 9's severity cap
  // ships, a performance finding whose raw metric only rates "à améliorer"
  // (mid) can no longer inflate this count by contributing a spurious
  // "critical" on every page it appears on.
  it('item 10: a performance finding capped below critical by item 9 does not inflate pagesWithCritical', () => {
    const cappedPerfFinding = buildCategoryFinding('performance', 1);
    const cappedFinding: Finding = {
      ...cappedPerfFinding,
      severity: 'serious',
      pageUrls: ['https://example.com/'],
    };
    const genuineAccessibilityCritical: Finding = {
      ...buildCategoryFinding('accessibility', 1),
      severity: 'critical',
      pageUrls: ['https://example.com/'],
    };
    const manifest = buildMinimalManifest();

    const html = renderStatistics(
      getStrings('en'),
      3,
      'en',
      [cappedFinding, genuineAccessibilityCritical],
      manifest,
    );

    // Exactly 1 page has an (uncapped) critical finding.
    expect(html).toContain('>1</div>');
  });
});

// Issue #77 (Hotel Tandem, audit dcf21a89-824f-4a07-9c3e-2fb08638fe55): the
// tile used to render "N/M" where N (pagesWithCritical, unioned across every
// critical finding regardless of pass or category) could exceed M
// (pagesScanned, content-analysis-completed pages only). The tile must never
// render a fraction.
//
// Issue #80: removing the fraction was not enough - the two counts still sat
// side by side on the same row and could still disagree ("86 pages
// analysées" beside "89 pages avec au moins un constat critique"), because
// pagesWithCritical was never actually confined to the content-checked
// population pagesScanned counts. A finding naming a page outside that
// population (the same #41 pattern) no longer contributes to this tile.
describe('issue #77/#80: pagesWithCritical never renders as a fraction and never exceeds pagesScanned', () => {
  it('confines pagesWithCritical to the content-checked population, dropping a page outside it', () => {
    const siteWideCritical: Finding = {
      ...buildCategoryFinding('performance', 1),
      severity: 'critical',
      // Only the manifest's single visited page is content-checked; the
      // other two are outside that population and must not inflate the tile.
      pageUrls: ['https://example.com/', 'https://example.com/a', 'https://example.com/b'],
    };
    const manifest = buildMinimalManifest();

    const html = renderStatistics(getStrings('en'), 3, 'en', [siteWideCritical], manifest);

    expect(html).not.toMatch(/>\d+\/\d+</);
    expect(html).toContain('>1</div>');
    expect(html).not.toContain('>3</div>');
  });
});

// item 1.8 (Large Rule Families pass): the accessibility-occurrences tile used to
// include alt-text-quality-heuristic occurrences with no caveat, sitting
// beside three genuinely hard counts.
describe('item 1.8: the accessibility-occurrences tile excludes heuristic occurrences, with a footnote when it does', () => {
  it('renders the exclusion footnote and the excluded count when a heuristic finding is present', () => {
    const findings: Finding[] = [
      { ...buildCategoryFinding('accessibility', 1), ruleId: 'image-alt', occurrences: 10 },
      {
        ...buildCategoryFinding('accessibility', 2),
        ruleId: 'alt-text-quality-heuristic',
        occurrences: 74,
      },
    ];
    const manifest = buildMinimalManifest();

    const html = renderStatistics(getStrings('fr'), 3, 'fr', findings, manifest);

    expect(html).toContain('>10</div>');
    expect(html).not.toContain('>84</div>');
    expect(html).toContain('exclut 74 occurrences');
    // Issue #307: the note names the count it qualifies and sits under that
    // tile, not under the distinct-findings tile it was read against.
    expect(html).toContain('accessibilité exclut 74 occurrences');
    expect(html).toContain('class="statistics-note statistics-note-occurrences"');
  });

  it('renders no footnote when there is no heuristic occurrence to exclude', async () => {
    const findings = await loadSmallSiteFindings();
    const manifest = await loadSmallSiteManifest();

    const html = renderStatistics(getStrings('fr'), 3, 'fr', findings, manifest);

    expect(html).not.toContain('exclut');
  });
});

// item 1.10 (Large Rule Families pass): a real report's cover badge read "Élevé"
// off "18/18 pages avec au moins un constat critique", but all 33
// Critique findings reduced to exactly 2 rules (image-alt, button-name)
// that both happen to fire on every page - the "N/N" figure was
// mechanically guaranteed by those two rules alone, not by broad risk.
describe('item 1.10: the critical-findings driver is named when concentrated in a handful of rules', () => {
  function criticalFinding(ruleId: string, index: number): Finding {
    return {
      findingId: `f-${ruleId}-${index}`,
      auditId: 'a1',
      schemaVersion: 1,
      source: 'axe',
      ruleId,
      category: 'accessibility',
      severity: 'critical',
      wcagCriteria: [],
      title:
        ruleId === 'image-alt'
          ? 'Images must have alternate text'
          : 'Buttons must have discernible text',
      description: 'd',
      pageUrls: [`https://example.com/${index}`],
      occurrences: 1,
      elements: [],
      rawEvidence: {},
      dedupeKey: `d-${ruleId}-${index}`,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    };
  }

  it('names the driving rules when every critical finding reduces to 2 rules', () => {
    const findings = [criticalFinding('image-alt', 1), criticalFinding('button-name', 2)];
    const manifest = buildMinimalManifest();

    const html = renderStatistics(getStrings('fr'), 3, 'fr', findings, manifest);

    expect(html).toContain('proviennent uniquement de');
    expect(html).toContain('Les images doivent avoir un texte alternatif');
    expect(html).toContain('Les boutons doivent avoir un texte identifiable');
  });

  it('renders no driver note when critical findings span more than the concentration threshold', async () => {
    const findings = await loadSmallSiteFindings();
    const manifest = await loadSmallSiteManifest();

    const html = renderStatistics(getStrings('fr'), 3, 'fr', findings, manifest);

    // small-site's own critical findings span more than 3 distinct
    // rules (docs/rules/normalization-rules.md section 7); the fixture is used
    // rather than hand-asserting a specific count, so this test does not
    // silently drift if the fixture is ever regenerated with fewer.
    const criticalRuleCount = new Set(
      findings.filter((f) => f.severity === 'critical').map((f) => f.ruleId),
    ).size;
    if (criticalRuleCount > 3) {
      expect(html).not.toContain('proviennent uniquement de');
    }
  });

  it('renders no driver note when there are no critical findings at all', () => {
    const manifest = buildMinimalManifest();
    const html = renderStatistics(getStrings('fr'), 3, 'fr', [], manifest);
    expect(html).not.toContain('proviennent uniquement de');
  });
});

// P1.2 (2026-08-21 Large Rule Families feedback pass): the third-party share of
// accessibility occurrences is the fact that determines who the client
// calls first - it used to be buried on page 21 of 27.
describe('P1.2: the third-party occurrences footnote', () => {
  function buildThirdPartyFinding(index: number): Finding {
    const f = buildCategoryFinding('accessibility', index);
    return {
      ...f,
      elements: [
        { pageUrl: 'https://example.com/', selector: '.gform_wrapper button', snippet: '' },
      ],
    };
  }

  it('renders the percentage when some accessibility occurrences are third-party', () => {
    const manifest = buildMinimalManifest();
    const findings = [buildThirdPartyFinding(1), buildCategoryFinding('accessibility', 2)];
    const html = renderStatistics(getStrings('fr'), 3, 'fr', findings, manifest);

    expect(html).toContain('50 % des occurrences d’accessibilité proviennent de composants tiers');
  });

  it('renders nothing when no accessibility finding is third-party', () => {
    const manifest = buildMinimalManifest();
    const findings = [buildCategoryFinding('accessibility', 1)];
    const html = renderStatistics(getStrings('fr'), 3, 'fr', findings, manifest);

    expect(html).not.toContain('composants tiers');
  });
});
