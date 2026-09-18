import { describe, expect, it } from 'vitest';
import { computeFindingsDelta, type DeltaFinding, type FindingsDeltaRun } from '@odysseus/core';
import { renderFindingsDelta } from './findings-delta.js';
import { renderHtml } from '../render-html.js';
import { findRenderLintViolations } from '../render-lint.js';
import { getStrings } from '../strings/i18n.js';
import { resolveRenderDiffEvidence } from '../../screenshots.js';
import {
  loadSmallSiteAnalysis,
  loadSmallSiteFindings,
  loadSmallSiteManifest,
} from '../../test-fixtures.js';

function finding(
  key: string,
  severity: DeltaFinding['severity'],
  ruleId = 'image-alt',
): DeltaFinding {
  return {
    findingId: `f-${key}`,
    ruleId,
    category: 'accessibility',
    severity,
    title: `Scanner title ${key}`,
    pageUrls: ['https://hotel.fr/', 'https://hotel.fr/rooms'],
    dedupeKey: key,
  };
}

function run(
  auditId: string,
  findings: readonly DeltaFinding[],
  overrides: Partial<FindingsDeltaRun> = {},
) {
  return {
    auditId,
    siteUrl: 'https://hotel.fr/',
    startedAt: '2026-06-03T09:00:00.000Z',
    tool: {
      odysseusVersion: '1.0.0',
      findingsSchemaVersion: 1 as never,
      axeCoreVersion: '4.10.0',
      lighthouseVersion: '12.0.0',
      playwrightVersion: '1.50.0',
      chromiumVersion: '130',
    },
    config: { maxPages: Number.MAX_SAFE_INTEGER, maxDepth: 5 },
    findingsProvenance: {
      findingsSchemaVersion: 1 as never,
      normalizationFingerprint: 'abc',
      findingsDigest: `sha256:${auditId}`,
    },
    findings,
    ...overrides,
  } satisfies FindingsDeltaRun;
}

const baseline = run('before', [
  finding('fixed', 'critical', 'color-contrast'),
  finding('moved', 'moderate', 'link-name'),
  finding('kept-1', 'minor'),
  finding('kept-2', 'minor', 'label'),
]);
const current = run('after', [
  finding('added', 'serious', 'button-name'),
  finding('moved', 'serious', 'link-name'),
  finding('kept-1', 'minor'),
  finding('kept-2', 'minor', 'label'),
]);

describe('renderFindingsDelta', () => {
  it('renders the counts, the new, changed and resolved tables, and the persistent note in French', () => {
    const html = renderFindingsDelta(
      getStrings('fr'),
      2,
      'fr',
      computeFindingsDelta(baseline, current),
    );

    expect(html).toContain('id="section-16"');
    expect(html).toContain('3 juin 2026');
    expect(html).toContain('Nouveaux constats');
    expect(html).toContain('Constats dont la gravité a changé');
    expect(html).toContain('Constats plus détectés');
    expect(html).toContain('button-name');
    expect(html).toContain('color-contrast');
    expect(html).toContain('2 constats relevés lors du précédent audit le sont toujours');
    expect(html).not.toContain('Versions des outils');
    expect(findRenderLintViolations(html)).toEqual([]);
  });

  it('suppresses the changed-severity class and lists version changes when a tool changed', () => {
    const delta = computeFindingsDelta(
      baseline,
      run('after', current.findings, {
        tool: { ...current.tool, axeCoreVersion: null },
        config: { maxPages: 50, maxDepth: 5 },
      }),
    );
    const html = renderFindingsDelta(getStrings('en'), 2, 'en', delta);

    expect(html).not.toContain('Severity changed');
    expect(html).not.toContain('Findings whose severity changed');
    expect(html).toContain('counted as still present');
    expect(html).toContain('axe-core: 4.10.0 in the previous audit, unavailable in this audit.');
    expect(html).toContain('changed from no limit to 50');
    expect(html).toContain('3 findings from the previous audit are still present');
    expect(findRenderLintViolations(html)).toEqual([]);
  });

  it('says nothing changed when both runs hold the same findings', () => {
    const delta = computeFindingsDelta(
      run('before', [finding('kept', 'minor')]),
      run('after', [finding('kept', 'minor')]),
    );
    const html = renderFindingsDelta(getStrings('en'), 2, 'en', delta);
    expect(html).toContain('No finding appeared, disappeared or changed severity');
    expect(html).toContain('1 finding from the previous audit is still present');
    expect(html).not.toContain('<table');
  });

  it('renders newly observable findings as their own table, never as new', () => {
    const mobile = 'https://hotel.fr/m';
    const before = run('before', [finding('kept', 'minor')], {
      coverage: {
        version: 'findings-delta-coverage-v1',
        capabilityRegistryVersion: 'unknown-legacy',
        surfaces: ['baseline-desktop', 'surface:site-request'],
      },
    });
    const after = run(
      'after',
      [finding('kept', 'minor'), finding('mobile-only', 'critical', 'image-alt')],
      {
        coverage: {
          version: 'findings-delta-coverage-v1',
          capabilityRegistryVersion: 'cap-v1',
          surfaces: ['baseline-desktop', 'surface:site-request', 'mobile'],
          observations: {
            kept: { checkId: 'axe', surfaceId: 'baseline-desktop' },
            'mobile-only': { checkId: 'axe', surfaceId: 'mobile' },
          },
        },
      },
    );
    const delta = computeFindingsDelta(before, {
      ...after,
      findings: after.findings.map((f) =>
        f.dedupeKey === 'mobile-only' ? { ...f, pageUrls: [mobile] } : f,
      ),
    });
    const html = renderFindingsDelta(getStrings('fr'), 2, 'fr', delta);

    expect(delta.rows.find((row) => row.dedupeKey === 'mobile-only')?.class).toBe(
      'newly-observable',
    );
    expect(html).toContain('Constats rendus observables');
    /* The rendered copy goes through the French typographic apostrophe. */
    expect(html).toContain('Ces constats ne pouvaient pas être relevés');
    expect(html).toContain('Rendus observables');
  });

  it('renders not-comparable findings as their own table, never as resolved', () => {
    const before = run(
      'before',
      [finding('kept', 'minor'), finding('gone', 'critical', 'color-contrast')],
      {
        coverage: {
          version: 'findings-delta-coverage-v1',
          capabilityRegistryVersion: 'cap-v1',
          surfaces: ['baseline-desktop'],
          checks: [
            {
              checkId: 'axe',
              version: '1',
              surfaces: ['baseline-desktop'],
              frameCapability: 'document-only',
              semanticallyConditional: false,
            },
          ],
          observations: {
            kept: { checkId: 'axe', surfaceId: 'baseline-desktop' },
            gone: { checkId: 'axe', surfaceId: 'baseline-desktop' },
          },
        },
      },
    );
    const after = run('after', [finding('kept', 'minor')], {
      coverage: {
        version: 'findings-delta-coverage-v1',
        capabilityRegistryVersion: 'cap-v1',
        surfaces: ['baseline-desktop'],
        checks: [],
        observations: {},
      },
    });
    const delta = computeFindingsDelta(before, after);
    const html = renderFindingsDelta(getStrings('en'), 2, 'en', delta);

    expect(delta.rows.find((row) => row.dedupeKey === 'gone')?.class).toBe('not-comparable');
    expect(html).toContain('Findings that cannot be compared');
    expect(html).toContain(
      'This audit cannot settle these findings: the check or the surface involved was not comparable between the two audits',
    );
    expect(html).toContain('Not comparable');
  });

  it('shows only the four shipped counters for a legacy comparison without coverage', () => {
    const delta = computeFindingsDelta(baseline, current);
    expect(delta.coverage).toBeUndefined();
    const html = renderFindingsDelta(getStrings('en'), 2, 'en', delta);
    expect(html).toContain('New findings');
    expect(html).not.toContain('Newly observable');
    expect(html).not.toContain('Not comparable');
  });
});

describe('findings delta in the composed report', () => {
  it('adds section-16 after the executive summary only when a delta is passed', async () => {
    const manifest = await loadSmallSiteManifest();
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('fr');
    const { pages: renderDiffEvidencePages } = resolveRenderDiffEvidence(manifest, findings);

    const without = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages });
    expect(without).not.toContain('id="section-16"');

    const html = await renderHtml({
      manifest,
      findings,
      analysis,
      renderDiffEvidencePages,
      delta: computeFindingsDelta(baseline, current),
    });
    const ids = [...html.matchAll(/<section class="sheet[^"]*" id="(section-[^"]+)">/g)].map(
      (match) => match[1],
    );
    expect(ids.indexOf('section-16')).toBe(ids.indexOf('section-01') + 1);
    expect(html).toContain('Évolution depuis le précédent audit');
    expect(findRenderLintViolations(html)).toEqual([]);
  });
});
